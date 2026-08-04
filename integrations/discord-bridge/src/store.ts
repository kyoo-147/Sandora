import fs from "node:fs";
import path from "node:path";
import type {
  AgentRegistryEntry,
  CompanyEvent,
  DispatchTarget,
  HandoffRecord,
  InboundState,
  InboundRequest,
  OutboundMessage,
  PendingOutbound,
} from "./types.js";

function writeJsonAtomic(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  fs.renameSync(temporaryPath, filePath);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class WorkspaceStore {
  readonly inboxDirectory: string;
  readonly pendingDirectory: string;
  readonly sentDirectory: string;
  readonly failedDirectory: string;
  readonly sessionDirectory: string;
  readonly statusDirectory: string;
  readonly requestStateDirectory: string;
  readonly agentRegistryDirectory: string;
  readonly activityEventDirectory: string;
  readonly systemEventDirectory: string;
  readonly bridgeLockPath: string;
  readonly handoffDirectory: string;
  readonly recoveryDirectory: string;
  private ownsBridgeLock = false;

  constructor(readonly root: string) {
    this.inboxDirectory = path.join(root, "inbox");
    this.pendingDirectory = path.join(root, "outbox", "pending");
    this.sentDirectory = path.join(root, "outbox", "sent");
    this.failedDirectory = path.join(root, "outbox", "failed");
    this.sessionDirectory = path.join(root, "sessions");
    this.statusDirectory = path.join(root, "status");
    this.requestStateDirectory = path.join(this.statusDirectory, "requests");
    this.agentRegistryDirectory = path.join(this.statusDirectory, "agents");
    this.activityEventDirectory = path.join(root, "events", "activity");
    this.systemEventDirectory = path.join(root, "events", "system");
    this.bridgeLockPath = path.join(this.statusDirectory, "bridge.lock");
    this.handoffDirectory = path.join(root, "handoffs");
    this.recoveryDirectory = path.join(this.statusDirectory, "recovery");
  }

  ensure(): void {
    for (const directory of [
      this.inboxDirectory,
      this.pendingDirectory,
      this.sentDirectory,
      this.failedDirectory,
      this.sessionDirectory,
      this.statusDirectory,
      this.requestStateDirectory,
      this.agentRegistryDirectory,
      this.activityEventDirectory,
      this.systemEventDirectory,
      this.handoffDirectory,
      this.recoveryDirectory,
    ]) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  hasInbound(id: string): boolean {
    return fs.existsSync(this.inboundPath(id));
  }

  readInbound(id: string): InboundRequest | undefined {
    const filePath = this.inboundPath(id);
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as InboundRequest;
  }

  admitInbound(request: InboundRequest): string {
    this.ensure();
    const filePath = this.inboundPath(request.id);
    if (!fs.existsSync(filePath)) {
      writeJsonAtomic(filePath, request);
    }
    const statePath = this.requestStatePath(request.id);
    if (!fs.existsSync(statePath)) {
      writeJsonAtomic(statePath, {
        requestId: request.id,
        status: "admitted",
        version: 1,
        attempts: 0,
        updatedAt: new Date().toISOString(),
      } satisfies InboundState);
    }
    return filePath;
  }

  listRecoverableInbound(now = new Date()): InboundRequest[] {
    this.ensure();
    return fs
      .readdirSync(this.inboxDirectory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .flatMap((name) => {
        try {
          const request = JSON.parse(
            fs.readFileSync(path.join(this.inboxDirectory, name), "utf8"),
          ) as InboundRequest;
          let state = this.readInboundState(request.id);
          if (!state) {
            state = {
              requestId: request.id,
              status: "admitted",
              version: 1,
              attempts: 0,
              updatedAt: new Date().toISOString(),
            };
            this.writeInboundState(state);
          }
          if (
            state.status === "submitted" ||
            state.status === "working" ||
            state.status === "blocked" ||
            state.status === "completed" ||
            state.status === "delivered" ||
            state.status === "settled" ||
            state.status === "failed"
          ) {
            return [];
          }
          if (state.nextAttemptAt && new Date(state.nextAttemptAt) > now) return [];
          return [request];
        } catch {
          // One corrupt record must not prevent recovery of every other request.
          return [];
        }
      });
  }

  listAmbiguousInbound(): InboundRequest[] {
    this.ensure();
    return fs
      .readdirSync(this.inboxDirectory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .flatMap((name) => {
        try {
          const request = JSON.parse(
            fs.readFileSync(path.join(this.inboxDirectory, name), "utf8"),
          ) as InboundRequest;
          const state = this.readInboundState(request.id);
          return state && ["submitted", "working", "blocked"].includes(state.status)
            ? [request]
            : [];
        } catch {
          return [];
        }
      });
  }

  readInboundState(requestId: string): InboundState | undefined {
    const filePath = this.requestStatePath(requestId);
    if (!fs.existsSync(filePath)) return undefined;
    const state = JSON.parse(fs.readFileSync(filePath, "utf8")) as InboundState;
    return { ...state, version: Number.isInteger(state.version) ? state.version : 0 };
  }

  markInboundDispatching(requestId: string): InboundState {
    const current = this.readInboundState(requestId);
    if (!current) throw new Error(`Request state not found: ${requestId}`);
    if (!["assigned", "pending"].includes(current.status)) {
      throw new Error(`Illegal request transition to dispatching: ${current.status}`);
    }
    const state: InboundState = {
      requestId,
      status: "dispatching",
      version: current.version + 1,
      attempts: current.attempts + 1,
      updatedAt: new Date().toISOString(),
      assignedAgent: current?.assignedAgent,
      department: current?.department,
      parentRequestId: current?.parentRequestId,
      runtime: current?.runtime,
      model: current?.model,
      fallback: current?.fallback,
      artifactPaths: current?.artifactPaths,
      parallelEligible: current?.parallelEligible,
      parallelReason: current?.parallelReason,
    };
    this.writeInboundState(state);
    return state;
  }

  markInboundSettled(requestId: string): void {
    const current = this.readInboundState(requestId);
    if (!current || !["submitted", "working", "blocked"].includes(current.status)) {
      throw new Error(`Illegal request transition to completed: ${current?.status ?? "missing"}`);
    }
    this.writeInboundState({
      requestId,
      status: "completed",
      version: current.version + 1,
      attempts: current.attempts,
      updatedAt: new Date().toISOString(),
      assignedAgent: current?.assignedAgent,
      department: current?.department,
      parentRequestId: current?.parentRequestId,
      runtime: current?.runtime,
      model: current?.model,
      fallback: current?.fallback,
      artifactPaths: current?.artifactPaths,
      parallelEligible: current?.parallelEligible,
      parallelReason: current?.parallelReason,
    });
  }

  markInboundSubmitted(requestId: string, reason: string): void {
    const current = this.readInboundState(requestId);
    if (!current || current.status !== "dispatching") {
      throw new Error(`Illegal request transition to submitted: ${current?.status ?? "missing"}`);
    }
    this.writeInboundState({
      requestId,
      status: "submitted",
      version: current.version + 1,
      attempts: current.attempts,
      updatedAt: new Date().toISOString(),
      lastError: reason,
      assignedAgent: current?.assignedAgent,
      department: current?.department,
      parentRequestId: current?.parentRequestId,
      runtime: current?.runtime,
      model: current?.model,
      fallback: current?.fallback,
      artifactPaths: current?.artifactPaths,
      parallelEligible: current?.parallelEligible,
      parallelReason: current?.parallelReason,
    });
  }

  markInboundObserved(
    requestId: string,
    status: "working" | "blocked",
    reason?: string,
  ): InboundState {
    const current = this.readInboundState(requestId);
    if (!current || !["submitted", "working", "blocked"].includes(current.status)) {
      throw new Error(`Illegal recovery transition to ${status}: ${current?.status ?? "missing"}`);
    }
    const state: InboundState = {
      ...current,
      status,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      lastError: reason,
    };
    this.writeInboundState(state);
    return state;
  }

  markInboundDelivered(requestId: string): boolean {
    const current = this.readInboundState(requestId);
    if (!current) return false;
    if (current.status === "delivered") return true;
    if (current.status !== "completed") {
      return false;
    }
    this.writeInboundState({
      ...current,
      status: "delivered",
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  hasDeliveredOutcome(requestId: string): boolean {
    this.ensure();
    for (const name of fs.readdirSync(this.sentDirectory).filter((file) => file.endsWith(".json"))) {
      try {
        const message = JSON.parse(
          fs.readFileSync(path.join(this.sentDirectory, name), "utf8"),
        ) as OutboundMessage;
        if (
          message.requestId === requestId &&
          !["agent-activity", "system-log"].includes(message.channel) &&
          ["final", "report", "approval", "error"].includes(message.kind)
        ) return true;
      } catch {
        // Ignore one corrupt sent record and continue inspecting others.
      }
    }
    return false;
  }

  hasDurableOutcome(requestId: string): boolean {
    this.ensure();
    for (const directory of [this.pendingDirectory, this.sentDirectory, this.failedDirectory]) {
      for (const name of fs.readdirSync(directory).filter((file) => file.endsWith(".json"))) {
        try {
          const message = JSON.parse(
            fs.readFileSync(path.join(directory, name), "utf8"),
          ) as OutboundMessage;
          if (
            message.requestId === requestId &&
            !["agent-activity", "system-log"].includes(message.channel) &&
            ["final", "report", "approval", "error"].includes(message.kind)
          ) {
            return true;
          }
        } catch {
          // Ignore one corrupt outcome record and continue inspecting others.
        }
      }
    }
    for (const name of fs.readdirSync(this.inboxDirectory).filter((file) => file.endsWith(".json"))) {
      try {
        const child = JSON.parse(
          fs.readFileSync(path.join(this.inboxDirectory, name), "utf8"),
        ) as InboundRequest;
        if (child.source === "handoff" && child.parentRequestId === requestId) return true;
      } catch {
        // Ignore one corrupt child request and continue inspecting others.
      }
    }
    for (const name of fs.readdirSync(this.handoffDirectory).filter((file) => file.endsWith(".json"))) {
      try {
        const handoff = JSON.parse(
          fs.readFileSync(path.join(this.handoffDirectory, name), "utf8"),
        ) as HandoffRecord;
        if (handoff.parentRequestId === requestId) return true;
      } catch {
        // Ignore one corrupt handoff and continue inspecting others.
      }
    }
    return false;
  }

  markInboundRetry(requestId: string, reason: string, delayMs: number): InboundState {
    const current = this.readInboundState(requestId);
    if (!current || ["submitted", "working", "blocked", "completed", "delivered", "settled"].includes(current.status)) {
      throw new Error(`Illegal request transition to pending: ${current?.status ?? "missing"}`);
    }
    const state: InboundState = {
      requestId,
      status: "pending",
      version: current.version + 1,
      attempts: current.status === "dispatching" ? current.attempts : current.attempts + 1,
      updatedAt: new Date().toISOString(),
      nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
      lastError: reason,
      assignedAgent: current?.assignedAgent,
      department: current?.department,
      parentRequestId: current?.parentRequestId,
      runtime: current?.runtime,
      model: current?.model,
      fallback: current?.fallback,
      artifactPaths: current?.artifactPaths,
      parallelEligible: current?.parallelEligible,
      parallelReason: current?.parallelReason,
    };
    this.writeInboundState(state);
    return state;
  }

  markInboundFailed(requestId: string, reason: string): void {
    const current = this.readInboundState(requestId);
    if (!current) throw new Error(`Request state not found: ${requestId}`);
    this.writeInboundState({
      requestId,
      status: "failed",
      version: current.version + 1,
      attempts: current.attempts,
      updatedAt: new Date().toISOString(),
      lastError: reason,
      assignedAgent: current?.assignedAgent,
      department: current?.department,
      parentRequestId: current?.parentRequestId,
      runtime: current?.runtime,
      model: current?.model,
      fallback: current?.fallback,
      artifactPaths: current?.artifactPaths,
      parallelEligible: current?.parallelEligible,
      parallelReason: current?.parallelReason,
    });
  }

  markInboundAssigned(
    request: InboundRequest,
    assignedAgent: string,
    target?: DispatchTarget,
  ): InboundState {
    const current = this.readInboundState(request.id);
    if (!current || !["admitted", "pending", "assigned"].includes(current.status)) {
      throw new Error(`Illegal request transition to assigned: ${current?.status ?? "missing"}`);
    }
    const state: InboundState = {
      requestId: request.id,
      status: "assigned",
      version: current.version + 1,
      attempts: current.attempts,
      updatedAt: new Date().toISOString(),
      assignedAgent,
      department: request.department,
      parentRequestId: request.parentRequestId,
      runtime: target?.runtime,
      model: target?.model,
      fallback: target?.fallback,
      parallelEligible: request.parallelDecision?.eligible,
      parallelReason: request.parallelDecision?.reason,
    };
    this.writeInboundState(state);
    return state;
  }

  acquireBridgeLock(): void {
    this.ensure();
    const claim = (): void => {
      fs.writeFileSync(
        this.bridgeLockPath,
        `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      this.ownsBridgeLock = true;
    };
    try {
      claim();
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
    }
    try {
      const ownerPid = Number(
        (JSON.parse(fs.readFileSync(this.bridgeLockPath, "utf8")) as { pid?: number }).pid,
      );
      if (!Number.isInteger(ownerPid) || ownerPid <= 0) {
        throw new Error("Bridge lock is malformed; manual recovery is required");
      }
      try {
        process.kill(ownerPid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          fs.unlinkSync(this.bridgeLockPath);
          claim();
          return;
        }
        throw new Error(
          `Cannot verify bridge lock owner PID ${ownerPid}; refusing unsafe takeover`,
          { cause: error },
        );
      }
      throw new Error(`Another Discord bridge process holds the lock (PID ${ownerPid})`);
    } catch (error) {
      throw error;
    }
  }

  releaseBridgeLock(): void {
    if (!this.ownsBridgeLock) return;
    try {
      const owner = JSON.parse(fs.readFileSync(this.bridgeLockPath, "utf8")) as {
        pid?: number;
      };
      if (owner.pid === process.pid) fs.unlinkSync(this.bridgeLockPath);
    } finally {
      this.ownsBridgeLock = false;
    }
  }

  readAgent(name: string): AgentRegistryEntry | undefined {
    const filePath = path.join(this.agentRegistryDirectory, `${safeFilePart(name)}.json`);
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as AgentRegistryEntry;
  }

  listAgents(): AgentRegistryEntry[] {
    this.ensure();
    return fs
      .readdirSync(this.agentRegistryDirectory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .flatMap((name) => {
        try {
          return [
            JSON.parse(
              fs.readFileSync(path.join(this.agentRegistryDirectory, name), "utf8"),
            ) as AgentRegistryEntry,
          ];
        } catch {
          return [];
        }
      });
  }

  upsertAgent(entry: AgentRegistryEntry): void {
    this.ensure();
    const filePath = path.join(
      this.agentRegistryDirectory,
      `${safeFilePart(entry.name)}.json`,
    );
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(entry, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temporaryPath, filePath);
  }

  appendEvent(event: CompanyEvent): string {
    this.ensure();
    const directory = event.level === "activity"
      ? this.activityEventDirectory
      : this.systemEventDirectory;
    const filePath = path.join(
      directory,
      `${safeFilePart(event.occurredAt)}-${safeFilePart(event.id)}.json`,
    );
    writeJsonAtomic(filePath, event);
    return filePath;
  }

  recordHandoff(handoff: HandoffRecord): string {
    this.ensure();
    const filePath = path.join(
      this.handoffDirectory,
      `${safeFilePart(handoff.createdAt)}-${safeFilePart(handoff.id)}.json`,
    );
    writeJsonAtomic(filePath, handoff);
    return filePath;
  }

  writeRecoveryEvidence(requestId: string, content: string): string {
    this.ensure();
    const filePath = path.join(
      this.recoveryDirectory,
      `${safeFilePart(requestId)}-${Date.now()}.txt`,
    );
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, content.slice(-100_000), {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temporaryPath, filePath);
    return filePath;
  }

  recordRecoveryEvidence(
    requestId: string,
    evidencePath: string,
    fallback?: string,
  ): void {
    const current = this.readInboundState(requestId);
    if (!current) throw new Error(`Request state not found: ${requestId}`);
    const relative = path.relative(this.root, evidencePath).replaceAll("\\", "/");
    this.writeInboundState({
      ...current,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      artifactPaths: [...(current.artifactPaths ?? []), relative],
      fallback: fallback ?? current.fallback,
    });
  }

  enqueueOutbound(message: OutboundMessage): string {
    this.ensure();
    const filePath = path.join(
      this.pendingDirectory,
      `${safeFilePart(message.createdAt)}-${safeFilePart(message.id)}.json`,
    );
    writeJsonAtomic(filePath, message);
    return filePath;
  }

  listPending(): PendingOutbound[] {
    this.ensure();
    return fs
      .readdirSync(this.pendingDirectory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => {
        const filePath = path.join(this.pendingDirectory, name);
        const message = JSON.parse(fs.readFileSync(filePath, "utf8")) as OutboundMessage;
        return { path: filePath, message };
      });
  }

  updatePending(pendingPath: string, message: OutboundMessage): void {
    const temporaryPath = `${pendingPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(message, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temporaryPath, pendingPath);
  }

  markSent(pendingPath: string): string {
    this.ensure();
    const destination = path.join(this.sentDirectory, path.basename(pendingPath));
    fs.renameSync(pendingPath, destination);
    return destination;
  }

  markFailed(pendingPath: string, reason: string): string {
    this.ensure();
    const failedName = `${path.basename(pendingPath, ".json")}.failed.json`;
    const destination = path.join(this.failedDirectory, failedName);
    const original = JSON.parse(fs.readFileSync(pendingPath, "utf8")) as OutboundMessage;
    writeJsonAtomic(destination, {
      ...original,
      deliveryFailure: {
        failedAt: new Date().toISOString(),
        reason,
      },
    });
    fs.unlinkSync(pendingPath);
    return destination;
  }

  writeRuntimeStatus(status: Record<string, unknown>): void {
    this.ensure();
    const statusPath = path.join(this.statusDirectory, "runtime.json");
    const temporaryPath = `${statusPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, statusPath);
  }

  private inboundPath(id: string): string {
    return path.join(this.inboxDirectory, `${safeFilePart(id)}.json`);
  }

  private requestStatePath(id: string): string {
    return path.join(this.requestStateDirectory, `${safeFilePart(id)}.json`);
  }

  private writeInboundState(state: InboundState): void {
    this.ensure();
    const filePath = this.requestStatePath(state.requestId);
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temporaryPath, filePath);
  }
}
