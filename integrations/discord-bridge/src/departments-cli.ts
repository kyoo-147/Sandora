import { loadBridgeConfig } from "./config.js";
import { EventPublisher } from "./events.js";
import { assertHerdrEnvironment } from "./herdr.js";
import { repositoryRoot, workspaceRoot } from "./paths.js";
import { WorkspaceStore } from "./store.js";
import { CliSupervisorControl, DepartmentSupervisor } from "./supervisor.js";

async function main(): Promise<void> {
  assertHerdrEnvironment();
  const config = loadBridgeConfig();
  const store = new WorkspaceStore(workspaceRoot);
  const supervisor = new DepartmentSupervisor(
    config,
    store,
    new EventPublisher(store),
    new CliSupervisorControl(repositoryRoot),
  );
  const leads = await supervisor.reconcileLeads();
  process.stdout.write(
    `${JSON.stringify(
      leads.map((lead) => ({
        name: lead.name,
        department: lead.department,
        lifecycle: lead.lifecycle,
        paneId: lead.paneId,
        runtime: lead.runtime,
        model: lead.model,
      })),
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
