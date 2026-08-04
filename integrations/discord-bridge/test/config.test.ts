import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  loadBridgeConfig,
  loadScheduleConfig,
  requireBotToken,
} from "../src/config.js";
import { bridgeRoot } from "../src/paths.js";

describe("bridge configuration", () => {
  it("loads the checked-in non-secret Discord IDs", () => {
    const config = loadBridgeConfig();
    expect(config.guildId).toBe("1534051409291513856");
    expect(config.ownerUserId).toBe("1534049933244628992");
    expect(config.channels["ceo-office"]).toBe("1534053312582778950");
    expect(config.departments.design.leadAgent).toBe("design-lead");
    expect(config.departmentRoutingEnabled).toBe(true);
  });

  it("keeps every schedule disabled before live validation", () => {
    const schedules = loadScheduleConfig(
      path.join(bridgeRoot, "config", "schedules.json"),
    );
    expect(schedules.jobs.length).toBeGreaterThan(0);
    expect(schedules.jobs.every((job) => !job.enabled)).toBe(true);
  });

  it("rejects a missing bot token", () => {
    expect(() => requireBotToken({})).toThrow(/DISCORD_BOT_TOKEN is missing/);
  });

  it("rejects a truthy string in place of a schedule boolean", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sandora-schedule-"));
    const filePath = path.join(directory, "schedules.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        timezone: "Asia/Bangkok",
        jobs: [
          {
            name: "unsafe",
            cron: "0 9 * * *",
            enabled: "false",
            channel: "executive-reports",
            task: "Should not activate.",
          },
        ],
      }),
    );
    try {
      expect(() => loadScheduleConfig(filePath)).toThrow(/enabled must be boolean/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
