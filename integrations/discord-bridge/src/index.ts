import { randomUUID } from "node:crypto";
import {
  Client,
  Events,
  GatewayIntentBits,
  type Message,
} from "discord.js";
import { requestFromDiscordMessage } from "./admission.js";
import { resolveAttachmentPaths } from "./attachments.js";
import { loadBridgeConfig, loadScheduleConfig, requireBotToken } from "./config.js";
import { EventPublisher, redactEventText } from "./events.js";
import { HerdrDepartmentTabManager } from "./department-tabs.js";
import {
  HerdrDispatcher,
  HerdrPromptAmbiguousError,
  assertHerdrEnvironment,
} from "./herdr.js";
import { formatOutbound, splitDiscordMessage } from "./message.js";
import { PersonaWebhookSender } from "./personas.js";
import { repositoryRoot, workspaceRoot } from "./paths.js";
import { startSchedules } from "./scheduler.js";
import { WorkspaceStore } from "./store.js";
import {
  CliSupervisorControl,
  DepartmentSupervisor,
  type Assignment,
} from "./supervisor.js";
import type {
  ChannelName,
  DepartmentName,
  InboundRequest,
  InboundState,
  OutboundMessage,
} from "./types.js";

const config = loadBridgeConfig();
const schedules = loadScheduleConfig();
const token = requireBotToken();
delete process.env.DISCORD_BOT_TOKEN;
assertHerdrEnvironment();

