import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadBridgeConfig } from "../src/config.js";
import { EventPublisher } from "../src/events.js";
import type { DepartmentPaneManager, DepartmentPanePlacement } from "../src/department-tabs.js";
import { WorkspaceStore } from "../src/store.js";
import {
  DepartmentSupervisor,
  type LiveAgent,
  type SupervisorControl,
} from "../src/supervisor.js";
import type { InboundRequest } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

class FakeControl implements SupervisorControl {
  readonly agents = new Map<string, LiveAgent>([
    ["ceo", { name: "ceo", paneId: "w1:p1", status: "idle" }],
  ]);
  readonly closed: string[] = [];

  async getAgent(name: string): Promise<LiveAgent | undefined> {
    return this.agents.get(name);
  }

  async startAgent(name: string, _model: string, paneId?: string): Promise<LiveAgent> {
    const agent = { name, paneId: paneId ?? `pane-${name}`, status: "idle" };
    this.agents.set(name, agent);
    return agent;
  }

  async renameAgent(paneId: string, name: string): Promise<LiveAgent> {
    const existing = [...this.agents.entries()].find(([, agent]) => agent.paneId === paneId);
    if (!existing) throw new Error(`Missing pane ${paneId}`);
    this.agents.delete(existing[0]);
    const renamed = { ...existing[1], name };
    this.agents.set(name, renamed);
    return renamed;
  }

  async startRawWorker(name: string, _runtime: "cmdc" | "agy", _model: string, paneId?: string): Promise<LiveAgent> {
    const agent = { name, paneId: paneId ?? `raw-${name}`, status: "unknown" };
    this.agents.set(name, agent);
    return agent;
  }

  async inspectPane(paneId: string): Promise<LiveAgent | undefined> {
    return [...this.agents.values()].find((agent) => agent.paneId === paneId);
  }

  async closePane(paneId: string): Promise<void> {
    this.closed.push(paneId);
    const found = [...this.agents.entries()].find(([, agent]) => agent.paneId === paneId);
    if (found) this.agents.delete(found[0]);
  }
}

class FakePanes implements DepartmentPaneManager {
  next = 1;
  readonly closed: string[] = [];
  failClose = false;

  async allocate(): Promise<DepartmentPanePlacement> {
    return { paneId: `department-pane-${this.next++}`, tabId: "departments-tab", supervisorOwned: true };
  }

  async close(
    entry: { paneId?: string },
    _entries: unknown[],
    closePane: (paneId: string) => Promise<void>,
  ): Promise<"pane" | "tab"> {
    if (this.failClose) throw new Error("simulated close failure");
    if (entry.paneId) {
      this.closed.push(entry.paneId);
      await closePane(entry.paneId);
    }
    return "pane";
  }
}

function request(id: string): InboundRequest {
  return {
    id,
    source: "discord",
    receivedAt: "2026-08-04T00:00:00.000Z",
    guildId: "1534051409291513856",
    channel: "design",
    channelId: "1534053394803593246",
    authorId: "1534049933244628992",
    authorName: "Owner",
    content: "Design the scene.",
    attachments: [],
    department: "design",
    targetAgent: "design-lead",
    replyChannel: "design",
  };
}

function setup(): {
  supervisor: DepartmentSupervisor;
  store: WorkspaceStore;
  control: FakeControl;
  panes: FakePanes;
  setNow(value: string): void;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sandora-supervisor-"));
  temporaryDirectories.push(root);
  const store = new WorkspaceStore(root);
  const control = new FakeControl();
  const panes = new FakePanes();
  let current = new Date("2026-08-04T00:00:00.000Z");
  const supervisor = new DepartmentSupervisor(
    loadBridgeConfig(),
    store,
    new EventPublisher(store),
    control,
    panes,
    () => current,
  );
  return { supervisor, store, control, panes, setNow: (value) => { current = new Date(value); } };
}

