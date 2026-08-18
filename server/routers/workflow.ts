import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  createWorkflowProject,
  getWorkflowProject,
  listWorkflowProjects,
} from "../db";
import {
  createPublishingExport,
  createRenderManifest,
  decideApproval,
  generateScenePlan,
  generateScriptDraft,
  importRenderResult,
  importResearchPackage,
  importSceneImage,
  prepareAudioManifest,
  recordMusicRights,
  requestBrowserResearch,
  requestGoogleFlowImages,
  requestReview,
  retryStage,
  runGeminiAudio,
} from "../workflowService";
import { STAGE_KEYS } from "../../shared/workflow";

const contentPillarSchema = z.enum([
  "RHEL_LINUX",
  "ANSIBLE_AUTOMATION",
  "CONTAINERS_OPENSHIFT",
  "CERTIFICATION",
  "TROUBLESHOOTING",
  "ENGINEERING_CAREER",
]);

const audienceLevelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);

const projectInput = z.object({
  title: z.string().trim().min(4).max(240),
  topicBrief: z.string().trim().min(30).max(10_000),
  contentPillar: contentPillarSchema,
  audienceLevel: audienceLevelSchema,
  targetDurationSeconds: z.number().int().min(60).max(7200),
  requiredPoints: z.array(z.string().trim().min(2).max(500)).max(20),
  prohibitedSources: z.array(z.string().trim().min(2).max(255)).max(30),
});

const researchInput = z.object({
  summary: z.string().trim().min(20).max(20_000),
  sources: z.array(z.object({ title: z.string().min(1), url: z.string().url(), publisher: z.string().min(1), accessedAt: z.string().min(5), notes: z.string().optional() })).min(1).max(100),
  claims: z.array(z.object({ claim: z.string().min(1), sourceUrls: z.array(z.string().url()).min(1), confidence: z.enum(["HIGH", "MEDIUM", "LOW"]), versionNotes: z.string().optional(), contradiction: z.string().optional() })).min(1).max(200),
  contradictions: z.array(z.string()).max(100),
  unknowns: z.array(z.string()).max(100),
  versionSensitiveNotes: z.array(z.string()).max(100),
});

export const workflowRouter = router({
  list: protectedProcedure.query(({ ctx }) => listWorkflowProjects(ctx.user.id)),
  get: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(({ ctx, input }) => getWorkflowProject(ctx.user.id, input.projectId)),
  create: protectedProcedure.input(projectInput).mutation(async ({ ctx, input }) => ({ projectId: await createWorkflowProject(ctx.user.id, input) })),
  requestBrowserResearch: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => requestBrowserResearch(ctx.user.id, input.projectId)),
  importResearch: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), research: researchInput })).mutation(({ ctx, input }) => importResearchPackage(ctx.user.id, input.projectId, input.research)),
  generateScript: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => generateScriptDraft(ctx.user.id, input.projectId)),
  decideApproval: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), approvalId: z.number().int().positive(), decision: z.enum(["APPROVED", "REJECTED"]), notes: z.string().max(5000).optional() })).mutation(({ ctx, input }) => decideApproval(ctx.user.id, input.projectId, input.approvalId, input.decision, input.notes)),
  prepareAudio: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => prepareAudioManifest(ctx.user.id, input.projectId)),
  generateGeminiAudio: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => runGeminiAudio(ctx.user.id, input.projectId)),
  generateScenePlan: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => generateScenePlan(ctx.user.id, input.projectId)),
  requestGoogleFlow: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => requestGoogleFlowImages(ctx.user.id, input.projectId)),
  importSceneImage: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), sceneId: z.number().int().positive(), url: z.string().url(), sourceUrl: z.string().url(), promptUsed: z.string().min(1), downloadedAt: z.string().min(5) })).mutation(({ ctx, input }) => importSceneImage(ctx.user.id, input)),
  recordMusicRights: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), trackTitle: z.string().min(2).max(240), sourceUrl: z.string().url(), licenseType: z.string().min(2).max(128), attributionText: z.string().max(5000).optional(), commercialUseAllowed: z.boolean(), contentIdClear: z.boolean(), evidenceUrl: z.string().url().optional() })).mutation(({ ctx, input }) => recordMusicRights(ctx.user.id, input)),
  createRenderManifest: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => createRenderManifest(ctx.user.id, input.projectId)),
  importRenderResult: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), finalVideoUrl: z.string().url(), durationSeconds: z.number().positive(), audioSyncPassed: z.boolean(), blackFramesPassed: z.boolean(), loudnessPassed: z.boolean(), subtitlesPassed: z.boolean() })).mutation(({ ctx, input }) => importRenderResult(ctx.user.id, input)),
  requestReview: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => requestReview(ctx.user.id, input.projectId)),
  createPublishingExport: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => createPublishingExport(ctx.user.id, input.projectId)),
  retryStage: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), stageKey: z.enum(STAGE_KEYS) })).mutation(({ ctx, input }) => retryStage(ctx.user.id, input.projectId, input.stageKey)),
});
