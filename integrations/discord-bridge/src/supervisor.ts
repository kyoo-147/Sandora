import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DepartmentPaneManager, DepartmentPanePlacement } from "./department-tabs.js";
import type { EventPublisher } from "./events.js";
import {
  decideParallelSafety,
  selectDepartmentRoute,
  selectWorkerRoute,
  type WorkerRoute,
} from "./runtime-routing.js";
import type { WorkspaceStore } from "./store.js";
import type {
  AgentLifecycle,
  AgentRegistryEntry,
  DepartmentConfig,
  DepartmentName,
  DispatchTarget,
  DiscordBridgeConfig,
  InboundRequest,
} from "./types.js";

const execFileAsync = promisify(execFile);

class PaneCleanupError extends Error {
  constructor(paneId: string, startupError: unknown, cleanupError: unknown) {
    super(`Raw startup failed and pane ${paneId} cleanup failed; refusing fallback`, {
      cause: new AggregateError([startupError, cleanupError]),
    });
    this.name = "PaneCleanupError";
  }
}

export interface LiveAgent {
  name?: string;
  paneId: string;
  status: string;
}

export interface SupervisorControl {
  getAgent(name: string): Promise<LiveAgent | undefined>;
  renameAgent(paneId: string, name: string): Promise<LiveAgent>;
  startAgent(name: string, model: string, paneId?: string): Promise<LiveAgent>;
  startRawWorker(
    name: string,
    runtime: "cmdc" | "agy",
    model: string,
    paneId?: string,
  ): Promise<LiveAgent>;
  inspectPane(paneId: string): Promise<LiveAgent | undefined>;
  closePane(paneId: string): Promise<void>;
}

function childEnvironment(): NodeJS.ProcessEnv {
  const { DISCORD_BOT_TOKEN: _token, ...environment } = process.env;
  return environment;
}

function parseAgent(payload: string): LiveAgent {
  const parsed = JSON.parse(payload) as { result?: { agent?: Record<string, unknown> } };
  const agent = parsed.result?.agent;
  const paneId = String(agent?.pane_id ?? "");
  if (!paneId) throw new Error("Herdr response did not include a pane_id");
  return {
    name: typeof agent?.name === "string" ? agent.name : undefined,
    paneId,
    status: String(agent?.agent_status ?? "unknown"),
  };
}

export class CliSupervisorControl implements SupervisorControl {
  constructor(
    private readonly repositoryRoot: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async getAgent(name: string): Promise<LiveAgent | undefined> {
    try {
      const { stdout } = await execFileAsync("herdr", ["agent", "get", name], this.options());
      return parseAgent(String(stdout));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes("agent_not_found") || detail.includes("not found")) return undefined;
      throw error;
    }
  }

  async renameAgent(paneId: string, name: string): Promise<LiveAgent> {
    const { stdout } = await execFileAsync(
      "herdr",
      ["agent", "rename", paneId, name],
      this.options(),
    );
    return parseAgent(String(stdout));
  }

  async startAgent(name: string, model: string, suppliedPaneId?: string): Promise<LiveAgent> {
    const paneId = suppliedPaneId ?? await this.splitPane();
    try {
      const { stdout } = await execFileAsync(
        "herdr",
        ["agent", "start", name, "--kind", "codex", "--pane", paneId, "--", "-m", model],
        this.options(),
      );
      return parseAgent(String(stdout));
    } catch (error) {
      try {
        await this.closePane(paneId);
      } catch (cleanupError) {
        throw new PaneCleanupError(paneId, error, cleanupError);
      }
      throw error;
    }
  }

