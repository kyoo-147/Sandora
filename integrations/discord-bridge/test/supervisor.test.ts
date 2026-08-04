import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadBridgeConfig } from "../src/config.js";
import { EventPublisher } from "../src/events.js";
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

  async startAgent(name: string): Promise<LiveAgent> {
    const agent = { name, paneId: `pane-${name}`, status: "idle" };
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

  async startRawWorker(name: string): Promise<LiveAgent> {
    const agent = { name, paneId: `raw-${name}`, status: "unknown" };
    this.agents.set(name, agent);
    return agent;
  }

  async inspectPane(paneId: string): Promise<LiveAgent | undefined> {
    return [...this.agents.values()].find((agent) => agent.paneId === paneId);
  }

  async closePane(paneId: string): Promise<void> {
    this.closed.push(paneId);
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
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sandora-supervisor-"));
  temporaryDirectories.push(root);
  const store = new WorkspaceStore(root);
  const control = new FakeControl();
  const supervisor = new DepartmentSupervisor(
    loadBridgeConfig(),
    store,
    new EventPublisher(store),
    control,
  );
  return { supervisor, store, control };
}

describe("DepartmentSupervisor", () => {
  it("reconciles five missing department leads without replacing CEO", async () => {
    const { supervisor, store, control } = setup();
    const leads = await supervisor.reconcileLeads();
    expect(leads).toHaveLength(6);
    expect(control.agents.size).toBe(6);
    expect(store.readAgent("product-lead")?.lifecycle).toBe("idle");
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
    expect(control.agents.size).toBe(6);
  });

  it("assigns the lead first and creates an elastic worker while busy", async () => {
    const { supervisor, store } = setup();
    await supervisor.reconcileLeads();
    const first = await supervisor.assign(request("discord-first"));
    const secondRequest = request("discord-second");
    const second = await supervisor.assign(secondRequest);
    expect(first).toMatchObject({ agentName: "design-lead", role: "lead" });
    expect(second.role).toBe("worker");
    expect(second.agentName).toMatch(/^design-worker-/);
    expect(store.readAgent(second.agentName)?.parentAgent).toBe("design-lead");
    expect(store.listPending().some((item) => item.message.channel === "agent-activity"))
      .toBe(true);
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
