import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../src/store.js";
import type { InboundRequest, OutboundMessage } from "../src/types.js";
import { EventPublisher, redactEventText } from "../src/events.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeStore(): WorkspaceStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sandora-discord-store-"));
  temporaryDirectories.push(root);
  return new WorkspaceStore(root);
}

describe("WorkspaceStore", () => {
  it("admits an inbound request once", () => {
    const store = makeStore();
    const request: InboundRequest = {
      id: "discord-123",
      source: "discord",
      receivedAt: "2026-08-04T00:00:00.000Z",
      guildId: "1534051409291513856",
      channel: "ceo-office",
      channelId: "1534053312582778950",
      authorId: "1534049933244628992",
      authorName: "Owner",
      content: "Prepare the quarterly report.",
      attachments: [],
      department: "ceo",
      targetAgent: "ceo",
    };

    const firstPath = store.admitInbound(request);
    const secondPath = store.admitInbound(request);
    expect(secondPath).toBe(firstPath);
    expect(store.hasInbound(request.id)).toBe(true);
    expect(fs.readdirSync(store.inboxDirectory)).toHaveLength(1);
    expect(store.listRecoverableInbound()).toHaveLength(1);

    store.markInboundAssigned(request, "ceo");
    store.markInboundDispatching(request.id);
    store.markInboundRetry(request.id, "temporary", 0);
    expect(store.listRecoverableInbound()).toHaveLength(1);

    store.markInboundAssigned(request, "ceo");
    store.markInboundDispatching(request.id);
    store.markInboundSubmitted(request.id, "prompt started");
    store.markInboundSettled(request.id);
    expect(store.listRecoverableInbound()).toHaveLength(0);
  });

  it("reconstructs missing request state from the durable inbox", () => {
    const store = makeStore();
    const request: InboundRequest = {
      id: "discord-recover",
      source: "discord",
      receivedAt: "2026-08-04T00:00:00.000Z",
      guildId: "1534051409291513856",
      channel: "ceo-office",
      channelId: "1534053312582778950",
      authorId: "1534049933244628992",
      authorName: "Owner",
      content: "Recover this request.",
      attachments: [],
      department: "ceo",
      targetAgent: "ceo",
    };
    store.admitInbound(request);
    fs.rmSync(path.join(store.requestStateDirectory, `${request.id}.json`));

    expect(store.listRecoverableInbound()).toEqual([request]);
    expect(store.readInboundState(request.id)?.status).toBe("admitted");
  });

  it("does not replay an ambiguously submitted prompt", () => {
    const store = makeStore();
    const request: InboundRequest = {
      id: "discord-ambiguous",
      source: "discord",
      receivedAt: "2026-08-04T00:00:00.000Z",
      guildId: "1534051409291513856",
      channel: "ceo-office",
      channelId: "1534053312582778950",
      authorId: "1534049933244628992",
      authorName: "Owner",
      content: "Do this only once.",
      attachments: [],
      department: "ceo",
      targetAgent: "ceo",
    };
    store.admitInbound(request);
    store.markInboundAssigned(request, "ceo");
    store.markInboundDispatching(request.id);
    store.markInboundSubmitted(request.id, "prompt timed out");

    expect(store.listRecoverableInbound()).toEqual([]);
    expect(store.readInboundState(request.id)?.status).toBe("submitted");
    expect(() => store.markInboundRetry(request.id, "unsafe replay", 0)).toThrow(
      /Illegal request transition/,
    );
  });

  it("moves delivered output from pending to sent", () => {
    const store = makeStore();
    const message: OutboundMessage = {
      id: "out-1",
      requestId: "discord-123",
      createdAt: "2026-08-04T00:00:00.000Z",
      channel: "ceo-office",
      kind: "final",
      author: "ceo",
      content: "Completed.",
    };

    const pendingPath = store.enqueueOutbound(message);
    expect(store.listPending()).toHaveLength(1);
    const sentPath = store.markSent(pendingPath);
    expect(fs.existsSync(pendingPath)).toBe(false);
    expect(fs.existsSync(sentPath)).toBe(true);
  });

  it("persists partial delivery progress in pending output", () => {
    const store = makeStore();
    const message: OutboundMessage = {
      id: "out-2",
      requestId: "discord-123",
      createdAt: "2026-08-04T00:00:00.000Z",
      channel: "ceo-office",
      kind: "report",
      author: "ceo",
      content: "Long report.",
      delivery: { attempts: 1, nextChunk: 2 },
    };
    const pendingPath = store.enqueueOutbound(message);
    message.delivery = {
      attempts: 2,
      nextChunk: 2,
      nextAttemptAt: "2026-08-04T00:01:00.000Z",
      lastError: "temporary network error",
    };
    store.updatePending(pendingPath, message);
    expect(store.listPending()[0]?.message.delivery).toEqual(message.delivery);
  });

  it("persists agent registry and redacted company events", () => {
    const store = makeStore();
    store.upsertAgent({
      name: "design-lead",
      department: "design",
      role: "lead",
      lifecycle: "idle",
      runtime: "codex",
      model: "gpt-5.6-terra",
      activeRequestIds: [],
      updatedAt: "2026-08-04T00:00:00.000Z",
    });
    expect(store.readAgent("design-lead")?.department).toBe("design");
    expect(store.listAgents()).toHaveLength(1);

    const publisher = new EventPublisher(store);
    publisher.publish({
      level: "warning",
      code: "dispatch.retry",
      summary: "Retry without task content",
      detail: "DISCORD_BOT_TOKEN=secret-value",
      department: "design",
      requestId: "discord-123",
    });
    const pending = store.listPending()[0]?.message;
    expect(pending?.channel).toBe("system-log");
    expect(pending?.content).toContain("[REDACTED]");
    expect(pending?.content).not.toContain("secret-value");
  });

  it("redacts Discord-shaped tokens from events", () => {
    const token = `${"A".repeat(24)}.${"B".repeat(6)}.${"C".repeat(32)}`;
    expect(redactEventText(`token ${token}`)).toBe("token [REDACTED_TOKEN]");
    expect(redactEventText("failed\n    at secret/path.ts:12:4")).toBe("failed");
    expect(
      redactEventText("Command failed [DISCORD_DEPARTMENT_TASK]\nprivate prompt"),
    ).toContain("[REDACTED_PROMPT]");
  });

  it("enforces a single bridge writer for one workspace", () => {
    const store = makeStore();
    const competitor = new WorkspaceStore(store.root);
    store.acquireBridgeLock();
    expect(() => competitor.acquireBridgeLock()).toThrow(/holds the lock/);
    store.releaseBridgeLock();
    expect(() => competitor.acquireBridgeLock()).not.toThrow();
    competitor.releaseBridgeLock();
  });

  it("distinguishes operational events from durable task outcomes", () => {
    const store = makeStore();
    const publisher = new EventPublisher(store);
    publisher.publish({
      level: "activity",
      code: "task.accepted",
      requestId: "discord-outcome",
      summary: "Accepted",
    });
    expect(store.hasDurableOutcome("discord-outcome")).toBe(false);
    store.enqueueOutbound({
      id: "final-outcome",
      requestId: "discord-outcome",
      createdAt: "2026-08-04T00:00:00.000Z",
      channel: "design",
      kind: "final",
      author: "design-lead",
      content: "Reviewed result.",
    });
    expect(store.hasDurableOutcome("discord-outcome")).toBe(true);
  });
});
