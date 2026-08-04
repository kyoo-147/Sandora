import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentRegistryEntry } from "./types.js";

const execFileAsync = promisify(execFile);

export interface DepartmentPanePlacement {
  paneId: string;
  tabId: string;
  supervisorOwned: true;
}

export interface DepartmentPaneManager {
  allocate(entries: AgentRegistryEntry[]): Promise<DepartmentPanePlacement>;
  close(
    entry: AgentRegistryEntry,
    entries: AgentRegistryEntry[],
    closePane: (paneId: string) => Promise<void>,
  ): Promise<"pane" | "tab">;
}

interface LiveTab {
  tabId: string;
  label: string;
}

interface LivePane {
  paneId: string;
  tabId: string;
}

function childEnvironment(): NodeJS.ProcessEnv {
  const { DISCORD_BOT_TOKEN: _token, ...environment } = process.env;
  return environment;
}

export class HerdrDepartmentTabManager implements DepartmentPaneManager {
  private operation: Promise<unknown> = Promise.resolve();
  private ownedTabId?: string;

  constructor(
    private readonly repositoryRoot: string,
    private readonly label: string,
    private readonly workspaceId = process.env.HERDR_WORKSPACE_ID,
    private readonly timeoutMs = 60_000,
  ) {
    if (!workspaceId) throw new Error("HERDR_WORKSPACE_ID is required for department tabs");
  }

  allocate(entries: AgentRegistryEntry[]): Promise<DepartmentPanePlacement> {
    return this.lock(async () => {
      const tabs = await this.listTabs();
      let tab = tabs.find((candidate) => candidate.label === this.label);
      let created = false;
      if (tab) {
        const owned = entries.some((entry) =>
          entry.supervisorOwned && entry.tabId === tab?.tabId,
        );
        if (!owned && this.ownedTabId !== tab.tabId) {
          throw new Error(`Department tab ${tab.tabId} exists without registry ownership`);
        }
      } else {
        tab = await this.createTab();
        this.ownedTabId = tab.tabId;
        created = true;
      }
      const panes = (await this.listPanes()).filter((pane) => pane.tabId === tab.tabId);
      if (panes.length === 0) throw new Error(`Department tab ${tab.tabId} has no pane`);
      if (!created) {
        const knownPaneIds = new Set(
          entries
            .filter((entry) =>
              entry.supervisorOwned &&
              entry.tabId === tab?.tabId &&
              entry.paneId &&
              entry.lifecycle !== "offline",
            )
            .map((entry) => entry.paneId as string),
        );
        const unknown = panes.find((pane) => !knownPaneIds.has(pane.paneId));
        if (unknown) {
          throw new Error(`Department tab ${tab.tabId} contains unknown pane ${unknown.paneId}`);
        }
      }
      const paneId = created ? panes[0].paneId : await this.splitPane(panes[0].paneId);
      return { paneId, tabId: tab.tabId, supervisorOwned: true };
    });
  }

  close(
    entry: AgentRegistryEntry,
    entries: AgentRegistryEntry[],
    closePane: (paneId: string) => Promise<void>,
  ): Promise<"pane" | "tab"> {
    return this.lock(async () => {
      if (!entry.paneId) return "pane";
      if (!entry.tabId) {
        await closePane(entry.paneId);
        return "pane";
      }
      const livePanes = (await this.listPanes()).filter((pane) => pane.tabId === entry.tabId);
      const knownPaneIds = new Set(
        entries
          .filter((candidate) =>
            candidate.supervisorOwned &&
            candidate.tabId === entry.tabId &&
            candidate.paneId &&
            candidate.lifecycle !== "offline",
          )
          .map((candidate) => candidate.paneId as string),
      );
      const unknown = livePanes.filter((pane) => !knownPaneIds.has(pane.paneId));
      if (unknown.length > 0) {
        throw new Error(`Department tab ${entry.tabId} contains unknown pane ${unknown[0].paneId}`);
      }
      if (livePanes.length === 1 && livePanes[0].paneId === entry.paneId) {
        await this.exec(["tab", "close", entry.tabId]);
        if (this.ownedTabId === entry.tabId) this.ownedTabId = undefined;
        return "tab";
      }
      await closePane(entry.paneId);
      return "pane";
    });
  }

  private async listTabs(): Promise<LiveTab[]> {
    const output = await this.exec(["tab", "list", "--workspace", this.workspaceId as string]);
    const parsed = JSON.parse(output) as {
      result?: { tabs?: Array<{ tab_id?: string; label?: string }> };
    };
    return (parsed.result?.tabs ?? []).flatMap((tab) =>
      tab.tab_id ? [{ tabId: tab.tab_id, label: tab.label ?? "" }] : [],
    );
  }

  private async listPanes(): Promise<LivePane[]> {
    const output = await this.exec(["pane", "list", "--workspace", this.workspaceId as string]);
    const parsed = JSON.parse(output) as {
      result?: { panes?: Array<{ pane_id?: string; tab_id?: string }> };
    };
    return (parsed.result?.panes ?? []).flatMap((pane) =>
      pane.pane_id && pane.tab_id ? [{ paneId: pane.pane_id, tabId: pane.tab_id }] : [],
    );
  }

  private async createTab(): Promise<LiveTab> {
    const output = await this.exec([
      "tab",
      "create",
      "--workspace",
      this.workspaceId as string,
      "--cwd",
      this.repositoryRoot,
      "--label",
      this.label,
      "--no-focus",
    ]);
    const parsed = JSON.parse(output) as { result?: { tab?: { tab_id?: string; label?: string } } };
    const tabId = parsed.result?.tab?.tab_id;
    if (!tabId) throw new Error("Herdr tab create did not return a tab ID");
    return { tabId, label: parsed.result?.tab?.label ?? this.label };
  }

  private async splitPane(anchorPaneId: string): Promise<string> {
    const output = await this.exec([
      "pane",
      "split",
      anchorPaneId,
      "--direction",
      "right",
      "--cwd",
      this.repositoryRoot,
      "--no-focus",
    ]);
    const parsed = JSON.parse(output) as { result?: { pane?: { pane_id?: string } } };
    const paneId = parsed.result?.pane?.pane_id;
    if (!paneId) throw new Error("Herdr pane split did not return a pane ID");
    return paneId;
  }

  private async exec(arguments_: string[]): Promise<string> {
    const { stdout } = await execFileAsync("herdr", arguments_, {
      cwd: this.repositoryRoot,
      encoding: "utf8",
      timeout: this.timeoutMs,
      windowsHide: true,
      env: childEnvironment(),
    });
    return stdout;
  }

  private lock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.catch(() => undefined);
    return result;
  }
}
