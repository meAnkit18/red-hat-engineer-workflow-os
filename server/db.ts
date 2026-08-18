import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activityEvents,
  approvals,
  artifacts,
  browserRuns,
  type InsertUser,
  musicRights,
  projects,
  sceneAssets,
  scriptVersions,
  users,
  workflowStages,
} from "../drizzle/schema";
import {
  STAGE_DEFINITIONS,
  type ArtifactKind,
  type AudienceLevel,
  type BrowserRunState,
  type ChannelPillar,
  type ProjectStatus,
  type StageKey,
  type StageStatus,
} from "../shared/workflow";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export type CreateProjectInput = {
  title: string;
  topicBrief: string;
  contentPillar: ChannelPillar;
  audienceLevel: AudienceLevel;
  targetDurationSeconds: number;
  requiredPoints: string[];
  prohibitedSources: string[];
};

export async function createWorkflowProject(userId: number, input: CreateProjectInput) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [insertedProject] = await tx.insert(projects).values({
      userId,
      title: input.title,
      topicBrief: input.topicBrief,
      contentPillar: input.contentPillar,
      audienceLevel: input.audienceLevel,
      targetDurationSeconds: input.targetDurationSeconds,
      requiredPoints: input.requiredPoints,
      prohibitedSources: input.prohibitedSources,
      status: "PENDING",
      currentStageKey: "RESEARCH",
    });
    const projectId = Number(insertedProject.insertId);
    await tx.insert(workflowStages).values(
      STAGE_DEFINITIONS.map((stage, index) => ({
        projectId,
        stageKey: stage.key,
        stageOrder: index + 1,
        requiresApproval: stage.requiresApproval ? 1 : 0,
        status: "PENDING" as const,
      })),
    );
    await tx.insert(activityEvents).values({
      projectId,
      eventType: "PROJECT_CREATED",
      severity: "SUCCESS",
      message: `Project created with ${STAGE_DEFINITIONS.length} resumable workflow stages.`,
      payload: { channelProfileId: "red-hat-engineer", contentPillar: input.contentPillar },
    });
    return projectId;
  });
}

export async function listWorkflowProjects(userId: number) {
  const db = await requireDb();
  const projectRows = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
  if (!projectRows.length) return [];
  const projectIds = projectRows.map(project => project.id);
  const stageRows = await db
    .select()
    .from(workflowStages)
    .where(inArray(workflowStages.projectId, projectIds))
    .orderBy(workflowStages.stageOrder);

  return projectRows.map(project => {
    const stages = stageRows.filter(stage => stage.projectId === project.id);
    return {
      ...project,
      stages,
      completedStages: stages.filter(stage => stage.status === "COMPLETED").length,
      totalStages: STAGE_DEFINITIONS.length,
      blockedStages: stages.filter(stage => stage.status === "WAITING_APPROVAL" || stage.status === "FAILED").length,
    };
  });
}

export async function getWorkflowProject(userId: number, projectId: number) {
  const db = await requireDb();
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  const project = projectRows[0];
  if (!project) return null;

  const [stages, events, artifactRows, scripts, approvalRows, browserRunRows, scenes, rights] = await Promise.all([
    db.select().from(workflowStages).where(eq(workflowStages.projectId, projectId)).orderBy(workflowStages.stageOrder),
    db.select().from(activityEvents).where(eq(activityEvents.projectId, projectId)).orderBy(desc(activityEvents.createdAt)).limit(100),
    db.select().from(artifacts).where(eq(artifacts.projectId, projectId)).orderBy(desc(artifacts.createdAt)),
    db.select().from(scriptVersions).where(eq(scriptVersions.projectId, projectId)).orderBy(desc(scriptVersions.version)),
    db.select().from(approvals).where(eq(approvals.projectId, projectId)).orderBy(desc(approvals.createdAt)),
    db.select().from(browserRuns).where(eq(browserRuns.projectId, projectId)).orderBy(desc(browserRuns.createdAt)),
    db.select().from(sceneAssets).where(eq(sceneAssets.projectId, projectId)).orderBy(sceneAssets.sceneNumber),
    db.select().from(musicRights).where(eq(musicRights.projectId, projectId)).orderBy(desc(musicRights.createdAt)),
  ]);

  return { project, stages, events, artifacts: artifactRows, scripts, approvals: approvalRows, browserRuns: browserRunRows, scenes, rights };
}

export async function getProjectStage(userId: number, projectId: number, stageKey: StageKey) {
  const workspace = await getWorkflowProject(userId, projectId);
  if (!workspace) return null;
  const stage = workspace.stages.find(current => current.stageKey === stageKey);
  return stage ? { workspace, stage } : null;
}