  async startRawWorker(
    name: string,
    runtime: "cmdc" | "agy",
    model: string,
    suppliedPaneId?: string,
  ): Promise<LiveAgent> {
    const paneId = suppliedPaneId ?? await this.splitPane();
    const command = runtime === "cmdc"
      ? `cmdc --model ${model} --skip-onboarding`
      : "agy";
    try {
      if (runtime === "cmdc") {
        const executable = process.platform === "win32" ? "cmd.exe" : "cmdc";
        const arguments_ = process.platform === "win32"
          ? ["/d", "/s", "/c", "cmdc.cmd --list-models"]
          : ["--list-models"];
        const { stdout } = await execFileAsync(executable, arguments_, {
          ...this.options(),
          timeout: 90_000,
        });
        if (!stdout.includes(model)) {
          throw new Error(`CMDC model ${model} is not present in the live catalog`);
        }
      } else {
        await execFileAsync("agy", ["--version"], { ...this.options(), timeout: 30_000 });
      }
      await execFileAsync("herdr", ["pane", "run", paneId, command], this.options());
      await execFileAsync(
        "herdr",
        [
          "pane",
          "wait-output",
          paneId,
          "--regex",
          "(^\\s*>\\s*$)|(Ask your question\\.\\.\\.)",
          "--timeout",
          String(this.timeoutMs),
        ],
        this.options(),
      );
      return { name, paneId, status: "unknown" };
    } catch (error) {
      try {
        await this.closePane(paneId);
      } catch (cleanupError) {
        throw new PaneCleanupError(paneId, error, cleanupError);
      }
      throw error;
    }
  }

  async inspectPane(paneId: string): Promise<LiveAgent | undefined> {
    try {
      const { stdout } = await execFileAsync("herdr", ["pane", "get", paneId], this.options());
      const parsed = JSON.parse(String(stdout)) as {
        result?: { pane?: { pane_id?: string; agent_status?: string } };
      };
      const pane = parsed.result?.pane;
      return pane?.pane_id
        ? { paneId: pane.pane_id, status: pane.agent_status ?? "unknown" }
        : undefined;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes("not_found") || detail.includes("not found")) return undefined;
      throw error;
    }
  }

  async closePane(paneId: string): Promise<void> {
    await execFileAsync("herdr", ["pane", "close", paneId], this.options());
  }

  private async splitPane(): Promise<string> {
    const { stdout } = await execFileAsync(
      "herdr",
      ["pane", "split", "--current", "--direction", "right", "--cwd", this.repositoryRoot, "--no-focus"],
      this.options(),
    );
    const parsed = JSON.parse(String(stdout)) as { result?: { pane?: { pane_id?: string } } };
    const paneId = parsed.result?.pane?.pane_id;
    if (!paneId) throw new Error("Herdr pane split did not return a pane ID");
    return paneId;
  }

  private options(): Parameters<typeof execFileAsync>[2] {
    return {
      cwd: this.repositoryRoot,
      encoding: "utf8",
      timeout: this.timeoutMs,
      windowsHide: true,
      env: childEnvironment(),
    };
  }
}

function lifecycleFromStatus(status: string): AgentLifecycle {
  if (status === "working") return "working";
  if (status === "blocked") return "blocked";
  if (status === "idle" || status === "done") return "idle";
  return "recovering";
}

export type Assignment = DispatchTarget;

export class DepartmentSupervisor {
  private readonly locks = new Map<DepartmentName, Promise<unknown>>();

