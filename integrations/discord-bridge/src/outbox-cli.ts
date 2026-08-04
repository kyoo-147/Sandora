import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeAttachmentPaths } from "./attachments.js";
import { loadBridgeConfig } from "./config.js";
import { repositoryRoot, workspaceRoot } from "./paths.js";
import { WorkspaceStore } from "./store.js";
import type { ChannelName, OutboundKind, OutboundMessage } from "./types.js";

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

function resolveContent(arguments_: Map<string, string>): string {
  const inline = arguments_.get("content")?.trim();
  const contentFile = arguments_.get("content-file")?.trim();
  if (inline && contentFile) {
    throw new Error("Use either --content or --content-file, not both");
  }
  if (inline) return inline;
  if (!contentFile) throw new Error("--content or --content-file is required");
  const resolved = path.isAbsolute(contentFile)
    ? contentFile
    : path.resolve(repositoryRoot, contentFile);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--content-file must stay inside the Sandora repository");
  }
  return fs.readFileSync(resolved, "utf8").trim();
}

function resolveAttachments(arguments_: Map<string, string>): string[] {
  const value = arguments_.get("attachments")?.trim();
  if (!value) return [];
  return normalizeAttachmentPaths(
    repositoryRoot,
    value.split(";").map((entry) => entry.trim()).filter(Boolean),
  );
}

function main(): void {
  const arguments_ = parseArguments(process.argv.slice(2));
  const config = loadBridgeConfig();
  const channel = required(arguments_, "channel") as ChannelName;
  if (!(channel in config.channels)) {
    throw new Error(`Unknown Discord channel alias: ${channel}`);
  }
  if (["agent-activity", "system-log"].includes(channel)) {
    throw new Error(
      "Observability channels accept only typed internal events, not arbitrary outbox content",
    );
  }

  const allowedKinds: OutboundKind[] = ["update", "final", "report", "approval", "error"];
  const kind = required(arguments_, "kind") as OutboundKind;
  if (!allowedKinds.includes(kind)) {
    throw new Error(`Unknown outbound kind: ${kind}`);
  }

  const message: OutboundMessage = {
    id: randomUUID(),
    requestId: required(arguments_, "request-id"),
    createdAt: new Date().toISOString(),
    channel,
    kind,
    author: required(arguments_, "author"),
    content: resolveContent(arguments_),
    attachments: resolveAttachments(arguments_),
  };

  const store = new WorkspaceStore(workspaceRoot);
  const filePath = store.enqueueOutbound(message);
  process.stdout.write(`${path.relative(repositoryRoot, filePath)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
