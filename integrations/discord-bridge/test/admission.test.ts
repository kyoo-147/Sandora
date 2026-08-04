import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import { requestFromDiscordMessage } from "../src/admission.js";
import { loadBridgeConfig } from "../src/config.js";

const config = loadBridgeConfig();

function message(overrides: Record<string, unknown> = {}): Message {
  return {
    id: "1535000000000000001",
    guildId: config.guildId,
    channelId: config.channels["ceo-office"],
    content: "Prepare the company report.",
    createdTimestamp: Date.parse("2026-08-04T00:00:00.000Z"),
    author: {
      id: config.ownerUserId,
      username: "Owner",
      bot: false,
    },
    attachments: new Map(),
    ...overrides,
  } as unknown as Message;
}

describe("Discord admission matrix", () => {
  it("routes the Owner in ceo-office to CEO", () => {
    expect(requestFromDiscordMessage(message(), config)?.content).toBe(
      "Prepare the company report.",
    );
    expect(requestFromDiscordMessage(message(), config)?.targetAgent).toBe("ceo");
  });

  it.each([
    ["product", "product-lead"],
    ["design", "design-lead"],
    ["engineering", "engineering-lead"],
    ["finance", "finance-lead"],
    ["operations", "operations-lead"],
  ] as const)("routes #%s to %s", (channel, agent) => {
    const request = requestFromDiscordMessage(
      message({ channelId: config.channels[channel] }),
      config,
    );
    expect(request?.department).toBe(channel);
    expect(request?.targetAgent).toBe(agent);
    expect(request?.replyChannel).toBe(channel);
  });

  it.each([
    ["wrong guild", { guildId: "1535000000000000002" }],
    ["non-task channel", { channelId: config.channels["agent-activity"] }],
    [
      "wrong user",
      { author: { id: "1535000000000000003", username: "Other", bot: false } },
    ],
    [
      "bot author",
      { author: { id: config.ownerUserId, username: "Bot", bot: true } },
    ],
  ])("rejects %s", (_label, overrides) => {
    expect(requestFromDiscordMessage(message(overrides), config)).toBeUndefined();
  });

  it.each([
    "general",
    "tech-company",
    "approvals",
    "executive-reports",
    "agent-activity",
    "system-log",
  ] as const)("does not admit #%s as a task channel", (channel) => {
    expect(
      requestFromDiscordMessage(message({ channelId: config.channels[channel] }), config),
    ).toBeUndefined();
  });

  it("admits an attachment-only request with a bounded instruction", () => {
    const request = requestFromDiscordMessage(message({ content: "" }), config);
    expect(request?.content).toBe("Review the attached Discord files.");
  });
});
