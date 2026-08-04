import { describe, expect, it } from "vitest";
import { loadBridgeConfig } from "../src/config.js";
import {
  assertHerdrEnvironment,
  buildCeoPrompt,
  buildDepartmentPrompt,
  HerdrPromptAmbiguousError,
  rawCompletionInstruction,
  RAW_COMPLETION_REGEX,
  sanitizedChildEnvironment,
} from "../src/herdr.js";
import type { InboundRequest } from "../src/types.js";

describe("Herdr admission", () => {
  it("requires a fully identified Herdr pane", () => {
    expect(() => assertHerdrEnvironment({ HERDR_ENV: "1" })).toThrow(
      /HERDR_WORKSPACE_ID/,
    );
    expect(() =>
      assertHerdrEnvironment({
        HERDR_ENV: "1",
        HERDR_WORKSPACE_ID: "w1",
        HERDR_TAB_ID: "w1:t1",
        HERDR_PANE_ID: "w1:p2",
      }),
    ).not.toThrow();
  });

  it("builds a bounded CEO envelope without embedding the Owner message", () => {
    const request: InboundRequest = {
      id: "discord-123",
      source: "discord",
      receivedAt: "2026-08-04T00:00:00.000Z",
      guildId: "1534051409291513856",
      channel: "ceo-office",
      channelId: "1534053312582778950",
      authorId: "1534049933244628992",
      authorName: "Owner",
      content: "Sensitive task text stays in the admitted record.",
      attachments: [],
      department: "ceo",
      targetAgent: "ceo",
    };
    const prompt = buildCeoPrompt(
      request,
      "D:\\working\\Sandora\\demo-company\\workspace\\inbox\\discord-123.json",
      "D:\\working\\Sandora",
    );
    expect(prompt).toContain("[DISCORD_TASK]");
    expect(prompt).toContain("request_id: discord-123");
    expect(prompt).toContain("demo-company/workspace/inbox/discord-123.json");
    expect(prompt).not.toContain(request.content);
  });

  it("builds a scoped department envelope for a worker", () => {
    const request: InboundRequest = {
      id: "discord-design",
      source: "discord",
      receivedAt: "2026-08-04T00:00:00.000Z",
      guildId: "1534051409291513856",
      channel: "design",
      channelId: "1534053394803593246",
      authorId: "1534049933244628992",
      authorName: "Owner",
      content: "Create a visual direction.",
      attachments: [],
      department: "design",
      targetAgent: "design-lead",
      replyChannel: "design",
    };
    const prompt = buildDepartmentPrompt(
      request,
      "D:\\working\\Sandora\\demo-company\\workspace\\inbox\\discord-design.json",
      "D:\\working\\Sandora",
      loadBridgeConfig(),
      "design-worker-01",
    );
    expect(prompt).toContain("department: design");
    expect(prompt).toContain("role: bounded worker");
    expect(prompt).toContain("must not create agents");
    expect(prompt).not.toContain(request.content);
  });

  it("never passes the Discord token to Herdr child processes", () => {
    const environment = sanitizedChildEnvironment({
      HERDR_ENV: "1",
      DISCORD_BOT_TOKEN: "must-not-leak",
      SAFE_VALUE: "kept",
    });
    expect(environment.DISCORD_BOT_TOKEN).toBeUndefined();
    expect(environment.SAFE_VALUE).toBe("kept");
  });

  it("labels an uncertain prompt outcome as non-replayable", () => {
    const error = new HerdrPromptAmbiguousError(new Error("timed out"), {
      boundedOutput: "bounded tail",
      recordedFallback: "codex:gpt-5.6-terra",
    });
    expect(error.submissionMayHaveOccurred).toBe(true);
    expect(error.message).toMatch(/automatic replay is disabled/);
    expect(error.boundedOutput).toBe("bounded tail");
    expect(error.recordedFallback).toContain("codex");
  });

  it("describes but does not embed the raw completion marker", () => {
    expect(rawCompletionInstruction()).toContain("joining the words");
    expect(rawCompletionInstruction()).not.toContain("SANDORA_DEPARTMENT_DONE");
    const marker = new RegExp(RAW_COMPLETION_REGEX);
    expect(marker.test("SANDORA_DEPARTMENT_DONE")).toBe(true);
    expect(marker.test("prefix SANDORA_DEPARTMENT_DONE suffix")).toBe(false);
  });
});
