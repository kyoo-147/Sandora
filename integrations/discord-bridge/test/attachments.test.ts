import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAttachmentPaths, resolveAttachmentPaths } from "../src/attachments.js";

const temporaryRoots: string[] = [];

function repository(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sandora-attachments-"));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, "designs"));
  fs.writeFileSync(path.join(root, "designs", "sample.png"), "sample");
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("outbound attachments", () => {
  it("stores repository-relative paths and resolves them for Discord", () => {
    const root = repository();
    const normalized = normalizeAttachmentPaths(root, ["designs/sample.png"]);
    expect(normalized).toEqual(["designs/sample.png"]);
    expect(resolveAttachmentPaths(root, normalized)).toEqual([
      path.join(root, "designs", "sample.png"),
    ]);
  });

  it("rejects paths outside the repository", () => {
    const root = repository();
    expect(() => normalizeAttachmentPaths(root, [path.join(root, "..", "outside.png")]))
      .toThrow(/inside the Sandora repository/);
  });

  it("rejects non-image files", () => {
    const root = repository();
    fs.writeFileSync(path.join(root, "designs", "notes.txt"), "notes");
    expect(() => normalizeAttachmentPaths(root, ["designs/notes.txt"]))
      .toThrow(/Unsupported attachment type/);
  });
});
