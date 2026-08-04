import type { DispatchTarget, InboundRequest } from "./types.js";

export type WorkerRoute = Pick<
  DispatchTarget,
  "runtime" | "model" | "control" | "fallback"
> & { reason: string };

const googleTask = /\b(google|gemini|antigravity|agy)\b/i;
const boundedTask = /\b(extract|inventory|format|list|catalog|scan|summarize)\b/i;
const largeContextTask = /\b(large repo|large repository|whole repo|codebase|architecture|refactor|migration)\b/i;

export function selectDepartmentRoute(request: InboundRequest): WorkerRoute {
  if (
    googleTask.test(request.content) ||
    request.department === "product" ||
    request.department === "design"
  ) {
    return {
      runtime: "agy",
      model: "provider-selected",
      control: "raw",
      fallback: "codex:gpt-5.6-terra",
      reason: "Creative/product work benefits from the independent AGY provider",
    };
  }
  if (request.department === "engineering" && largeContextTask.test(request.content)) {
    return {
      runtime: "cmdc",
      model: "glm-5.2",
      control: "raw",
      fallback: "codex:gpt-5.6-terra",
      reason: "Large-context engineering work routed to a verified CMDC candidate",
    };
  }
  const fallbackModel = ["finance", "operations"].includes(request.department)
    ? "gpt-5.6-luna"
    : "gpt-5.6-terra";
  return {
    runtime: "cmdc",
    model: "gpt-5.6-luna",
    control: "raw",
    fallback: `codex:${fallbackModel}`,
    reason: "Cost-efficient verified CMDC Go route for bounded department work",
  };
}

export function selectWorkerRoute(request: InboundRequest): WorkerRoute {
  if (googleTask.test(request.content)) {
    return {
      runtime: "agy",
      model: "provider-selected",
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
  return selectDepartmentRoute(request);
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
