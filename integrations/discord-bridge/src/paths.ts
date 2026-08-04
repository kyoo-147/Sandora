import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const parentDirectory = path.resolve(currentDirectory, "..");

export const bridgeRoot =
  path.basename(parentDirectory).toLowerCase() === "dist"
    ? path.resolve(parentDirectory, "..")
    : parentDirectory;
export const repositoryRoot = path.resolve(bridgeRoot, "../..");
export const workspaceRoot = path.join(repositoryRoot, "demo-company", "workspace");
