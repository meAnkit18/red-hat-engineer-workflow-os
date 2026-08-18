import { relations } from "drizzle-orm";
import {
  activityEvents,
  approvals,
  artifacts,
  browserRuns,
  musicRights,
  projects,
  sceneAssets,
  scriptVersions,
  users,
  workflowStages,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({ projects: many(projects) }));
export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  stages: many(workflowStages),
  activities: many(activityEvents),
  artifacts: many(artifacts),
  scripts: many(scriptVersions),
  approvals: many(approvals),
  browserRuns: many(browserRuns),
  scenes: many(sceneAssets),
  musicRights: many(musicRights),
}));
export const stagesRelations = relations(workflowStages, ({ one, many }) => ({
  project: one(projects, { fields: [workflowStages.projectId], references: [projects.id] }),
  activities: many(activityEvents),
  artifacts: many(artifacts),
  approvals: many(approvals),
  browserRuns: many(browserRuns),
  scenes: many(sceneAssets),
  musicRights: many(musicRights),
}));

