import fs from "node:fs";
import path from "node:path";

const allowedImageExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const maximumAttachmentBytes = 10 * 1024 * 1024;
const maximumAttachmentCount = 10;

function insideRepository(repositoryRoot: string, candidate: string): boolean {
  const relative = path.relative(repositoryRoot, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function normalizeAttachmentPaths(
  repositoryRoot: string,
  attachmentPaths: string[],
): string[] {
  if (attachmentPaths.length > maximumAttachmentCount) {
    throw new Error(`At most ${maximumAttachmentCount} attachments are allowed`);
  }

  return attachmentPaths.map((attachmentPath) => {
    const resolved = path.isAbsolute(attachmentPath)
      ? path.resolve(attachmentPath)
      : path.resolve(repositoryRoot, attachmentPath);
    if (!insideRepository(repositoryRoot, resolved)) {
      throw new Error("Attachments must stay inside the Sandora repository");
    }
    const extension = path.extname(resolved).toLowerCase();
    if (!allowedImageExtensions.has(extension)) {
      throw new Error(`Unsupported attachment type: ${extension || "no extension"}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new Error(`Attachment is not a file: ${attachmentPath}`);
    if (stat.size > maximumAttachmentBytes) {
      throw new Error(`Attachment exceeds 10 MiB: ${attachmentPath}`);
    }
    return path.relative(repositoryRoot, resolved).replaceAll("\\", "/");
  });
}

export function resolveAttachmentPaths(
  repositoryRoot: string,
  attachmentPaths: string[] = [],
): string[] {
  return normalizeAttachmentPaths(repositoryRoot, attachmentPaths).map((relative) =>
    path.resolve(repositoryRoot, relative),
  );
}
