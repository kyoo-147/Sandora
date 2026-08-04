import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadBridgeConfig } from "./config.js";
import { EventPublisher } from "./events.js";
import { repositoryRoot, workspaceRoot } from "./paths.js";
import { WorkspaceStore } from "./store.js";
import type { DepartmentName, HandoffRecord, InboundRequest } from "./types.js";

function parseArguments(arguments_: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "end of command"}`);
    }
    parsed.set(key.slice(2), value);
  }
  return parsed;
}

function required(arguments_: Map<string, string>, name: string): string {
  const value = arguments_.get(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function resolveArtifact(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const resolved = path.isAbsolute(value) ? value : path.resolve(repositoryRoot, value);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--artifact must stay inside the Sandora repository");
  }
  if (!fs.existsSync(resolved)) throw new Error("--artifact does not exist");
  return relative.replaceAll("\\", "/");
}

function main(): void {
  const arguments_ = parseArguments(process.argv.slice(2));
  const config = loadBridgeConfig();
  const store = new WorkspaceStore(workspaceRoot);
  const parentRequestId = required(arguments_, "parent-request-id");
  const parent = store.readInbound(parentRequestId);
  if (!parent) throw new Error(`Parent request not found: ${parentRequestId}`);
  const toDepartment = required(arguments_, "to") as DepartmentName;
  const target = config.departments[toDepartment];
  if (!target) throw new Error(`Unknown department: ${toDepartment}`);
  const summary = required(arguments_, "summary");
  const fromAgent = required(arguments_, "from");
  const artifactPath = resolveArtifact(arguments_.get("artifact"));
  const handoffId = randomUUID();
  const childRequestId = `handoff-${handoffId}`;
  const createdAt = new Date().toISOString();
  const child: InboundRequest = {
    id: childRequestId,
    source: "handoff",
    receivedAt: createdAt,
    guildId: parent.guildId,
    channel: parent.channel,
    channelId: parent.channelId,
    authorId: `agent:${fromAgent}`,
    authorName: fromAgent,
    content: artifactPath ? `${summary}\nArtifact: ${artifactPath}` : summary,
    attachments: [],
    department: toDepartment,
    targetAgent: target.leadAgent,
    parentRequestId,
    replyChannel: parent.replyChannel ?? parent.channel,
  };
  const handoff: HandoffRecord = {
    id: handoffId,
    createdAt,
    parentRequestId,
    childRequestId,
    fromAgent,
    toDepartment,
    summary,
    artifactPath,
  };
  store.admitInbound(child);
  const handoffPath = store.recordHandoff(handoff);
  new EventPublisher(store).publish({
    level: "activity",
    code: "task.handoff",
    department: toDepartment,
    requestId: parentRequestId,
    actor: fromAgent,
    summary: `${fromAgent} handed work to ${target.leadAgent}`,
    detail: artifactPath ? `Artifact: ${artifactPath}` : "Durable child request created",
  });
  process.stdout.write(`${path.relative(repositoryRoot, handoffPath)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
