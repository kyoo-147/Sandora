export type ChannelName =
  | "general"
  | "tech-company"
  | "ceo-office"
  | "approvals"
  | "executive-reports"
  | "design"
  | "product"
  | "engineering"
  | "finance"
  | "operations"
  | "agent-activity"
  | "system-log";

export type DepartmentName =
  | "ceo"
  | "product"
  | "design"
  | "engineering"
  | "finance"
  | "operations";

export interface DepartmentConfig {
  displayName: string;
  channel: ChannelName;
  leadAgent: string;
  profilePath: string;
  runtime: "codex" | "auto";
  model: string;
}

export interface PersonaConfig {
  displayName: string;
  avatarPath: string;
}

export interface DiscordBridgeConfig {
  applicationId: string;
  publicKey: string;
  guildId: string;
  ownerUserId: string;
  channels: Record<ChannelName, string>;
  inboundChannel: ChannelName;
  defaultOutboundChannel: ChannelName;
  herdrAgent: string;
  departmentRoutingEnabled: boolean;
  demandDrivenDepartments: boolean;
  departmentTabLabel: string;
  departmentWarmLeaseMs: number;
  departmentSweepMs: number;
  departments: Record<DepartmentName, DepartmentConfig>;
  personas: Record<string, PersonaConfig>;
  outputOnlyChannels: ChannelName[];
  herdrTimeoutMs: number;
  outboxPollMs: number;
  inboxRetryPollMs: number;
  maxDeliveryAttempts: number;
  maxDispatchAttempts: number;
}

export interface ScheduleJobConfig {
  name: string;
  cron: string;
  enabled: boolean;
  channel: ChannelName;
  task: string;
}

export interface ScheduleConfig {
  timezone: string;
  jobs: ScheduleJobConfig[];
}

export interface AttachmentRecord {
  id: string;
  name: string;
  contentType: string | null;
  size: number;
  url: string;
}

export interface InboundRequest {
  id: string;
  source: "discord" | "schedule" | "handoff";
  receivedAt: string;
  guildId: string;
  channel: ChannelName;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  attachments: AttachmentRecord[];
  department: DepartmentName;
  targetAgent: string;
  parentRequestId?: string;
  scheduleName?: string;
  replyChannel?: ChannelName;
  parallelDecision?: {
    eligible: boolean;
    reason: string;
  };
}

export interface HandoffRecord {
  id: string;
  createdAt: string;
  parentRequestId: string;
  childRequestId: string;
  fromAgent: string;
  toDepartment: DepartmentName;
  summary: string;
  artifactPath?: string;
}

export type AgentLifecycle =
  | "starting"
  | "idle"
  | "warm"
  | "working"
  | "blocked"
  | "recovering"
  | "offline";

export interface AgentRegistryEntry {
  name: string;
  department: DepartmentName;
  role: "lead" | "worker";
  parentAgent?: string;
  paneId?: string;
  lifecycle: AgentLifecycle;
  runtime: string;
  model: string;
  control?: "canonical" | "raw";
  activeRequestIds: string[];
  updatedAt: string;
  tabId?: string;
  supervisorOwned?: boolean;
  lastUsedAt?: string;
  warmUntil?: string;
  lastError?: string;
}

export interface DispatchTarget {
  agentName: string;
  role: "lead" | "worker";
  paneId?: string;
  runtime: "codex" | "cmdc" | "agy";
  model: string;
  control: "canonical" | "raw";
  fallback?: string;
}

export type CompanyEventLevel = "activity" | "info" | "warning" | "error";

export interface CompanyEvent {
  id: string;
  occurredAt: string;
  level: CompanyEventLevel;
  code: string;
  department?: DepartmentName;
  requestId?: string;
  actor?: string;
  summary: string;
  detail?: string;
}

export type OutboundKind = "update" | "final" | "report" | "approval" | "error";

export interface OutboundMessage {
  id: string;
  requestId: string;
  createdAt: string;
  channel: ChannelName;
  kind: OutboundKind;
  author: string;
  content: string;
  attachments?: string[];
  delivery?: {
    attempts: number;
    nextChunk: number;
    nextAttemptAt?: string;
    lastError?: string;
  };
}

export interface PendingOutbound {
  path: string;
  message: OutboundMessage;
}

export interface InboundState {
  requestId: string;
  status:
    | "admitted"
    | "pending"
    | "assigned"
    | "dispatching"
    | "submitted"
    | "working"
    | "blocked"
    | "completed"
    | "delivered"
    | "settled"
    | "failed";
  version: number;
  attempts: number;
  updatedAt: string;
  nextAttemptAt?: string;
  lastError?: string;
  assignedAgent?: string;
  department?: DepartmentName;
  parentRequestId?: string;
  runtime?: string;
  model?: string;
  fallback?: string;
  artifactPaths?: string[];
  parallelEligible?: boolean;
  parallelReason?: string;
}