describe("DepartmentSupervisor", () => {
  it("reconciles five departments offline without replacing CEO", async () => {
    const { supervisor, store, control } = setup();
    const leads = await supervisor.reconcileLeads();
    expect(leads).toHaveLength(6);
    expect(control.agents.size).toBe(1);
    expect(store.readAgent("product-lead")?.lifecycle).toBe("offline");
  });

  it("recovers the persisted CEO name only when the same pane is unnamed", async () => {
    const { supervisor, store, control } = setup();
    store.upsertAgent({
      name: "ceo",
      department: "ceo",
      role: "lead",
      paneId: "w1:p1",
      lifecycle: "working",
      runtime: "codex",
      model: "gpt-5.6-sol",
      activeRequestIds: [],
      updatedAt: "2026-08-04T00:00:00.000Z",
    });
    const unnamed = control.agents.get("ceo")!;
    control.agents.delete("ceo");
    control.agents.set("w1:p1", { ...unnamed, name: undefined });
    await supervisor.reconcileLeads();
    expect(control.agents.get("ceo")).toMatchObject({ paneId: "w1:p1", name: "ceo" });
    expect(control.agents.size).toBe(1);
  });

  it("assigns the lead first and creates an elastic worker while busy", async () => {
    const { supervisor, store } = setup();
    await supervisor.reconcileLeads();
    const first = await supervisor.assign(request("discord-first"));
    const secondRequest = request("discord-second");
    const second = await supervisor.assign(secondRequest);
    expect(first).toMatchObject({ agentName: "design-lead", role: "lead" });
    expect(first).toMatchObject({ runtime: "agy", control: "raw" });
    expect(second.role).toBe("worker");
    expect(second.agentName).toMatch(/^design-worker-/);
    expect(store.readAgent(second.agentName)?.parentAgent).toBe("design-lead");
    expect(store.listPending().some((item) => item.message.channel === "agent-activity"))
      .toBe(true);
  });

  it("keeps an idle lead warm, reuses it, then closes it after ten minutes", async () => {
    const { supervisor, store, control, setNow } = setup();
    await supervisor.reconcileLeads();
    const firstRequest = request("discord-warm-first");
    const first = await supervisor.assign(firstRequest);
    await supervisor.release(firstRequest, first);
    expect(store.readAgent("design-lead")?.lifecycle).toBe("warm");

    setNow("2026-08-04T00:05:00.000Z");
    const followUp = request("discord-warm-followup");
    const reused = await supervisor.assign(followUp);
    expect(reused.paneId).toBe(first.paneId);
    await supervisor.release(followUp, reused);

    setNow("2026-08-04T00:16:00.000Z");
    expect(await supervisor.sweepExpired()).toBe(1);
    expect(store.readAgent("design-lead")?.lifecycle).toBe("offline");
    expect(control.closed).toContain(first.paneId);
  });

  it("refuses to close a legacy pane without supervisor ownership", async () => {
    const { supervisor, store, control } = setup();
    await supervisor.reconcileLeads();
    control.agents.set("design-lead", {
      name: "design-lead",
      paneId: "legacy-pane",
      status: "idle",
    });
    store.upsertAgent({
      name: "design-lead",
      department: "design",
      role: "lead",
      paneId: "legacy-pane",
      lifecycle: "warm",
      runtime: "codex",
      model: "gpt-5.6-terra",
      control: "canonical",
      activeRequestIds: [],
      updatedAt: "2026-08-03T23:40:00.000Z",
      warmUntil: "2026-08-03T23:50:00.000Z",
    });
    expect(await supervisor.sweepExpired(new Date("2026-08-04T00:00:00.000Z"))).toBe(0);
    expect(store.readAgent("design-lead")).toMatchObject({
      lifecycle: "recovering",
      lastError: "Refusing to close unowned pane legacy-pane",
    });
    expect(control.closed).not.toContain("legacy-pane");
  });

  it("preserves recovery state when an owned warm pane cannot close", async () => {
    const { supervisor, store, panes, setNow } = setup();
    await supervisor.reconcileLeads();
    const task = request("discord-close-failure");
    const assignment = await supervisor.assign(task);
    await supervisor.release(task, assignment);
    panes.failClose = true;
    setNow("2026-08-04T00:11:00.000Z");
    expect(await supervisor.sweepExpired()).toBe(0);
    expect(store.readAgent("design-lead")).toMatchObject({
      lifecycle: "recovering",
      lastError: "simulated close failure",
    });
  });

  it("releases and closes only elastic worker panes", async () => {
    const { supervisor, control } = setup();
    await supervisor.reconcileLeads();
    const firstRequest = request("discord-first");
    await supervisor.assign(firstRequest);
    const secondRequest = request("discord-second");
    const worker = await supervisor.assign(secondRequest);
    await supervisor.release(secondRequest, worker);
    expect(control.closed).toEqual([worker.paneId]);
  });

  it("queues a durable handoff to the stable lead instead of cloning", async () => {
    const { supervisor } = setup();
    await supervisor.reconcileLeads();
    await supervisor.assign(request("discord-parent"));
    const handoff = request("handoff-child");
    handoff.source = "handoff";
    handoff.parentRequestId = "discord-parent";
    const assignment = await supervisor.assign(handoff);
    expect(assignment).toMatchObject({ agentName: "design-lead", role: "lead" });
  });

  it("queues a coupled second request instead of creating a worker", async () => {
    const { supervisor } = setup();
    await supervisor.reconcileLeads();
    await supervisor.assign(request("discord-first"));
    const coupled = request("discord-coupled");
    coupled.content = "Continue the previous production task";
    const assignment = await supervisor.assign(coupled);
    expect(assignment).toMatchObject({ agentName: "design-lead", role: "lead" });
  });

  it("reconciles a persisted missing worker without replaying it", async () => {
    const { supervisor, store } = setup();
    store.upsertAgent({
      name: "design-worker-missing",
      department: "design",
      role: "worker",
      parentAgent: "design-lead",
      paneId: "missing-pane",
      lifecycle: "working",
      runtime: "cmdc",
      model: "gpt-5.6-luna",
      activeRequestIds: ["discord-missing"],
      updatedAt: "2026-08-04T00:00:00.000Z",
    });
    await supervisor.reconcileLeads();
    expect(store.readAgent("design-worker-missing")).toMatchObject({
      lifecycle: "recovering",
      lastError: "worker-pane-missing",
    });
  });
});
