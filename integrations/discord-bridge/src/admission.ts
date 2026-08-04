import type { Message } from "discord.js";
import type {
  ChannelName,
  DepartmentName,
  DiscordBridgeConfig,
  InboundRequest,
} from "./types.js";

function channelAliasFromId(
  channelId: string,
  config: DiscordBridgeConfig,
): ChannelName | undefined {
  return (Object.entries(config.channels) as [ChannelName, string][]).find(
    ([, id]) => id === channelId,
  )?.[0];
}

export function departmentFromChannel(
  channel: ChannelName,
  config: DiscordBridgeConfig,
): DepartmentName | undefined {
  return (
    Object.entries(config.departments) as [DepartmentName, { channel: ChannelName }][]
  )
    .find(([, department]) => department.channel === channel)?.[0];
}

export function requestFromDiscordMessage(
  message: Message,
  config: DiscordBridgeConfig,
): InboundRequest | undefined {
  if (message.author.bot) return undefined;
  if (message.guildId !== config.guildId) return undefined;
  if (message.author.id !== config.ownerUserId) return undefined;
  const channel = channelAliasFromId(message.channelId, config);
  if (!channel) return undefined;
  const department = config.departmentRoutingEnabled
    ? departmentFromChannel(channel, config)
    : channel === config.inboundChannel
      ? "ceo"
      : undefined;
  if (!department) return undefined;
  const target = config.departments[department];

  const attachments = [...message.attachments.values()].map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
    url: attachment.url,
  }));
  const content = message.content.trim() || "Review the attached Discord files.";

  return {
    id: `discord-${message.id}`,
    source: "discord",
    receivedAt: new Date(message.createdTimestamp).toISOString(),
    guildId: message.guildId,
    channel,
    channelId: message.channelId,
    authorId: message.author.id,
    authorName: message.author.username,
    content,
    attachments,
    department,
    targetAgent: target.leadAgent,
    replyChannel: channel,
  };
}
