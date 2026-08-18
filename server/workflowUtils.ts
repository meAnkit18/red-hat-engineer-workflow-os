import {
  STAGE_DEFINITIONS,
  type StageKey,
  type StageStatus,
  canTransitionStage,
} from "../shared/workflow";

export function assertValidStageTransition(from: StageStatus, to: StageStatus) {
  if (!canTransitionStage(from, to)) {
    throw new Error(`Invalid stage transition: ${from} → ${to}`);
  }
}

export function dependenciesFor(stageKey: StageKey) {
  return STAGE_DEFINITIONS.find(stage => stage.key === stageKey)?.dependsOn ?? [];
}

export function deriveProjectStatus(stageStatuses: StageStatus[]): "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELLED" {
  if (stageStatuses.some(status => status === "RUNNING" || status === "RETRYING")) return "RUNNING";
  if (stageStatuses.some(status => status === "FAILED")) return "FAILED";
  if (stageStatuses.some(status => status === "PAUSED" || status === "WAITING_APPROVAL")) return "PAUSED";
  if (stageStatuses.length > 0 && stageStatuses.every(status => status === "COMPLETED")) return "COMPLETED";
  if (stageStatuses.length > 0 && stageStatuses.every(status => status === "CANCELLED")) return "CANCELLED";
  return "PENDING";
}

export function nextEligibleStage(
  stages: Array<{ stageKey: StageKey; status: StageStatus }>,
): StageKey | null {
  const completed = new Set(stages.filter(stage => stage.status === "COMPLETED").map(stage => stage.stageKey));
  return (
    STAGE_DEFINITIONS.find(stage => {
      const stageState = stages.find(current => current.stageKey === stage.key);
      return stageState?.status === "PENDING" && stage.dependsOn.every(dependency => completed.has(dependency));
    })?.key ?? null
  );
}

