import { describe, expect, it } from "vitest";
import { decideParallelSafety, selectWorkerRoute } from "../src/runtime-routing.js";
import type { InboundRequest } from "../src/types.js";

function request(content: string): InboundRequest {
  return {
    id: "discord-route",
    source: "discord",
    receivedAt: "2026-08-04T00:00:00.000Z",
    guildId: "1534051409291513856",
    channel: "engineering",
    channelId: "1534053445236035704",
    authorId: "1534049933244628992",
    authorName: "Owner",
    content,
    attachments: [],
    department: "engineering",
    targetAgent: "engineering-lead",
    replyChannel: "engineering",
  };
}

describe("worker runtime routing", () => {
  it("routes bounded extraction to CMDC Go", () => {
    expect(selectWorkerRoute(request("Extract and format this catalog"))).toMatchObject({
      runtime: "cmdc",
      model: "gpt-5.6-luna",
      control: "raw",
    });
  });

  it("routes Google-oriented work to bounded raw AGY", () => {
    expect(selectWorkerRoute(request("Review this with Gemini"))).toMatchObject({
      runtime: "agy",
      control: "raw",
    });
  });

  it("keeps standard work off Sol through a verified raw runtime", () => {
    expect(selectWorkerRoute(request("Implement the approved component"))).toMatchObject({
      runtime: "cmdc",
      control: "raw",
    });
  });

  it("allows a distinct bounded department request to clone", () => {
    expect(decideParallelSafety(request("Create another independent component")))
      .toMatchObject({ eligible: true });
  });

  it("queues coupled or approval-sensitive work to the stable lead", () => {
    expect(decideParallelSafety(request("Continue the previous production deployment")))
      .toMatchObject({ eligible: false });
  });
});
