import fs from "node:fs";
import path from "node:path";
import type { Collection, Webhook } from "discord.js";
import type { DiscordBridgeConfig, PersonaConfig } from "./types.js";

interface WebhookCapableChannel {
  id: string;
  fetchWebhooks(): Promise<Collection<string, Webhook>>;
  createWebhook(options: { name: string; avatar: Buffer; reason: string }): Promise<Webhook>;
}

export interface PersonaSendPayload {
  content: string;
  files: string[];
  allowedMentions: { parse: never[] };
}

export function resolvePersona(
  config: DiscordBridgeConfig,
  author: string,
): PersonaConfig | undefined {
  const direct = config.personas[author];
  if (direct) return direct;
  const department = Object.values(config.departments).find((entry) =>
    author.startsWith(entry.leadAgent.replace(/-lead$/, "-worker-")),
  );
  return department ? config.personas[department.leadAgent] : undefined;
}

export class PersonaWebhookSender {
  private readonly cache = new Map<string, Webhook>();

  constructor(
    private readonly config: DiscordBridgeConfig,
    private readonly repositoryRoot: string,
    private readonly botUserId: () => string | undefined,
  ) {}

  supports(channel: object): channel is WebhookCapableChannel {
    return "fetchWebhooks" in channel && "createWebhook" in channel;
  }

  async send(
    channel: WebhookCapableChannel,
    author: string,
    payload: PersonaSendPayload,
  ): Promise<boolean> {
    const persona = resolvePersona(this.config, author);
    if (!persona) return false;
    const cacheKey = `${channel.id}:${persona.displayName}`;
    let webhook = this.cache.get(cacheKey);
    if (!webhook) {
      const webhooks = await channel.fetchWebhooks();
      webhook = webhooks.find((candidate) =>
        candidate.name === persona.displayName &&
        candidate.owner?.id === this.botUserId(),
      );
      if (!webhook) {
        const avatar = fs.readFileSync(path.resolve(this.repositoryRoot, persona.avatarPath));
        webhook = await channel.createWebhook({
          name: persona.displayName,
          avatar,
          reason: `Sandora persona for ${persona.displayName}`,
        });
      }
      this.cache.set(cacheKey, webhook);
    }
    await webhook.send(payload);
    return true;
  }
}
