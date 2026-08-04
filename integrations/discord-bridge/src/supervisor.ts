import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { EventPublisher } from "./events.js";
import { decideParallelSafety, selectWorkerRoute } from "./runtime-routing.js";
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

export interface LiveAgent {
  name?: string;
  paneId: string;
  status: string;
}

export interface SupervisorControl {
  getAgent(name: string): Promise<LiveAgent | undefined>;
  renameAgent(paneId: string, name: string): Promise<LiveAgent>;
  startAgent(name: string, model: string): Promise<LiveAgent>;
  startRawWorker(
    name: string,
    runtime: "cmdc" | "agy",
    model: string,
  ): Promise<LiveAgent>;
  inspectPane(paneId: string): Promise<LiveAgent | undefined>;
  closePane(paneId: string): Promise<void>;
}

function childEnvironment(): NodeJS.ProcessEnv {
  const { DISCORD_BOT_TOKEN: _token, ...environment } = process.env;
  return environment;
}

function parseAgent(payload: string): LiveAgent {
  const parsed = JSON.parse(payload) as {
    result?: { agent?: Record<string, unknown> };
  };
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
      const { stdout } = await execFileAsync("herdr", ["agent", "get", name], {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        timeout: this.timeoutMs,
        windowsHide: true,
        env: childEnvironment(),
      });
      return parseAgent(stdout);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes("agent_not_found") || detail.includes("target") && detail.includes("not found")) {
        return undefined;
      }
      throw error;
    }
  }

  async startAgent(name: string, model: string): Promise<LiveAgent> {
    const paneId = await this.splitPane();
    try {
      const { stdout } = await execFileAsync(
        "herdr",
        ["agent", "start", name, "--kind", "codex", "--pane", paneId, "--", "-m", model],
        {
          cwd: this.repositoryRoot,
          encoding: "utf8",
          timeout: this.timeoutMs,
          windowsHide: true,
          env: childEnvironment(),
        },
      );
      return parseAgent(stdout);
    } catch (error) {
      await this.closePane(paneId).catch(() => undefined);
      throw error;
    }
  }

  async renameAgent(paneId: string, name: string): Promise<LiveAgent> {
    const { stdout } = await execFileAsync(
      "herdr",
      ["agent", "rename", paneId, name],
      {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        timeout: this.timeoutMs,
        windowsHide: true,
        env: childEnvironment(),
      },
    );
    return parseAgent(stdout);
  }

  async startRawWorker(
    name: string,
    runtime: "cmdc" | "agy",
    model: string,
  ): Promise<LiveAgent> {
    if (runtime === "cmdc") {
      const { stdout } = await execFileAsync("cmdc", ["--list-models"], {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
        env: childEnvironment(),
      });
      if (!stdout.includes(model)) {
        throw new Error(`CMDC model ${model} is not present in the live catalog`);
      }
    } else {
      await execFileAsync("agy", ["--version"], {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
        env: childEnvironment(),
      });
    }
    const paneId = await this.splitPane();
    const command = runtime === "cmdc" ? `cmdc --model ${model}` : "agy";
    try {
      await execFileAsync("herdr", ["pane", "run", paneId, command], {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        timeout: this.timeoutMs,
        windowsHide: true,
        env: childEnvironment(),
      });
      return { name, paneId, status: "unknown" };
    } catch (error) {
      await this.closePane(paneId).catch(() => undefined);
      throw error;
    }
  }

  async inspectPane(paneId: string): Promise<LiveAgent | undefined> {
    try {
      const { stdout } = await execFileAsync("herdr", ["pane", "get", paneId], {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        timeout: this.timeoutMs,
        windowsHide: true,
        env: childEnvironment(),
      });
      const parsed = JSON.parse(stdout) as {
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

  private async splitPane(): Promise<string> {
    const { stdout: splitOutput } = await execFileAsync(
      "herdr",
      ["pane", "split", "--current", "--direction", "right", "--cwd", this.repositoryRoot, "--no-focus"],
      {
        cwd: this.repositoryRoot,
        encoding: "utf8",
        timeout: this.timeoutMs,
        windowsHide: true,
        env: childEnvironment(),
      },
    );
    const split = JSON.parse(splitOutput) as {
      result?: { pane?: { pane_id?: string } };
    };
    const paneId = split.result?.pane?.pane_id;
    if (!paneId) throw new Error("Herdr pane split did not return a pane ID");
    return paneId;
  }

  async closePane(paneId: string): Promise<void> {
    await execFileAsync("herdr", ["pane", "close", paneId], {
      cwd: this.repositoryRoot,
      encoding: "utf8",
      timeout: this.timeoutMs,
      windowsHide: true,
      env: childEnvironment(),
    });
  }
}

function lifecycleFromStatus(status: string): AgentLifecycle {
  if (status === "working") return "working";
  if (status === "blocked") return "blocked";
  if (status === "idle" || status === "done") return "idle";
  return "recovering";
}

function registryEntry(
  department: DepartmentName,
  config: DepartmentConfig,
  live: LiveAgent,
): AgentRegistryEntry {
  return {
    name: config.leadAgent,
    department,
    role: "lead",
    paneId: live.paneId,
    lifecycle: lifecycleFromStatus(live.status),
    runtime: config.runtime,
    model: config.model,
    activeRequestIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export type Assignment = DispatchTarget;

export class DepartmentSupervisor {
  private readonly locks = new Map<DepartmentName, Promise<unknown>>();

  constructor(
    private readonly config: DiscordBridgeConfig,
    private readonly store: WorkspaceStore,
    private readonly events: EventPublisher,
    private readonly control: SupervisorControl,
  ) {}

  async reconcileLeads(): Promise<AgentRegistryEntry[]> {
    const entries: AgentRegistryEntry[] = [];
    for (const [department, departmentConfig] of Object.entries(
      this.config.departments,
    ) as [DepartmentName, DepartmentConfig][]) {
      let live = await this.control.getAgent(departmentConfig.leadAgent);
      if (!live) {
        if (department === "ceo") {
          const persisted = this.store.readAgent("ceo");
          const candidate = persisted?.paneId
            ? await this.control.getAgent(persisted.paneId)
            : undefined;
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
        } else {
          live = await this.control.startAgent(
            departmentConfig.leadAgent,
            departmentConfig.model,
          );
          this.events.publish({
            level: "info",
            code: "agent.started",
            department,
            actor: departmentConfig.leadAgent,
            summary: `${departmentConfig.displayName} lead started`,
            detail: `${departmentConfig.runtime} · ${departmentConfig.model}`,
          });
        }
      }
      const previous = this.store.readAgent(departmentConfig.leadAgent);
      const entry = registryEntry(department, departmentConfig, live);
      entry.activeRequestIds = previous?.activeRequestIds ?? [];
      this.store.upsertAgent(entry);
      entries.push(entry);
    }
    for (const worker of this.store.listAgents().filter((entry) => entry.role === "worker")) {
      if (worker.lifecycle === "offline") continue;
      const live = worker.runtime === "codex"
        ? await this.control.getAgent(worker.name)
        : worker.paneId
          ? await this.control.inspectPane(worker.paneId)
          : undefined;
      worker.updatedAt = new Date().toISOString();
      if (live) {
        worker.paneId = live.paneId;
        worker.lifecycle = worker.runtime === "codex"
          ? lifecycleFromStatus(live.status)
          : "recovering";
      } else {
        worker.paneId = undefined;
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
    return entries;
  }

  assign(request: InboundRequest): Promise<Assignment> {
    return this.withDepartmentLock(request.department, async () => {
      const department = this.config.departments[request.department];
      let lead = this.store.readAgent(department.leadAgent);
      if (!lead) {
        await this.reconcileLeads();
        lead = this.store.readAgent(department.leadAgent);
      }
      if (!lead) throw new Error(`No registry entry for ${department.leadAgent}`);

      request.parallelDecision = decideParallelSafety(request);

      if (request.source === "handoff") {
        if (!lead.activeRequestIds.includes(request.id)) {
          lead.activeRequestIds.push(request.id);
        }
        lead.lifecycle = "working";
        lead.updatedAt = new Date().toISOString();
        this.store.upsertAgent(lead);
        return {
          agentName: lead.name,
          role: "lead",
          paneId: lead.paneId,
          runtime: "codex",
          model: lead.model,
          control: "canonical",
        };
      }

      if (lead.activeRequestIds.length === 0 && lead.lifecycle !== "blocked") {
        lead.activeRequestIds = [request.id];
        lead.lifecycle = "working";
        lead.updatedAt = new Date().toISOString();
        this.store.upsertAgent(lead);
        return {
          agentName: lead.name,
          role: "lead",
          paneId: lead.paneId,
          runtime: "codex",
          model: lead.model,
          control: "canonical",
        };
      }

      if (!request.parallelDecision.eligible) {
        if (!lead.activeRequestIds.includes(request.id)) lead.activeRequestIds.push(request.id);
        lead.lifecycle = "working";
        lead.updatedAt = new Date().toISOString();
        this.store.upsertAgent(lead);
        this.events.publish({
          level: "activity",
          code: "task.queued",
          department: request.department,
          requestId: request.id,
          actor: lead.name,
          summary: "Request queued to the stable lead instead of cloning",
          detail: request.parallelDecision.reason,
        });
        return {
          agentName: lead.name,
          role: "lead",
          paneId: lead.paneId,
          runtime: "codex",
          model: lead.model,
          control: "canonical",
        };
      }

      const suffix = request.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8);
      const workerName = `${request.department}-worker-${suffix}`;
      const existing = this.store.readAgent(workerName);
      if (existing?.paneId && existing.activeRequestIds.includes(request.id)) {
        return {
          agentName: workerName,
          role: "worker",
          paneId: existing.paneId,
          runtime: existing.runtime as DispatchTarget["runtime"],
          model: existing.model,
          control: existing.runtime === "codex" ? "canonical" : "raw",
        };
      }
      let route = selectWorkerRoute(request);
      let live: LiveAgent;
      try {
        live = route.control === "raw"
          ? await this.control.startRawWorker(workerName, route.runtime as "cmdc" | "agy", route.model)
          : await this.control.startAgent(workerName, route.model);
      } catch (error) {
        if (route.control !== "raw") throw error;
        const reason = error instanceof Error ? error.message : String(error);
        this.events.publish({
          level: "warning",
          code: "runtime.fallback",
          department: request.department,
          requestId: request.id,
          actor: workerName,
          summary: `${route.runtime.toUpperCase()} worker startup failed; using Codex fallback`,
          detail: "See local diagnostics for provider failure details",
        });
        route = {
          runtime: "codex",
          model: "gpt-5.6-terra",
          control: "canonical",
          fallback: `${route.runtime}:${route.model} failed: ${reason}`,
          reason: "Provider fallback after failed health/start check",
        };
        live = await this.control.startAgent(workerName, route.model);
      }
      const worker: AgentRegistryEntry = {
        name: workerName,
        department: request.department,
        role: "worker",
        parentAgent: department.leadAgent,
        paneId: live.paneId,
        lifecycle: "working",
        runtime: route.runtime,
        model: route.model,
        activeRequestIds: [request.id],
        updatedAt: new Date().toISOString(),
      };
      this.store.upsertAgent(worker);
      this.events.publish({
        level: "activity",
        code: "task.delegated",
        department: request.department,
        requestId: request.id,
        actor: workerName,
        summary: `${department.leadAgent} is busy; an elastic worker was created`,
        detail: `${route.runtime} · ${route.model}`,
      });
      return {
        agentName: workerName,
        role: "worker",
        paneId: live.paneId,
        runtime: route.runtime,
        model: route.model,
        control: route.control,
        fallback: route.fallback,
      };
    });
  }

  release(request: InboundRequest, assignment: Assignment, error?: string): Promise<void> {
    return this.withDepartmentLock(request.department, async () => {
      const entry = this.store.readAgent(assignment.agentName);
      if (!entry) return;
      entry.activeRequestIds = entry.activeRequestIds.filter((id) => id !== request.id);
      entry.updatedAt = new Date().toISOString();
      entry.lastError = error;
      if (entry.role === "lead") {
        entry.lifecycle = error
          ? "recovering"
          : entry.activeRequestIds.length > 0
            ? "working"
            : "idle";
        this.store.upsertAgent(entry);
        return;
      }
      if (error) {
        entry.lifecycle = "recovering";
        this.store.upsertAgent(entry);
        return;
      }
      entry.lifecycle = "offline";
      this.store.upsertAgent(entry);
      if (entry.paneId) {
        await this.control.closePane(entry.paneId).catch((closeError) => {
          entry.lifecycle = "recovering";
          entry.lastError = closeError instanceof Error ? closeError.message : String(closeError);
          entry.updatedAt = new Date().toISOString();
          this.store.upsertAgent(entry);
        });
      }
    });
  }

  private withDepartmentLock<T>(
    department: DepartmentName,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(department) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    this.locks.set(department, result.catch(() => undefined));
    return result;
  }
}