const store = new WorkspaceStore(workspaceRoot);
store.ensure();
store.acquireBridgeLock();
const dispatcher = new HerdrDispatcher(config, repositoryRoot);
const eventPublisher = new EventPublisher(store);
const supervisorControl = new CliSupervisorControl(repositoryRoot);
const departmentPanes = new HerdrDepartmentTabManager(
  repositoryRoot,
  config.departmentTabLabel,
);
const supervisor = new DepartmentSupervisor(
  config,
  store,
  eventPublisher,
  supervisorControl,
  departmentPanes,
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const personaSender = new PersonaWebhookSender(config, repositoryRoot, () => client.user?.id);

let outboxBusy = false;
let shuttingDown = false;
const activeOperations = new Set<Promise<unknown>>();
const activeRequestIds = new Set<string>();

function track<T>(operation: Promise<T>): Promise<T> {
  activeOperations.add(operation);
  operation.finally(() => activeOperations.delete(operation)).catch(() => undefined);
  return operation;
}

function retryDelay(attempts: number): number {
  return Math.min(5 * 60_000, 2 ** Math.max(0, attempts - 1) * 5_000);
}

function normalizeLegacyRequest(request: InboundRequest): InboundRequest {
  if (request.department && config.departments[request.department]) return request;
  const match = (Object.entries(config.departments) as [DepartmentName, typeof config.departments[DepartmentName]][])
    .find(([, department]) => department.channel === request.channel);
  const department = match?.[0] ?? "ceo";
  const target = config.departments[department];
  return {
    ...request,
    department,
    targetAgent: target.leadAgent,
    replyChannel: request.replyChannel ?? request.channel ?? target.channel,
  };
}

function enqueueCompletionReport(
  request: InboundRequest,
  assignment: Assignment,
): void {
  const department = config.departments[request.department];
  const resultChannel = request.replyChannel ?? department.channel;
  store.enqueueOutbound({
    id: randomUUID(),
    requestId: request.id,
    createdAt: new Date().toISOString(),
    channel: department.channel,
    kind: "report",
    author: department.leadAgent,
    content: [
      "✅ TASK DONE REPORT",
      `Department: ${department.displayName}`,
      `Agent: ${assignment.agentName}`,
      `Request: ${request.id}`,
      `Runtime: ${assignment.runtime} · ${assignment.model}`,
      `Result delivered to: #${resultChannel}`,
    ].join("\n"),
  });
}

async function sendToChannel(channel: ChannelName, content: string): Promise<void> {
  const target = await client.channels.fetch(config.channels[channel]);
  if (!target?.isSendable()) {
    throw new Error(`Configured channel ${channel} is not sendable by the bot`);
  }
  for (const chunk of splitDiscordMessage(content)) {
    await target.send({ content: chunk, allowedMentions: { parse: [] } });
  }
}

async function drainOutbox(): Promise<void> {
  if (outboxBusy || !client.isReady()) return;
  outboxBusy = true;
  try {
    for (const pending of store.listPending()) {
      const delivery = pending.message.delivery ?? { attempts: 0, nextChunk: 0 };
      if (delivery.nextAttemptAt && new Date(delivery.nextAttemptAt) > new Date()) continue;
      try {
        const target = await client.channels.fetch(config.channels[pending.message.channel]);
        if (!target?.isSendable()) {
          throw new Error(
            `Configured channel ${pending.message.channel} is not sendable by the bot`,
          );
        }
        const persona = config.personas[pending.message.author];
        const chunks = splitDiscordMessage(
          persona
            ? pending.message.content
            : formatOutbound(pending.message.author, pending.message.content),
        );
        const files = resolveAttachmentPaths(repositoryRoot, pending.message.attachments);
        for (let index = delivery.nextChunk; index < chunks.length; index += 1) {
          const payload = {
            content: chunks[index],
            files: index === 0 ? files : [],
            allowedMentions: { parse: [] as never[] },
          };
          const sentAsPersona = personaSender.supports(target)
            ? await personaSender.send(target, pending.message.author, payload)
            : false;
          if (!sentAsPersona) await target.send(payload);
          pending.message.delivery = {
            attempts: delivery.attempts,
            nextChunk: index + 1,
          };
          store.updatePending(pending.path, pending.message);
        }
        store.markSent(pending.path);
        if (
          !["agent-activity", "system-log"].includes(pending.message.channel) &&
          ["update", "final", "report", "approval", "error"].includes(pending.message.kind)
        ) {
          try {
            const resultRequest = store.readInbound(pending.message.requestId);
            eventPublisher.publish({
              level: pending.message.kind === "error" ? "error" : "activity",
              code: "result.delivered",
              department: resultRequest?.department,
              requestId: pending.message.requestId,
              actor: pending.message.author,
              summary: `${pending.message.author} delivered a ${pending.message.kind} result to #${pending.message.channel}`,
              detail: redactEventText(pending.message.content),
            });
          } catch (eventError) {
            console.error(
              `[discord-bridge] result mirror failed: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
            );
          }
        }
        if (
          !["agent-activity", "system-log"].includes(pending.message.channel) &&
          ["final", "report", "approval", "error"].includes(pending.message.kind)
        ) {
          store.markInboundDelivered(pending.message.requestId);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const attempts = delivery.attempts + 1;
        if (attempts >= config.maxDeliveryAttempts) {
          store.markFailed(pending.path, reason);
          if (!["system-log", "agent-activity"].includes(pending.message.channel)) {
            eventPublisher.publish({
              level: "error",
              code: "outbox.failed",
              requestId: pending.message.requestId,
              summary: `Outbound delivery failed permanently after ${attempts} attempts`,
              detail: "Inspect the local failed outbox record",
            });
          } else {
            console.error(
              `[discord-bridge] Observability delivery failed for ${pending.message.id}`,
            );
          }
        } else {
          pending.message.delivery = {
            attempts,
            nextChunk: pending.message.delivery?.nextChunk ?? delivery.nextChunk,
            nextAttemptAt: new Date(Date.now() + retryDelay(attempts)).toISOString(),
            lastError: reason,
          };
          store.updatePending(pending.path, pending.message);
        }
      }
    }
  } finally {
    outboxBusy = false;
  }
}

async function admitAndDispatch(request: InboundRequest): Promise<void> {
  if (activeRequestIds.has(request.id)) return;
  const inboxPath = store.admitInbound(request);
  const existingState = store.readInboundState(request.id);
  if (
    existingState?.status === "completed" ||
    existingState?.status === "delivered" ||
    existingState?.status === "settled" ||
    existingState?.status === "failed"
  ) return;
  activeRequestIds.add(request.id);
  let assignment: Assignment | undefined;
  let uncertainAssignmentError: string | undefined;
  try {
    let dispatchState: InboundState | undefined;
    let replayUnsafe = false;
    try {
      if (existingState?.status === "admitted") {
        eventPublisher.publish({
          level: "activity",
          code: "task.accepted",
          department: request.department,
          requestId: request.id,
          actor: request.targetAgent,
          summary: `${config.departments[request.department].displayName} admitted the request`,
        });
      }
      assignment = await supervisor.assign(request);
      store.markInboundAssigned(request, assignment.agentName, assignment);
      eventPublisher.publish({
        level: "activity",
        code: "task.assigned",
        department: request.department,
        requestId: request.id,
        actor: assignment.agentName,
        summary: `${config.departments[request.department].displayName} assigned the task`,
        detail: `${assignment.runtime} · ${assignment.model} · ${assignment.control}`,
      });
      dispatchState = store.markInboundDispatching(request.id);
      await dispatcher.enqueue(request, inboxPath, assignment, () => {
        store.markInboundSubmitted(request.id, "Herdr prompt invocation started");
        replayUnsafe = true;
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (replayUnsafe || error instanceof HerdrPromptAmbiguousError) {
        uncertainAssignmentError = reason;
        if (!replayUnsafe) {
          store.markInboundSubmitted(request.id, reason);
        }
        if (error instanceof HerdrPromptAmbiguousError && error.boundedOutput) {
          const evidencePath = store.writeRecoveryEvidence(
            request.id,
            error.boundedOutput,
          );
          store.recordRecoveryEvidence(
            request.id,
            evidencePath,
            error.recordedFallback ?? assignment?.fallback,
          );
        }
        eventPublisher.publish({
          level: "warning",
          code: "dispatch.ambiguous",
          department: request.department,
          requestId: request.id,
          actor: assignment?.agentName,
          summary: "Prompt may have been submitted; automatic replay is disabled",
          detail: reason,
        });
      } else if ((dispatchState?.attempts ?? 1) >= config.maxDispatchAttempts) {
        store.markInboundFailed(request.id, reason);
        store.enqueueOutbound({
          id: randomUUID(),
          requestId: request.id,
          createdAt: new Date().toISOString(),
          channel: request.replyChannel ?? config.defaultOutboundChannel,
          kind: "error",
          author: "Sandora Bridge",
          content: `Dispatch failed after ${dispatchState?.attempts ?? 1} attempts. The request remains in the durable inbox for manual recovery.`,
        });
      } else {
        const retryState = store.markInboundRetry(
          request.id,
          reason,
          retryDelay(dispatchState?.attempts ?? 1),
        );
        eventPublisher.publish({
          level: "warning",
          code: "dispatch.retry",
          department: request.department,
          requestId: request.id,
          actor: assignment?.agentName,
          summary: `Dispatch will retry (${retryState.attempts}/${config.maxDispatchAttempts})`,
          detail: "Inspect local diagnostics if the changed condition does not recover",
        });
      }
      return;
    }

    if (!store.hasDurableOutcome(request.id)) {
      uncertainAssignmentError = "agent-settled-without-durable-outcome";
      store.markInboundObserved(
        request.id,
        "blocked",
        "agent-settled-without-durable-outcome",
      );
      eventPublisher.publish({
        level: "warning",
        code: "outcome.missing",
        department: request.department,
        requestId: request.id,
        actor: assignment.agentName,
        summary: "Agent settled without a durable outbox result or handoff",
        detail: "Assigned pane preserved for evidence inspection",
      });
      return;
    }

    try {
      store.markInboundSettled(request.id);
      if (store.hasDeliveredOutcome(request.id)) {
        store.markInboundDelivered(request.id);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // The durable state is already `submitted`; never route this write failure
      // through the retry branch after CEO execution may have started.
      eventPublisher.publish({
        level: "error",
        code: "state.persist_failed",
        department: request.department,
        requestId: request.id,
        actor: assignment.agentName,
        summary: "Agent completed, but request completion could not be persisted",
        detail: reason,
      });
    }
    eventPublisher.publish({
      level: "activity",
      code: "task.completed",
      department: request.department,
      requestId: request.id,
      actor: assignment.agentName,
      summary: `${config.departments[request.department].displayName} completed the agent turn`,
    });
    try {
      enqueueCompletionReport(request, assignment);
    } catch (error) {
      eventPublisher.publish({
        level: "warning",
        code: "completion_report.failed",
        department: request.department,
        requestId: request.id,
        actor: assignment.agentName,
        summary: "Task completed, but the department completion report could not be queued",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    if (assignment) {
      await supervisor
        .release(request, assignment, uncertainAssignmentError)
        .catch((error) => {
          eventPublisher.publish({
            level: "warning",
            code: "agent.release_failed",
            department: request.department,
            requestId: request.id,
            actor: assignment?.agentName,
            summary: "Agent cleanup needs recovery",
            detail: error instanceof Error ? error.message : String(error),
          });
        });
    }
    activeRequestIds.delete(request.id);
  }
}

async function recoverInbox(): Promise<void> {
  if (shuttingDown) return;
  for (const request of store.listRecoverableInbound()) {
    const normalized = normalizeLegacyRequest(request);
    if (!activeRequestIds.has(normalized.id)) {
      void track(admitAndDispatch(normalized));
    }
  }
}

async function recoverAmbiguousInbox(): Promise<void> {
  if (shuttingDown) return;
  for (const request of store.listAmbiguousInbound()) {
    const normalized = normalizeLegacyRequest(request);
    if (activeRequestIds.has(normalized.id)) continue;
    const state = store.readInboundState(normalized.id);
    if (!state) continue;
    if (store.hasDurableOutcome(normalized.id)) {
      store.markInboundSettled(normalized.id);
      eventPublisher.publish({
        level: "info",
        code: "request.recovered",
        department: normalized.department,
        requestId: normalized.id,
        actor: state.assignedAgent,
        summary: "Durable outcome found; request marked completed without replay",
      });
      continue;
    }
    const live = state.assignedAgent
      ? await supervisor.inspectRegisteredAgent(state.assignedAgent).catch(() => undefined)
      : undefined;
    if (live?.status === "working" || live?.status === "blocked") {
      store.markInboundObserved(
        normalized.id,
        live.status,
        live.status === "blocked" ? "Agent requires attention" : undefined,
      );
      continue;
    }
    if (state.lastError === "manual-recovery-needed") continue;
    store.markInboundObserved(normalized.id, "blocked", "manual-recovery-needed");
    eventPublisher.publish({
      level: "warning",
      code: "request.manual_recovery",
      department: normalized.department,
      requestId: normalized.id,
      actor: state.assignedAgent,
      summary: "No durable outcome or active agent was found; automatic replay remains disabled",
      detail: "Inspect the assigned pane and local request record",
    });
  }
}

client.once(Events.ClientReady, (readyClient) => {
  void track((async () => {
    try {
      const leads = config.departmentRoutingEnabled
        ? await supervisor.reconcileLeads()
        : [];
      const onlineLeads = leads.filter((lead) =>
        ["idle", "warm", "working"].includes(lead.lifecycle),
      );
      const startupHealthy = onlineLeads.some((lead) => lead.name === "ceo");
      store.writeRuntimeStatus({
        status: startupHealthy ? "ready" : "degraded",
        readyAt: new Date().toISOString(),
        discordUser: readyClient.user.tag,
        guildId: config.guildId,
        departmentRoutingEnabled: config.departmentRoutingEnabled,
        availableLeads: onlineLeads.map((lead) => lead.name),
        unavailableLeads: leads
          .filter((lead) => !onlineLeads.includes(lead))
          .map((lead) => ({ name: lead.name, lifecycle: lead.lifecycle })),
        enabledSchedules: schedules.jobs.filter((job) => job.enabled).map((job) => job.name),
      });
      eventPublisher.publish({
        level: startupHealthy ? "info" : "warning",
        code: startupHealthy ? "bridge.ready" : "bridge.degraded",
        summary: config.demandDrivenDepartments
          ? `Discord connected - CEO ready - ${onlineLeads.filter((lead) => lead.name !== "ceo").length} departments warm`
          : `Discord connected - ${onlineLeads.length}/6 leads available`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[discord-bridge] Department startup degraded: ${reason}`);
      store.writeRuntimeStatus({
        status: "degraded",
        readyAt: new Date().toISOString(),
        discordUser: readyClient.user.tag,
        guildId: config.guildId,
        reason,
      });
      eventPublisher.publish({
        level: "error",
        code: "startup.degraded",
        summary: "Discord connected, but lead reconciliation failed",
        detail: reason,
      });
    }
    await recoverInbox();
    await recoverAmbiguousInbox();
  })());
});

async function handleOwnerMessage(message: Message): Promise<void> {
  const request = requestFromDiscordMessage(message, config);
  if (!request || store.hasInbound(request.id)) return;

  try {
    store.admitInbound(request);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    eventPublisher.publish({
      level: "error",
      code: "inbound.persist_failed",
      summary: "Inbound request could not be persisted; nothing was dispatched",
      detail: reason,
    });
    await message.reply({
      content: "I could not durably admit this request. Nothing was dispatched. Check #system-log.",
      allowedMentions: { repliedUser: false },
    }).catch(() => undefined);
    return;
  }

  await message.reply({
    content: `${config.departments[request.department].displayName} received request \`${request.id}\`. Material progress and the final result will return here.`,
    allowedMentions: { repliedUser: false },
  }).catch(() => undefined);
  await admitAndDispatch(request);
}

client.on(Events.MessageCreate, (message) => {
  void track(handleOwnerMessage(message));
});

const scheduledTasks = startSchedules(schedules, config, (request) =>
  track(admitAndDispatch(request)),
);
const outboxTimer = setInterval(() => void track(drainOutbox()), config.outboxPollMs);
const inboxRetryTimer = setInterval(
  () => void track(recoverInbox()),
  config.inboxRetryPollMs,
);
const ambiguousRecoveryTimer = setInterval(
  () => void track(recoverAmbiguousInbox()),
  Math.max(config.inboxRetryPollMs, 30_000),
);
const departmentSweepTimer = setInterval(
  () => void track(supervisor.sweepExpired()),
  config.departmentSweepMs,
);

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(outboxTimer);
  clearInterval(inboxRetryTimer);
  clearInterval(ambiguousRecoveryTimer);
  clearInterval(departmentSweepTimer);
  for (const task of scheduledTasks) task.stop();
  await Promise.race([
    Promise.allSettled([...activeOperations]),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  store.writeRuntimeStatus({ status: "stopped", signal, stoppedAt: new Date().toISOString() });
  client.destroy();
  store.releaseBridgeLock();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(token);