  constructor(
    private readonly config: DiscordBridgeConfig,
    private readonly store: WorkspaceStore,
    private readonly events: EventPublisher,
    private readonly control: SupervisorControl,
    private readonly panes?: DepartmentPaneManager,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reconcileLeads(): Promise<AgentRegistryEntry[]> {
    const entries: AgentRegistryEntry[] = [];
    for (const [department, departmentConfig] of Object.entries(this.config.departments) as [DepartmentName, DepartmentConfig][]) {
      const previous = this.store.readAgent(departmentConfig.leadAgent);
      if (department === "ceo") {
        const live = await this.reconcileCeo(previous);
        const entry: AgentRegistryEntry = {
          name: "ceo",
          department: "ceo",
          role: "lead",
          paneId: live.paneId,
          lifecycle: lifecycleFromStatus(live.status),
          runtime: "codex",
          model: departmentConfig.model,
          control: "canonical",
          activeRequestIds: previous?.activeRequestIds ?? [],
          updatedAt: this.timestamp(),
        };
        this.store.upsertAgent(entry);
        entries.push(entry);
        continue;
      }

      const live = await this.inspectPersisted(previous);
      const hasActiveWork = (previous?.activeRequestIds.length ?? 0) > 0;
      const entry: AgentRegistryEntry = {
        name: departmentConfig.leadAgent,
        department,
        role: "lead",
        paneId: live?.paneId,
        lifecycle: live
          ? hasActiveWork ? (previous?.lifecycle ?? "recovering") : "warm"
          : hasActiveWork ? "recovering" : "offline",
        runtime: previous?.runtime ?? "unassigned",
        model: previous?.model ?? departmentConfig.model,
        control: previous?.control,
        activeRequestIds: previous?.activeRequestIds ?? [],
        updatedAt: this.timestamp(),
        tabId: live ? previous?.tabId : undefined,
        supervisorOwned: live ? previous?.supervisorOwned : undefined,
        lastUsedAt: previous?.lastUsedAt,
        warmUntil: live && !hasActiveWork
          ? previous?.warmUntil ?? this.warmDeadline()
          : previous?.warmUntil,
        lastError: live ? previous?.lastError : hasActiveWork ? "lead-pane-missing" : undefined,
      };
      this.store.upsertAgent(entry);
      entries.push(entry);
    }
    await this.reconcileWorkers();
    return entries;
  }

  assign(request: InboundRequest): Promise<Assignment> {
    return this.withDepartmentLock(request.department, async () => {
      request.parallelDecision = decideParallelSafety(request);
      const lead = await this.ensureLead(request);

      if (
        request.source === "handoff" ||
        lead.activeRequestIds.length === 0 ||
        !request.parallelDecision.eligible
      ) {
        if (!lead.activeRequestIds.includes(request.id)) lead.activeRequestIds.push(request.id);
        lead.lifecycle = "working";
        lead.warmUntil = undefined;
        lead.updatedAt = this.timestamp();
        this.store.upsertAgent(lead);
        if (lead.activeRequestIds.length > 1) {
          this.events.publish({
            level: "activity",
            code: "task.queued",
            department: request.department,
            requestId: request.id,
            actor: lead.name,
            summary: "Request queued to the stable lead instead of cloning",
            detail: request.parallelDecision.reason,
          });
        }
        return this.targetFromEntry(lead);
      }

      return this.startWorker(request);
    });
  }

  release(request: InboundRequest, assignment: Assignment, error?: string): Promise<void> {
    return this.withDepartmentLock(request.department, async () => {
      const entry = this.store.readAgent(assignment.agentName);
      if (!entry) return;
      entry.activeRequestIds = entry.activeRequestIds.filter((id) => id !== request.id);
      entry.updatedAt = this.timestamp();
      entry.lastError = error;
      if (entry.role === "lead") {
        if (error) entry.lifecycle = "recovering";
        else if (entry.activeRequestIds.length > 0) entry.lifecycle = "working";
        else if (entry.department === "ceo") entry.lifecycle = "idle";
        else {
          entry.lifecycle = "warm";
          entry.lastUsedAt = this.timestamp();
          entry.warmUntil = this.warmDeadline();
        }
        this.store.upsertAgent(entry);
        return;
      }
      if (error) {
        entry.lifecycle = "recovering";
        this.store.upsertAgent(entry);
        return;
      }
      await this.closeOwnedEntry(entry);
    });
  }

  async sweepExpired(at = this.now()): Promise<number> {
    let closed = 0;
    const candidates = this.store.listAgents().filter((entry) =>
      entry.role === "lead" &&
      entry.department !== "ceo" &&
      entry.lifecycle === "warm" &&
      entry.warmUntil &&
      new Date(entry.warmUntil) <= at,
    );
    for (const candidate of candidates) {
      await this.withDepartmentLock(candidate.department, async () => {
        const current = this.store.readAgent(candidate.name);
        if (
          !current || current.lifecycle !== "warm" || current.activeRequestIds.length > 0 ||
          !current.warmUntil || new Date(current.warmUntil) > at
        ) return;
        try {
          await this.closeOwnedEntry(current);
          closed += 1;
          this.events.publish({
            level: "info",
            code: "agent.stopped",
            department: current.department,
            actor: current.name,
            summary: `${this.config.departments[current.department].displayName} lead stopped after the warm lease`,
          });
        } catch (error) {
          current.lifecycle = "recovering";
          current.lastError = error instanceof Error ? error.message : String(error);
          current.updatedAt = this.timestamp();
          this.store.upsertAgent(current);
          this.events.publish({
            level: "warning",
            code: "agent.close_blocked",
            department: current.department,
            actor: current.name,
            summary: "Automatic department close was blocked for safety",
            detail: current.lastError,
          });
        }
      });
    }
    return closed;
  }

  async inspectRegisteredAgent(name: string): Promise<LiveAgent | undefined> {
    return this.inspectPersisted(this.store.readAgent(name));
  }

  private async reconcileCeo(previous?: AgentRegistryEntry): Promise<LiveAgent> {
    let live = await this.control.getAgent("ceo");
    if (live) return live;
    const candidate = previous?.paneId ? await this.control.getAgent(previous.paneId) : undefined;
    if (!candidate || candidate.name) {
      throw new Error("Primary Herdr agent ceo is missing; refusing to create a second CEO");
    }
    live = await this.control.renameAgent(candidate.paneId, "ceo");
    this.events.publish({
      level: "info",
      code: "agent.name_recovered",
      department: "ceo",
      actor: "ceo",
      summary: "Recovered the persisted CEO live name after Herdr resume",
    });
    return live;
  }

  private async ensureLead(request: InboundRequest): Promise<AgentRegistryEntry> {
    const department = this.config.departments[request.department];
    let lead = this.store.readAgent(department.leadAgent);
    if (!lead) {
      await this.reconcileLeads();
      lead = this.store.readAgent(department.leadAgent);
    }
    if (!lead) throw new Error(`No registry entry for ${department.leadAgent}`);
    const live = await this.inspectPersisted(lead);
    if (live) {
      lead.paneId = live.paneId;
      return lead;
    }
    if (request.department === "ceo") {
      throw new Error("Primary CEO pane is unavailable");
    }
    return this.startLead(request, lead);
  }

  private async startLead(request: InboundRequest, previous: AgentRegistryEntry): Promise<AgentRegistryEntry> {
    const route = selectDepartmentRoute(request);
    const { live, placement, actualRoute } = await this.startRouted(previous.name, route, request);
    const entry: AgentRegistryEntry = {
      ...previous,
      paneId: live.paneId,
      lifecycle: "idle",
      runtime: actualRoute.runtime,
      model: actualRoute.model,
      control: actualRoute.control,
      activeRequestIds: [],
      updatedAt: this.timestamp(),
      tabId: placement.tabId,
      supervisorOwned: true,
      warmUntil: undefined,
      lastError: actualRoute.fallback,
    };
    this.store.upsertAgent(entry);
    this.events.publish({
      level: "info",
      code: "agent.started",
      department: request.department,
      requestId: request.id,
      actor: entry.name,
      summary: `${this.config.departments[request.department].displayName} lead started on demand`,
      detail: `${entry.runtime} · ${entry.model}`,
    });
    return entry;
  }

  private async startWorker(request: InboundRequest): Promise<Assignment> {
    const suffix = request.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8);
    const workerName = `${request.department}-worker-${suffix}`;
    const existing = this.store.readAgent(workerName);
    if (existing?.paneId && existing.activeRequestIds.includes(request.id)) {
      return this.targetFromEntry(existing);
    }
    const { live, placement, actualRoute } = await this.startRouted(
      workerName,
      selectWorkerRoute(request),
      request,
    );
    const worker: AgentRegistryEntry = {
      name: workerName,
      department: request.department,
      role: "worker",
      parentAgent: this.config.departments[request.department].leadAgent,
      paneId: live.paneId,
      lifecycle: "working",
      runtime: actualRoute.runtime,
      model: actualRoute.model,
      control: actualRoute.control,
      activeRequestIds: [request.id],
      updatedAt: this.timestamp(),
      tabId: placement.tabId,
      supervisorOwned: true,
      lastError: actualRoute.fallback,
    };
    this.store.upsertAgent(worker);
    this.events.publish({
      level: "activity",
      code: "task.delegated",
      department: request.department,
      requestId: request.id,
      actor: workerName,
      summary: "The stable lead is busy; an elastic worker was created",
      detail: `${actualRoute.runtime} · ${actualRoute.model}`,
    });
    return this.targetFromEntry(worker);
  }

