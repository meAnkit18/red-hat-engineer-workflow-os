import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { PROJECT_STATUSES, STAGE_KEYS, STAGE_STATUSES } from "../shared/workflow";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const projects = mysqlTable(
  "projects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    topicBrief: text("topicBrief").notNull(),
    channelProfileId: varchar("channelProfileId", { length: 64 }).notNull().default("red-hat-engineer"),
    contentPillar: varchar("contentPillar", { length: 64 }).notNull(),
    audienceLevel: varchar("audienceLevel", { length: 32 }).notNull(),
    targetDurationSeconds: int("targetDurationSeconds").notNull().default(540),
    requiredPoints: json("requiredPoints").$type<string[]>().notNull(),
    prohibitedSources: json("prohibitedSources").$type<string[]>().notNull(),
    status: mysqlEnum("status", PROJECT_STATUSES).notNull().default("PENDING"),
    currentStageKey: varchar("currentStageKey", { length: 32 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("projects_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const workflowStages = mysqlTable(
  "workflowStages",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    stageKey: mysqlEnum("stageKey", STAGE_KEYS).notNull(),
    stageOrder: int("stageOrder").notNull(),
    status: mysqlEnum("status", STAGE_STATUSES).notNull().default("PENDING"),
    attemptCount: int("attemptCount").notNull().default(0),
    checkpointVersion: int("checkpointVersion").notNull().default(0),
    inputManifest: json("inputManifest").$type<Record<string, unknown> | null>(),
    outputManifest: json("outputManifest").$type<Record<string, unknown> | null>(),
    failureReason: text("failureReason"),
    pauseReason: text("pauseReason"),
    requiresApproval: int("requiresApproval").notNull().default(0),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("workflowStages_project_stage_unique").on(table.projectId, table.stageKey),
    index("workflowStages_project_order_idx").on(table.projectId, table.stageOrder),
  ],
);

export const activityEvents = mysqlTable(
  "activityEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    stageId: int("stageId"),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    severity: mysqlEnum("severity", ["INFO", "SUCCESS", "WARNING", "ERROR"]).notNull().default("INFO"),
    message: text("message").notNull(),
    payload: json("payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("activityEvents_project_created_idx").on(table.projectId, table.createdAt)],
);

export const artifacts = mysqlTable(
  "artifacts",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    stageId: int("stageId"),
    kind: varchar("kind", { length: 64 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    version: int("version").notNull().default(1),
    storageKey: varchar("storageKey", { length: 1024 }),
    url: varchar("url", { length: 2048 }),
    inlineContent: text("inlineContent"),
    checksum: varchar("checksum", { length: 128 }),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("artifacts_project_kind_idx").on(table.projectId, table.kind)],
);

export const scriptVersions = mysqlTable(
  "scriptVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    version: int("version").notNull(),
    status: mysqlEnum("status", ["DRAFT", "APPROVED", "REJECTED", "SUPERSEDED"]).notNull().default("DRAFT"),
    title: varchar("title", { length: 240 }).notNull(),
    markdown: text("markdown").notNull(),
    commandReferences: json("commandReferences").$type<Array<{ command: string; context: string }>>().notNull(),
    sourceReferences: json("sourceReferences").$type<Array<{ label: string; url: string }>>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    approvedAt: timestamp("approvedAt"),
  },
  table => [uniqueIndex("scriptVersions_project_version_unique").on(table.projectId, table.version)],
);

export const approvals = mysqlTable(
  "approvals",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    stageId: int("stageId").notNull(),
    approvalType: mysqlEnum("approvalType", ["SCRIPT", "REVIEW", "PUBLISHING"]).notNull(),
    decision: mysqlEnum("decision", ["PENDING", "APPROVED", "REJECTED"]).notNull().default("PENDING"),
    notes: text("notes"),
    reviewerUserId: int("reviewerUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    decidedAt: timestamp("decidedAt"),
  },
  table => [index("approvals_project_stage_idx").on(table.projectId, table.stageId)],
);

export const browserRuns = mysqlTable(
  "browserRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    stageId: int("stageId").notNull(),
    purpose: mysqlEnum("purpose", ["RESEARCH", "GOOGLE_FLOW", "YOUTUBE_UPLOAD"]).notNull(),
    state: mysqlEnum("state", ["NOT_REQUESTED", "READY", "RUNNING", "WAITING_FOR_USER", "IMPORTED", "FAILED"])
      .notNull()
      .default("NOT_REQUESTED"),
    instructions: text("instructions").notNull(),
    resultSummary: text("resultSummary"),
    handoffPayload: json("handoffPayload").$type<Record<string, unknown> | null>(),
    browserTaskId: varchar("browserTaskId", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("browserRuns_project_stage_idx").on(table.projectId, table.stageId)],
);

export const sceneAssets = mysqlTable(
  "sceneAssets",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    stageId: int("stageId").notNull(),
    sceneNumber: int("sceneNumber").notNull(),
    prompt: text("prompt").notNull(),
    status: mysqlEnum("status", ["PENDING", "GENERATING", "DOWNLOADED", "RETRYING", "FAILED", "APPROVED"])
      .notNull()
      .default("PENDING"),
    retryCount: int("retryCount").notNull().default(0),
    artifactId: int("artifactId"),
    provenance: json("provenance").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("sceneAssets_project_scene_unique").on(table.projectId, table.sceneNumber)],
);

export const musicRights = mysqlTable(
  "musicRights",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull(),
    stageId: int("stageId").notNull(),
    trackTitle: varchar("trackTitle", { length: 240 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 2048 }).notNull(),
    licenseType: varchar("licenseType", { length: 128 }).notNull(),
    attributionText: text("attributionText"),
    commercialUseAllowed: int("commercialUseAllowed").notNull().default(0),
    contentIdClear: int("contentIdClear").notNull().default(0),
    evidenceUrl: varchar("evidenceUrl", { length: 2048 }),
    resolutionStatus: mysqlEnum("resolutionStatus", ["PENDING", "VERIFIED", "REJECTED", "NEEDS_REVIEW"])
      .notNull()
      .default("PENDING"),
    artifactId: int("artifactId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("musicRights_project_resolution_idx").on(table.projectId, table.resolutionStatus)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type WorkflowStage = typeof workflowStages.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type ScriptVersion = typeof scriptVersions.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type BrowserRun = typeof browserRuns.$inferSelect;
export type SceneAsset = typeof sceneAssets.$inferSelect;
export type MusicRight = typeof musicRights.$inferSelect;
