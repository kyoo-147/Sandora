import { describe, expect, it } from "vitest";
import { formatOutbound, splitDiscordMessage } from "../src/message.js";

describe("Discord message formatting", () => {
  it("splits long content without exceeding the requested limit", () => {
    const content = Array.from({ length: 80 }, (_, index) => `Line ${index}: ${"x".repeat(30)}`).join("\n");
    const chunks = splitDiscordMessage(content, 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 300)).toBe(true);
    expect(chunks.join("\n")).toContain("Line 79");
  });

  it("labels relayed department output", () => {
    expect(formatOutbound("Finance Analyst", "Revenue report ready.")).toBe(
      "**Finance Analyst**\nRevenue report ready.",
    );
  });
});