  private async startRouted(
    name: string,
    route: WorkerRoute,
    request: InboundRequest,
  ): Promise<{ live: LiveAgent; placement: DepartmentPanePlacement; actualRoute: WorkerRoute }> {
    if (!this.panes) throw new Error("Department pane manager is unavailable");
    let placement = await this.panes.allocate(this.store.listAgents());
    try {
      const live = route.control === "raw"
        ? await this.control.startRawWorker(name, route.runtime as "cmdc" | "agy", route.model, placement.paneId)
        : await this.control.startAgent(name, route.model, placement.paneId);
      return { live, placement, actualRoute: route };
    } catch (error) {
      if (error instanceof PaneCleanupError) throw error;
      if (route.control !== "raw") throw error;
      const reason = error instanceof Error ? error.message : String(error);
      this.events.publish({
        level: "warning",
        code: "runtime.fallback",
        department: request.department,
        requestId: request.id,
        actor: name,
        summary: `${route.runtime.toUpperCase()} startup failed; using a non-Sol Codex fallback`,
        detail: "See local diagnostics for provider failure details",
      });
      const fallbackModel = route.fallback?.split(":")[1] ?? this.config.departments[request.department].model;
      const fallback: WorkerRoute = {
        runtime: "codex",
        model: fallbackModel,
        control: "canonical",
        fallback: `${route.runtime}:${route.model} failed: ${reason}`,
        reason: "Provider fallback after failed health/start check",
      };
      placement = await this.panes.allocate(this.store.listAgents());
      const live = await this.control.startAgent(name, fallback.model, placement.paneId);
      return { live, placement, actualRoute: fallback };
    }
  }

