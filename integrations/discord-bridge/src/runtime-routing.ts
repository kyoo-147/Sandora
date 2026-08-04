import type { DispatchTarget, InboundRequest } from "./types.js";

export type WorkerRoute = Pick<
  DispatchTarget,
  "runtime" | "model" | "control" | "fallback"
> & { reason: string };

const googleTask = /\b(google|gemini|antigravity|agy)\b/i;
const boundedTask = /\b(extract|inventory|format|list|catalog|scan|summarize)\b/i;

export function selectWorkerRoute(request: InboundRequest): WorkerRoute {
  if (googleTask.test(request.content)) {
    return {
      runtime: "agy",
      model: "gemini-3.1-pro",
      control: "raw",
      fallback: "codex:gpt-5.6-terra",
      reason: "Google-oriented or independent-provider task",
    };
  }
  if (boundedTask.test(request.content)) {
    return {
      runtime: "cmdc",
      model: "gpt-5.6-luna",
      control: "raw",
      fallback: "codex:gpt-5.6-terra",
      reason: "Bounded low-risk extraction or formatting task",
    };
  }
  return {
    runtime: "codex",
    model: "gpt-5.6-terra",
    control: "canonical",
    reason: "Standard department work needs lifecycle-aware control",
  };
}

const coupledOrConsequential = new RegExp(
  [
    "approval",
    "approve",
    "production",
    "deploy",
    "credential",
    "token",
    "purchase",
    "payment",
    "budget",
    "strategy",
    "cross-functional",
    "handoff",
    "continue",
    "previous",
    "same task",
    "phê duyệt",
    "triển khai",
    "ngân sách",
    "tiếp tục",
  ].join("|"),
  "i",
);

export function decideParallelSafety(request: InboundRequest): {
  eligible: boolean;
  reason: string;
} {
  if (request.department === "ceo") {
    return { eligible: false, reason: "CEO work remains serialized for executive ownership" };
  }
  if (request.source !== "discord" || request.parentRequestId) {
    return { eligible: false, reason: "Handoffs and derived work queue to the stable lead" };
  }
  if (coupledOrConsequential.test(request.content)) {
    return {
      eligible: false,
      reason: "Request may be coupled, approval-sensitive, or consequential",
    };
  }
  return {
    eligible: true,
    reason: "Distinct Owner request with no coupling or approval signal",
  };
}
