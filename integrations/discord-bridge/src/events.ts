import { randomUUID } from "node:crypto";
import type { WorkspaceStore } from "./store.js";
import type {
  ChannelName,
  CompanyEvent,
  CompanyEventLevel,
  DepartmentName,
} from "./types.js";

const tokenPattern = /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g;
const secretAssignmentPattern = /(DISCORD_BOT_TOKEN\s*[=:]\s*)\S+/gi;

export function redactEventText(value: string): string {
  const redacted = value
    .replace(tokenPattern, "[REDACTED_TOKEN]")
    .replace(secretAssignmentPattern, "$1[REDACTED]")
    .replace(/\[DISCORD(?:_DEPARTMENT)?_TASK\][\s\S]*/g, "[REDACTED_PROMPT]");
  const firstSafeLine = redacted
    .split(/\r?\n/)
    .find((line) => !/^\s*at\s+/i.test(line) && !/\.(?:ts|js):\d+/i.test(line))
    ?.trim();
  return (firstSafeLine || "[REDACTED_DIAGNOSTIC]").slice(0, 300);
}

function eventChannel(level: CompanyEventLevel): ChannelName {
  return level === "activity" ? "agent-activity" : "system-log";
}

function icon(level: CompanyEventLevel): string {
  if (level === "activity") return "•";
  if (level === "warning") return "WARN";
  if (level === "error") return "ERROR";
  return "INFO";
}

export interface PublishEventInput {
  level: CompanyEventLevel;
  code: string;
  summary: string;
  detail?: string;
  department?: DepartmentName;
  requestId?: string;
  actor?: string;
}

export class EventPublisher {
  constructor(private readonly store: WorkspaceStore) {}

  publish(input: PublishEventInput): CompanyEvent {
    const event: CompanyEvent = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      level: input.level,
      code: input.code,
      summary: redactEventText(input.summary),
      detail: input.detail ? redactEventText(input.detail) : undefined,
      department: input.department,
      requestId: input.requestId,
      actor: input.actor,
    };
    this.store.appendEvent(event);
    const label = input.department?.toUpperCase() ?? "SYSTEM";
    const references = [
      event.requestId ? `Request: ${event.requestId}` : undefined,
      event.actor ? `Owner: ${event.actor}` : undefined,
      event.detail,
    ].filter(Boolean);
    this.store.enqueueOutbound({
      id: randomUUID(),
      requestId: event.requestId ?? `event-${event.id}`,
      createdAt: event.occurredAt,
      channel: eventChannel(event.level),
      kind: event.level === "error" ? "error" : "update",
      author: "Sandora System",
      content: `${icon(event.level)} ${label} · ${event.code}\n${event.summary}${
        references.length ? `\n${references.join("\n")}` : ""
      }`,
    });
    return event;
  }
}
