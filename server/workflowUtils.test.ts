import { describe, expect, it } from "vitest";
import { canTransitionStage, STAGE_KEYS } from "../shared/workflow";
import { canPublishWorkflow, geminiBackoffMs, hasCompleteResearchEvidence, hasPassingRenderQc, isAllowlistedMusicSource, isRetryableGeminiStatus, resolveMusicRights } from "./workflowPolicy";
import { assertValidStageTransition, deriveProjectStatus, nextEligibleStage } from "./workflowUtils";

describe("workflow state machine", () => {
  it("only exposes a dependency-ready next stage", () => {
    const stages = STAGE_KEYS.map(stageKey => ({ stageKey, status: "PENDING" as const }));
    expect(nextEligibleStage(stages)).toBe("RESEARCH");
    stages[0].status = "COMPLETED";
    expect(nextEligibleStage(stages)).toBe("SCRIPT");
    stages[1].status = "COMPLETED";
    expect(nextEligibleStage(stages)).toBe("AUDIO");
  });

  it("derives paused projects when an approval decision is required", () => {
    expect(deriveProjectStatus(["COMPLETED", "WAITING_APPROVAL", "PENDING"])).toBe("PAUSED");
    expect(deriveProjectStatus(["COMPLETED", "RUNNING", "PENDING"])).toBe("RUNNING");
    expect(deriveProjectStatus(["COMPLETED", "FAILED", "PENDING"])).toBe("FAILED");
  });

  it("rejects illegal transition bypasses", () => {
    expect(canTransitionStage("PENDING", "COMPLETED")).toBe(false);
    expect(() => assertValidStageTransition("PENDING", "COMPLETED")).toThrow("Invalid stage transition");
    expect(() => assertValidStageTransition("WAITING_APPROVAL", "COMPLETED")).not.toThrow();
  });
});

describe("workflow quality gates", () => {
  const baseResearch = {
    sources: [{ title: "RHEL documentation", url: "https://docs.redhat.com/example", publisher: "Red Hat", accessedAt: "2026-08-18T10:00:00Z" }],
    claims: [{ claim: "A versioned claim", sourceUrls: ["https://docs.redhat.com/example"], confidence: "HIGH" }],
    contradictions: [],
    unknowns: [],
    versionSensitiveNotes: [],
  };

  it("requires complete live research evidence before a package can pass", () => {
    expect(hasCompleteResearchEvidence(baseResearch)).toBe(true);
    expect(hasCompleteResearchEvidence({ ...baseResearch, claims: [] })).toBe(false);
    expect(hasCompleteResearchEvidence({ ...baseResearch, sources: [{ ...baseResearch.sources[0], accessedAt: "" }] })).toBe(false);
  });

  it("blocks music rights without commercial, Content ID, and license evidence", () => {
    const candidate = { trackTitle: "Verified track", sourceUrl: "https://music.example/track", licenseType: "CC BY 4.0", commercialUseAllowed: true, contentIdClear: true, evidenceUrl: "https://music.example/license" };
    expect(resolveMusicRights(candidate)).toBe("VERIFIED");
    expect(resolveMusicRights({ ...candidate, contentIdClear: false })).toBe("NEEDS_REVIEW");
    expect(resolveMusicRights({ ...candidate, evidenceUrl: "" })).toBe("NEEDS_REVIEW");
    expect(isAllowlistedMusicSource("https://pixabay.com/music/example")).toBe(true);
    expect(isAllowlistedMusicSource("https://unverified.example/music")).toBe(false);
  });

  it("uses bounded exponential recovery only for retriable Gemini provider statuses", () => {
    expect(isRetryableGeminiStatus(429)).toBe(true);
    expect(isRetryableGeminiStatus(503)).toBe(true);
    expect(isRetryableGeminiStatus(400)).toBe(false);
    expect(geminiBackoffMs(0)).toBe(1000);
    expect(geminiBackoffMs(3)).toBe(8000);
    expect(geminiBackoffMs(0, 60)).toBe(30000);
  });

  it("blocks review and publishing until all local QC gates pass", () => {
    const qc = { durationSeconds: 620, audioSyncPassed: true, blackFramesPassed: true, loudnessPassed: true, subtitlesPassed: true };
    expect(hasPassingRenderQc(qc)).toBe(true);
    expect(hasPassingRenderQc({ ...qc, subtitlesPassed: false })).toBe(false);
    expect(canPublishWorkflow({ verifiedMusicRights: true, finalVideoUrl: "https://storage.example/final.mp4", scriptApproved: true })).toBe(true);
    expect(canPublishWorkflow({ verifiedMusicRights: true, finalVideoUrl: "", scriptApproved: true })).toBe(false);
  });
});
