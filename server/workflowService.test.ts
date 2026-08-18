import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getWorkflowProject: vi.fn(),
  getProjectStage: vi.fn(),
  resolveApproval: vi.fn(),
  updateStageState: vi.fn(),
  updateProjectWorkflowStatus: vi.fn(),
  addActivity: vi.fn(),
  approveScriptVersion: vi.fn(),
  hasVerifiedMusicRights: vi.fn(),
}));

vi.mock("./db", () => ({
  ...dbMocks,
  createApproval: vi.fn(), createArtifact: vi.fn(), createBrowserRun: vi.fn(), createMusicRight: vi.fn(), createSceneAsset: vi.fn(), createScriptVersion: vi.fn(), updateBrowserRun: vi.fn(), updateSceneAsset: vi.fn(),
}));

import { createPublishingExport, createRenderManifest, decideApproval, retryStage } from "./workflowService";

const baseWorkspace = (stageStatus: string) => ({
  project: { id: 7, workflowStatus: "PAUSED", currentStageKey: "SCRIPT" },
  stages: [{ id: 19, projectId: 7, stageKey: "SCRIPT", status: stageStatus, checkpointVersion: 1 }],
  artifacts: [], scripts: [], browserRuns: [], scenes: [], rights: [], events: [], approvals: [],
});

describe("workflow service gates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a rejected approval and keeps the owning stage paused", async () => {
    const workspace = baseWorkspace("WAITING_APPROVAL");
    workspace.approvals = [{ id: 31, stageId: 19, approvalType: "SCRIPT", decision: "PENDING" }];
    dbMocks.getWorkflowProject.mockResolvedValue(workspace);

    await expect(decideApproval(2, 7, 31, "REJECTED", "Clarify the version scope.")).resolves.toEqual({ nextStageKey: "SCRIPT", status: "PAUSED" });
    expect(dbMocks.resolveApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 31, decision: "REJECTED" }));
    expect(dbMocks.updateStageState).toHaveBeenCalledWith(expect.objectContaining({ status: "PAUSED", pauseReason: "Clarify the version scope." }));
  });

  it("resumes only a paused, completed, failed, or approval-waiting stage", async () => {
    const paused = baseWorkspace("PAUSED");
    dbMocks.getProjectStage.mockResolvedValue({ workspace: paused, stage: { ...paused.stages[0], attemptCount: 0 } });
    await expect(retryStage(2, 7, "SCRIPT")).resolves.toEqual({ checkpointVersion: 1 });
    expect(dbMocks.updateStageState).toHaveBeenCalledWith(expect.objectContaining({ status: "RUNNING" }));

    const pending = baseWorkspace("PENDING");
    dbMocks.getProjectStage.mockResolvedValue({ workspace: pending, stage: { ...pending.stages[0], attemptCount: 0 } });
    await expect(retryStage(2, 7, "SCRIPT")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("blocks render and publishing before rights and final-video prerequisites are satisfied", async () => {
    const render = baseWorkspace("PENDING");
    const renderStage = { id: 27, projectId: 7, stageKey: "RENDER", status: "PENDING", checkpointVersion: 1, attemptCount: 0 };
    dbMocks.getProjectStage.mockResolvedValue({ workspace: render, stage: renderStage });
    dbMocks.hasVerifiedMusicRights.mockResolvedValue(false);
    await expect(createRenderManifest(2, 7)).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("music") });

    const publishing = baseWorkspace("PENDING");
    const publishingStage = { id: 31, projectId: 7, stageKey: "PUBLISHING", status: "PENDING", checkpointVersion: 1, attemptCount: 0 };
    dbMocks.getProjectStage.mockResolvedValue({ workspace: publishing, stage: publishingStage });
    dbMocks.hasVerifiedMusicRights.mockResolvedValue(false);
    await expect(createPublishingExport(2, 7)).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("music rights") });
  });

  it("blocks publishing when rights pass but final video and QC artifacts are absent", async () => {
    const publishing = baseWorkspace("PENDING");
    const publishingStage = { id: 31, projectId: 7, stageKey: "PUBLISHING", status: "PENDING", checkpointVersion: 1, attemptCount: 0 };
    publishing.stages = [
      { id: 30, projectId: 7, stageKey: "REVIEW", status: "COMPLETED", checkpointVersion: 1 },
      publishingStage,
    ];
    dbMocks.getProjectStage.mockResolvedValue({ workspace: publishing, stage: publishingStage });
    dbMocks.hasVerifiedMusicRights.mockResolvedValue(true);

    await expect(createPublishingExport(2, 7)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("final video"),
    });
  });
});
