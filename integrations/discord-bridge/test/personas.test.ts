import { describe, expect, it } from "vitest";
import { loadBridgeConfig } from "../src/config.js";
import { resolvePersona } from "../src/personas.js";

describe("Discord personas", () => {
  const config = loadBridgeConfig();

  it("maps every persistent lead to a distinct avatar", () => {
    const avatars = Object.values(config.departments).map((department) =>
      resolvePersona(config, department.leadAgent)?.avatarPath,
    );
    expect(avatars.every(Boolean)).toBe(true);
    expect(new Set(avatars).size).toBe(6);
  });

  it("maps an elastic worker to its department lead persona", () => {
    expect(resolvePersona(config, "design-worker-01")?.displayName).toBe("design-lead");
  });

  it("leaves system authors on the primary bot identity", () => {
    expect(resolvePersona(config, "Sandora System")).toBeUndefined();
  });
});
