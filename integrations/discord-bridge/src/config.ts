import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { bridgeRoot } from "./paths.js";
import type {
  ChannelName,
  DepartmentName,
  DiscordBridgeConfig,
  ScheduleConfig,
} from "./types.js";

const requiredChannels: ChannelName[] = [
  "general",
  "tech-company",
  "ceo-office",
  "approvals",
  "executive-reports",
  "design",
  "product",
  "engineering",
  "finance",
  "operations",
  "agent-activity",
  "system-log",
];

const requiredDepartments: DepartmentName[] = [
  "ceo",
  "product",
  "design",
  "engineering",
  "finance",
  "operations",
];

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function assertDiscordId(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value)) {
    throw new Error(`${label} must be a Discord snowflake ID`);
  }
}

function assertChannelName(
  label: string,
  value: unknown,
  channels: Record<string, string>,
): asserts value is ChannelName {
  if (typeof value !== "string" || !(value in channels)) {
    throw new Error(`${label} must name a configured channel`);
  }
}

export function loadBridgeConfig(
  configPath = path.join(bridgeRoot, "config", "discord.json"),
): DiscordBridgeConfig {
  const config = readJson<DiscordBridgeConfig>(configPath);

  assertDiscordId("applicationId", config.applicationId);
  assertDiscordId("guildId", config.guildId);
  assertDiscordId("ownerUserId", config.ownerUserId);

  if (typeof config.publicKey !== "string" || !/^[a-f0-9]{64}$/i.test(config.publicKey)) {
    throw new Error("publicKey must be a 64-character hexadecimal Discord public key");
  }

  for (const channel of requiredChannels) {
    assertDiscordId(`channels.${channel}`, config.channels?.[channel]);
  }

  assertChannelName("inboundChannel", config.inboundChannel, config.channels);
  assertChannelName(
    "defaultOutboundChannel",
    config.defaultOutboundChannel,
    config.channels,
  );

  if (!config.herdrAgent?.trim()) {
    throw new Error("herdrAgent is required");
  }
  if (typeof config.departmentRoutingEnabled !== "boolean") {
    throw new Error("departmentRoutingEnabled must be boolean");
  }
  const departmentChannels = new Set<ChannelName>();
  const leadAgents = new Set<string>();
  for (const department of requiredDepartments) {
    const entry = config.departments?.[department];
    if (!entry?.displayName?.trim() || !entry.leadAgent?.trim()) {
      throw new Error(`departments.${department} needs displayName and leadAgent`);
    }
    assertChannelName(
      `departments.${department}.channel`,
      entry.channel,
      config.channels,
    );
    if (!entry.profilePath?.trim() || entry.runtime !== "codex" || !entry.model?.trim()) {
      throw new Error(
        `departments.${department} needs profilePath, codex runtime, and model`,
      );
    }
    if (departmentChannels.has(entry.channel)) {
      throw new Error(`duplicate department channel: ${entry.channel}`);
    }
    if (leadAgents.has(entry.leadAgent)) {
      throw new Error(`duplicate department lead: ${entry.leadAgent}`);
    }
    departmentChannels.add(entry.channel);
    leadAgents.add(entry.leadAgent);
  }
  for (const leadAgent of leadAgents) {
    const persona = config.personas?.[leadAgent];
    if (!persona?.displayName?.trim() || !persona.avatarPath?.trim()) {
      throw new Error(`personas.${leadAgent} needs displayName and avatarPath`);
    }
    const avatarPath = path.resolve(bridgeRoot, "../..", persona.avatarPath);
    const repositoryRoot = path.resolve(bridgeRoot, "../..");
    const relative = path.relative(repositoryRoot, avatarPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`personas.${leadAgent}.avatarPath must stay inside the repository`);
    }
    if (path.extname(avatarPath).toLowerCase() !== ".png" || !fs.statSync(avatarPath).isFile()) {
      throw new Error(`personas.${leadAgent}.avatarPath must name an existing PNG file`);
    }
  }
  if (!Array.isArray(config.outputOnlyChannels)) {
    throw new Error("outputOnlyChannels must be an array");
  }
  for (const channel of config.outputOnlyChannels) {
    assertChannelName("outputOnlyChannels entry", channel, config.channels);
    if (departmentChannels.has(channel)) {
      throw new Error(`department channel cannot be output-only: ${channel}`);
    }
  }
  if (!Number.isInteger(config.herdrTimeoutMs) || config.herdrTimeoutMs < 30_000) {
    throw new Error("herdrTimeoutMs must be an integer of at least 30000");
  }
  if (!Number.isInteger(config.outboxPollMs) || config.outboxPollMs < 250) {
    throw new Error("outboxPollMs must be an integer of at least 250");
  }
  if (!Number.isInteger(config.inboxRetryPollMs) || config.inboxRetryPollMs < 1_000) {
    throw new Error("inboxRetryPollMs must be an integer of at least 1000");
  }
  if (!Number.isInteger(config.maxDeliveryAttempts) || config.maxDeliveryAttempts < 1) {
    throw new Error("maxDeliveryAttempts must be a positive integer");
  }
  if (!Number.isInteger(config.maxDispatchAttempts) || config.maxDispatchAttempts < 1) {
    throw new Error("maxDispatchAttempts must be a positive integer");
  }

  return config;
}

export function loadScheduleConfig(
  configPath = path.join(bridgeRoot, "config", "schedules.json"),
): ScheduleConfig {
  const config = readJson<ScheduleConfig>(configPath);
  if (!config.timezone?.trim()) {
    throw new Error("schedule timezone is required");
  }
  if (!Array.isArray(config.jobs)) {
    throw new Error("schedule jobs must be an array");
  }
  const knownChannels = loadBridgeConfig().channels;
  const names = new Set<string>();
  for (const job of config.jobs) {
    if (!job.name?.trim() || !job.cron?.trim() || !job.task?.trim()) {
      throw new Error("every schedule job needs name, cron, and task");
    }
    if (typeof job.enabled !== "boolean") {
      throw new Error(`schedule job ${job.name} enabled must be boolean`);
    }
    if (!cron.validate(job.cron)) {
      throw new Error(`schedule job ${job.name} has an invalid cron expression`);
    }
    if (!(job.channel in knownChannels)) {
      throw new Error(`schedule job ${job.name} has an unknown channel`);
    }
    if (names.has(job.name)) {
      throw new Error(`duplicate schedule job name: ${job.name}`);
    }
    names.add(job.name);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: config.timezone }).format();
  } catch {
    throw new Error(`invalid schedule timezone: ${config.timezone}`);
  }
  return config;
}

export function requireBotToken(environment = process.env): string {
  const token = environment.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "DISCORD_BOT_TOKEN is missing. Start through start-discord-bridge.ps1 and enter the reset token locally.",
    );
  }
  return token;
}
