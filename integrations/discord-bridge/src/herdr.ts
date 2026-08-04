import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { DispatchTarget, DiscordBridgeConfig, InboundRequest } from "./types.js";

const execFileAsync = promisify(execFile);
export const RAW_COMPLETION_REGEX = "^\\s*SANDORA_DEPARTMENT_DONE_[A-Z0-9]+\\s*$";

export function rawCompletionMarker(requestId: string): string {
  const suffix = requestId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase();
  if (!suffix) throw new Error("Raw completion marker requires an alphanumeric request ID");
  return `SANDORA_DEPARTMENT_DONE_${suffix}`;
}

export interface HerdrDispatchResult {
  stdout: string;
  stderr: string;
}

export class HerdrPromptAmbiguousError extends Error {
  readonly submissionMayHaveOccurred = true;
  readonly boundedOutput?: string;
  readonly recordedFallback?: string;

  constructor(
    cause: unknown,
    evidence?: { boundedOutput?: string; recordedFallback?: string },
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Herdr prompt outcome is ambiguous; automatic replay is disabled: ${detail}`);
    this.name = "HerdrPromptAmbiguousError";
    this.cause = cause;
    this.boundedOutput = evidence?.boundedOutput;
    this.recordedFallback = evidence?.recordedFallback;
  }
}

export function assertHerdrEnvironment(environment = process.env): void {
  if (environment.HERDR_ENV !== "1") {
    throw new Error("Discord bridge must run from a Herdr-managed pane (HERDR_ENV=1)");
  }
  for (const name of ["HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID"]) {
    if (!environment[name]) {
      throw new Error(`${name} is required in the bridge pane`);
    }
  }
}

export function sanitizedChildEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const { DISCORD_BOT_TOKEN: _removedToken, ...sanitized } = environment;
  return sanitized;
}

export function buildCeoPrompt(
  request: InboundRequest,
  inboxPath: string,
  repositoryRoot: string,
): string {
  const relativeInboxPath = path.relative(repositoryRoot, inboxPath).replaceAll("\\", "/");
  const replyChannel = request.replyChannel ?? "ceo-office";

  return [
    "[DISCORD_TASK]",
    `request_id: ${request.id}`,
    `source_record: ${relativeInboxPath}`,
    `reply_channel: ${replyChannel}`,
    "",
    "A verified Owner message was admitted by the Discord bridge.",
    "Read docs/operations/DISCORD_BRIDGE.md and the source record, then process the request under normal CEO authority and approval boundaries.",
    "Use Herdr-only peer sessions when delegation materially helps.",
    "The bridge already sent a receipt acknowledgement, so do not send a duplicate acknowledgement.",
    "Before stopping, create at least one durable outbox message for the Owner using the documented outbox command. Use kind final for a completed answer, update for meaningful progress, approval when Owner authorization is required, or error when the request cannot proceed.",
  ].join("\n");
}

export function buildDepartmentPrompt(
  request: InboundRequest,
  inboxPath: string,
  repositoryRoot: string,
  config: DiscordBridgeConfig,
  assignedAgent: string,
): string {
  if (request.department === "ceo" && assignedAgent === config.departments.ceo.leadAgent) {
    return buildCeoPrompt(request, inboxPath, repositoryRoot);
  }
  const relativeInboxPath = path.relative(repositoryRoot, inboxPath).replaceAll("\\", "/");
  const department = config.departments[request.department];
  const role = assignedAgent === department.leadAgent ? "department lead" : "bounded worker";
  return [
    "[DISCORD_DEPARTMENT_TASK]",
    `request_id: ${request.id}`,
    `department: ${request.department}`,
    `assigned_agent: ${assignedAgent}`,
    `role: ${role}`,
    `source_record: ${relativeInboxPath}`,
    `reply_channel: ${request.replyChannel ?? department.channel}`,
    `department_profile: ${department.profilePath}`,
    "",
    "A verified Owner message was admitted by the Discord bridge.",
    "Read identity.md, docs/operations/DISCORD_BRIDGE.md, the department profile, and the source record.",
    "Handle bounded specialist work directly. Escalate cross-functional, approval-gated, destructive, production, credential, financial-commitment, or governance work to ceo.",
    role === "bounded worker"
      ? `You report to ${department.leadAgent}, own only this request, must not claim lead/CEO authority, and must not create agents. Write a durable artifact, then run the documented handoff command back to ${request.department}; do not post an unreviewed final directly to Discord.`
      : "You are the stable department lead for this request and report to ceo. Use the documented handoff command when another department or ceo must own the next step.",
    "The bridge already acknowledged receipt. Do not send another acknowledgement.",
    role === "bounded worker"
      ? `Before stopping, run: npm --prefix integrations/discord-bridge run handoff -- --parent-request-id ${request.id} --to ${request.department} --from ${assignedAgent} --summary <bounded-summary> --artifact <repository-relative-path>`
      : "Before stopping, enqueue at least one durable outbox final, approval, or error message to the documented reply channel. Keep claims evidence-based.",
  ].join("\n");
}

export class HerdrDispatcher {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly config: DiscordBridgeConfig,
    private readonly repositoryRoot: string,
  ) {}

  enqueue(
    request: InboundRequest,
    inboxPath: string,
    target: DispatchTarget,
    onPromptStarting: () => void,
  ): Promise<void> {
    const run = async () => {
      let prompt = buildDepartmentPrompt(
        request,
        inboxPath,
        this.repositoryRoot,
        this.config,
        target.agentName,
      );
      if (target.control === "raw") {
        const marker = rawCompletionMarker(request.id);
        prompt = `${prompt}\n${rawCompletionInstruction(request.id)}`;
        await this.dispatchRaw(target, prompt, marker, onPromptStarting);
      } else {
        await this.dispatchCanonical(target.agentName, prompt, onPromptStarting);
      }
    };
    const queue = this.queues.get(target.agentName) ?? Promise.resolve();
    const result = queue.then(run, run);
    this.queues.set(target.agentName, result.catch(() => undefined));
    return result;
  }

  private async dispatchCanonical(
    assignedAgent: string,
    prompt: string,
    onPromptStarting: () => void,
  ): Promise<HerdrDispatchResult> {
    const sanitizedEnvironment = sanitizedChildEnvironment();
    await execFileAsync(
      "herdr",
      [
        "agent",
        "wait",
        assignedAgent,
        "--until",
        "idle",
        "--until",
        "done",
        "--timeout",
        String(this.config.herdrTimeoutMs),
      ],
      {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: this.config.herdrTimeoutMs + 30_000,
        windowsHide: true,
        env: sanitizedEnvironment,
      },
    );

    // Persist the non-replayable boundary immediately before invoking the prompt.
    // If persistence fails, the prompt is not started and a retry remains safe.
    onPromptStarting();
    try {
      const { stdout, stderr } = await execFileAsync(
        "herdr",
        [
          "agent",
          "prompt",
          assignedAgent,
          prompt,
          "--wait",
          "--until",
          "idle",
          "--until",
          "done",
          "--until",
          "blocked",
          "--timeout",
          String(this.config.herdrTimeoutMs),
        ],
        {
          cwd: this.repositoryRoot,
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
          timeout: this.config.herdrTimeoutMs + 30_000,
          windowsHide: true,
          env: sanitizedEnvironment,
        },
      );
      return { stdout, stderr };
    } catch (error) {
      // Once `agent prompt` starts, a timeout or transport error cannot prove the
      // prompt was not accepted. Replaying automatically could execute Owner work twice.
      throw new HerdrPromptAmbiguousError(error);
    }
  }

  private async dispatchRaw(
    target: DispatchTarget,
    prompt: string,
    completionMarker: string,
    onPromptStarting: () => void,
  ): Promise<HerdrDispatchResult> {
    if (!target.paneId) throw new Error(`Raw worker ${target.agentName} has no pane ID`);
    const environment = sanitizedChildEnvironment();
    onPromptStarting();
    try {
      await execFileAsync("herdr", ["pane", "send-text", target.paneId, prompt], {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
        env: environment,
      });
      await execFileAsync("herdr", ["pane", "send-keys", target.paneId, "enter"], {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
        env: environment,
      });
      await execFileAsync(
        "herdr",
        [
          "pane",
          "wait-output",
          target.paneId,
          "--regex",
          `^\\s*${completionMarker}\\s*$`,
          "--timeout",
          String(this.config.herdrTimeoutMs),
        ],
        {
          cwd: this.repositoryRoot,
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          timeout: this.config.herdrTimeoutMs + 30_000,
          windowsHide: true,
          env: environment,
        },
      );
      const { stdout, stderr } = await execFileAsync(
        "herdr",
        ["pane", "read", target.paneId, "--source", "recent-unwrapped", "--lines", "120"],
        {
          cwd: this.repositoryRoot,
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
          timeout: 30_000,
          windowsHide: true,
          env: environment,
        },
      );
      return { stdout, stderr };
    } catch (error) {
      let boundedOutput: string | undefined;
      try {
        const { stdout } = await execFileAsync(
          "herdr",
          ["pane", "read", target.paneId, "--source", "recent-unwrapped", "--lines", "120"],
          {
            cwd: this.repositoryRoot,
            encoding: "utf8",
            maxBuffer: 4 * 1024 * 1024,
            timeout: 30_000,
            windowsHide: true,
            env: environment,
          },
        );
        boundedOutput = stdout.slice(-100_000);
      } catch {
        boundedOutput = "Raw pane output could not be captured.";
      }
      throw new HerdrPromptAmbiguousError(error, {
        boundedOutput,
        recordedFallback: target.fallback,
      });
    }
  }
}

export function rawCompletionInstruction(requestId = "request"): string {
  const suffix = requestId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase();
  return `After the durable outbox command succeeds, print one final line made by joining SANDORA, DEPARTMENT, DONE, and the final alphanumeric request suffix ${suffix} with underscore characters. Do not print that line earlier.`;
}
