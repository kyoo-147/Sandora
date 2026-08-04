import { randomUUID } from "node:crypto";
import cron, { type ScheduledTask } from "node-cron";
import type {
  DiscordBridgeConfig,
  InboundRequest,
  ScheduleConfig,
} from "./types.js";

export type ScheduledAdmission = (request: InboundRequest) => Promise<void>;

export function startSchedules(
  schedules: ScheduleConfig,
  bridge: DiscordBridgeConfig,
  admit: ScheduledAdmission,
): ScheduledTask[] {
  return schedules.jobs
    .filter((job) => job.enabled)
    .map((job) =>
      cron.schedule(
        job.cron,
        () => {
          const now = new Date().toISOString();
          const request: InboundRequest = {
            id: `schedule-${job.name}-${randomUUID()}`,
            source: "schedule",
            receivedAt: now,
            guildId: bridge.guildId,
            channel: job.channel,
            channelId: bridge.channels[job.channel],
            authorId: "sandora-scheduler",
            authorName: "Sandora Scheduler",
            content: job.task,
            attachments: [],
            department: "ceo",
            targetAgent: bridge.departments.ceo.leadAgent,
            scheduleName: job.name,
            replyChannel: job.channel,
          };
          void admit(request);
        },
        { timezone: schedules.timezone },
      ),
    );
}