export async function updateStageState(input: {
  projectId: number;
  stageId: number;
  status: StageStatus;
  attemptCount?: number;
  checkpointVersion?: number;
  inputManifest?: Record<string, unknown> | null;
  outputManifest?: Record<string, unknown> | null;
  failureReason?: string | null;
  pauseReason?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  const db = await requireDb();
  const { projectId, stageId, ...values } = input;
  await db.update(workflowStages).set(values).where(and(eq(workflowStages.id, stageId), eq(workflowStages.projectId, projectId)));
}

export async function updateProjectWorkflowStatus(projectId: number, status: ProjectStatus, currentStageKey: StageKey | null) {
  const db = await requireDb();
  await db.update(projects).set({ status, currentStageKey }).where(eq(projects.id, projectId));
}

export async function addActivity(input: {
  projectId: number;
  stageId?: number | null;
  eventType: string;
  severity?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  message: string;
  payload?: Record<string, unknown> | null;
}) {
  const db = await requireDb();
  const [inserted] = await db.insert(activityEvents).values({
    ...input,
    stageId: input.stageId ?? null,
    severity: input.severity ?? "INFO",
    payload: input.payload ?? null,
  });
  return Number(inserted.insertId);
}

export async function createArtifact(input: {
  projectId: number;
  stageId?: number | null;
  kind: ArtifactKind;
  title: string;
  version?: number;
  url?: string | null;
  storageKey?: string | null;
  inlineContent?: string | null;
  checksum?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const db = await requireDb();
  const [inserted] = await db.insert(artifacts).values({
    ...input,
    stageId: input.stageId ?? null,
    version: input.version ?? 1,
    url: input.url ?? null,
    storageKey: input.storageKey ?? null,
    inlineContent: input.inlineContent ?? null,
    checksum: input.checksum ?? null,
    metadata: input.metadata ?? null,
  });
  return Number(inserted.insertId);
}

export async function listScriptVersions(projectId: number) {
  const db = await requireDb();
  return db.select().from(scriptVersions).where(eq(scriptVersions.projectId, projectId)).orderBy(desc(scriptVersions.version));
}

export async function createScriptVersion(input: {
  projectId: number;
  title: string;
  markdown: string;
  commandReferences: Array<{ command: string; context: string }>;
  sourceReferences: Array<{ label: string; url: string }>;
}) {
  const db = await requireDb();
  const existing = await listScriptVersions(input.projectId);
  const nextVersion = (existing[0]?.version ?? 0) + 1;
  await db
    .update(scriptVersions)
    .set({ status: "SUPERSEDED" })
    .where(and(eq(scriptVersions.projectId, input.projectId), eq(scriptVersions.status, "DRAFT")));
  const [inserted] = await db.insert(scriptVersions).values({ ...input, version: nextVersion });
  return Number(inserted.insertId);
}

export async function approveScriptVersion(projectId: number, scriptVersionId: number) {
  const db = await requireDb();
  await db
    .update(scriptVersions)
    .set({ status: "SUPERSEDED" })
    .where(and(eq(scriptVersions.projectId, projectId), eq(scriptVersions.status, "APPROVED")));
  await db
    .update(scriptVersions)
    .set({ status: "APPROVED", approvedAt: new Date() })
    .where(and(eq(scriptVersions.id, scriptVersionId), eq(scriptVersions.projectId, projectId)));
}

export async function createApproval(projectId: number, stageId: number, approvalType: "SCRIPT" | "REVIEW" | "PUBLISHING") {
  const db = await requireDb();
  const [inserted] = await db.insert(approvals).values({ projectId, stageId, approvalType });
  return Number(inserted.insertId);
}

export async function resolveApproval(input: {
  approvalId: number;
  projectId: number;
  reviewerUserId: number;
  decision: "APPROVED" | "REJECTED";
  notes?: string;
}) {
  const db = await requireDb();
  await db
    .update(approvals)
    .set({ decision: input.decision, notes: input.notes ?? null, reviewerUserId: input.reviewerUserId, decidedAt: new Date() })
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.projectId, input.projectId)));
}

export async function createBrowserRun(input: {
  projectId: number;
  stageId: number;
  purpose: "RESEARCH" | "GOOGLE_FLOW" | "YOUTUBE_UPLOAD";
  state: BrowserRunState;
  instructions: string;
  handoffPayload?: Record<string, unknown> | null;
}) {
  const db = await requireDb();
  const [inserted] = await db.insert(browserRuns).values({
    ...input,
    handoffPayload: input.handoffPayload ?? null,
  });
  return Number(inserted.insertId);
}

export async function updateBrowserRun(input: {
  id: number;
  projectId: number;
  state: BrowserRunState;
  resultSummary?: string | null;
  handoffPayload?: Record<string, unknown> | null;
  browserTaskId?: string | null;
}) {
  const db = await requireDb();
  const { id, projectId, ...values } = input;
  await db.update(browserRuns).set(values).where(and(eq(browserRuns.id, id), eq(browserRuns.projectId, projectId)));
}

export async function createSceneAsset(input: { projectId: number; stageId: number; sceneNumber: number; prompt: string }) {
  const db = await requireDb();
  const [inserted] = await db.insert(sceneAssets).values(input);
  return Number(inserted.insertId);
}

export async function updateSceneAsset(input: {
  id: number;
  projectId: number;
  status: "PENDING" | "GENERATING" | "DOWNLOADED" | "RETRYING" | "FAILED" | "APPROVED";
  retryCount?: number;
  artifactId?: number | null;
  provenance?: Record<string, unknown> | null;
}) {
  const db = await requireDb();
  const { id, projectId, ...values } = input;
  await db.update(sceneAssets).set(values).where(and(eq(sceneAssets.id, id), eq(sceneAssets.projectId, projectId)));
}

export async function createMusicRight(input: {
  projectId: number;
  stageId: number;
  trackTitle: string;
  sourceUrl: string;
  licenseType: string;
  attributionText?: string | null;
  commercialUseAllowed: boolean;
  contentIdClear: boolean;
  evidenceUrl?: string | null;
  resolutionStatus: "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_REVIEW";
}) {
  const db = await requireDb();
  const [inserted] = await db.insert(musicRights).values({
    ...input,
    attributionText: input.attributionText ?? null,
    evidenceUrl: input.evidenceUrl ?? null,
    commercialUseAllowed: input.commercialUseAllowed ? 1 : 0,
    contentIdClear: input.contentIdClear ? 1 : 0,
  });
  return Number(inserted.insertId);
}

export async function hasVerifiedMusicRights(projectId: number) {
  const db = await requireDb();
  const rights = await db.select().from(musicRights).where(eq(musicRights.projectId, projectId));
  return rights.some(right => right.resolutionStatus === "VERIFIED" && right.commercialUseAllowed === 1 && right.contentIdClear === 1);
}