  private async inspectPersisted(entry?: AgentRegistryEntry): Promise<LiveAgent | undefined> {
    if (!entry?.paneId) return undefined;
    return entry.control === "raw" || entry.runtime === "cmdc" || entry.runtime === "agy"
      ? this.control.inspectPane(entry.paneId)
      : this.control.getAgent(entry.name);
  }

  private async reconcileWorkers(): Promise<void> {
    for (const worker of this.store.listAgents().filter((entry) => entry.role === "worker" && entry.lifecycle !== "offline")) {
      const live = await this.inspectPersisted(worker);
      worker.updatedAt = this.timestamp();
      if (live) {
        worker.paneId = live.paneId;
        worker.lifecycle = worker.activeRequestIds.length > 0 ? "recovering" : "idle";
      } else {
        worker.paneId = undefined;
        worker.tabId = undefined;
        worker.lifecycle = "recovering";
        worker.lastError = "worker-pane-missing";
        this.events.publish({
          level: "warning",
          code: "worker.recovery_needed",
          department: worker.department,
          actor: worker.name,
          requestId: worker.activeRequestIds[0],
          summary: "Persisted worker is no longer live; request recovery inspection required",
        });
      }
      this.store.upsertAgent(worker);
    }
  }

  private async closeOwnedEntry(entry: AgentRegistryEntry): Promise<void> {
    if (entry.paneId) {
      if (!entry.supervisorOwned || !this.panes) {
        throw new Error(`Refusing to close unowned pane ${entry.paneId}`);
      }
      await this.panes.close(entry, this.store.listAgents(), (paneId) => this.control.closePane(paneId));
    }
    entry.lifecycle = "offline";
    entry.paneId = undefined;
    entry.tabId = undefined;
    entry.supervisorOwned = undefined;
    entry.warmUntil = undefined;
    entry.activeRequestIds = [];
    entry.updatedAt = this.timestamp();
    this.store.upsertAgent(entry);
  }

  private targetFromEntry(entry: AgentRegistryEntry): Assignment {
    return {
      agentName: entry.name,
      role: entry.role,
      paneId: entry.paneId,
      runtime: entry.runtime as Assignment["runtime"],
      model: entry.model,
      control: entry.control ?? (entry.runtime === "codex" ? "canonical" : "raw"),
      fallback: entry.lastError,
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private warmDeadline(): string {
    return new Date(this.now().getTime() + this.config.departmentWarmLeaseMs).toISOString();
  }

  private withDepartmentLock<T>(department: DepartmentName, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(department) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    this.locks.set(department, result.catch(() => undefined));
    return result;
  }
}
