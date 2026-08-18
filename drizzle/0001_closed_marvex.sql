CREATE TABLE `activityEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stageId` int,
	`eventType` varchar(64) NOT NULL,
	`severity` enum('INFO','SUCCESS','WARNING','ERROR') NOT NULL DEFAULT 'INFO',
	`message` text NOT NULL,
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stageId` int NOT NULL,
	`approvalType` enum('SCRIPT','REVIEW','PUBLISHING') NOT NULL,
	`decision` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`notes` text,
	`reviewerUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stageId` int,
	`kind` varchar(64) NOT NULL,
	`title` varchar(240) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`storageKey` varchar(1024),
	`url` varchar(2048),
	`inlineContent` text,
	`checksum` varchar(128),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `browserRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stageId` int NOT NULL,
	`purpose` enum('RESEARCH','GOOGLE_FLOW','YOUTUBE_UPLOAD') NOT NULL,
	`state` enum('NOT_REQUESTED','READY','RUNNING','WAITING_FOR_USER','IMPORTED','FAILED') NOT NULL DEFAULT 'NOT_REQUESTED',
	`instructions` text NOT NULL,
	`resultSummary` text,
	`handoffPayload` json,
	`browserTaskId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `browserRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `musicRights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stageId` int NOT NULL,
	`trackTitle` varchar(240) NOT NULL,
	`sourceUrl` varchar(2048) NOT NULL,
	`licenseType` varchar(128) NOT NULL,
	`attributionText` text,
	`commercialUseAllowed` int NOT NULL DEFAULT 0,
	`contentIdClear` int NOT NULL DEFAULT 0,
	`evidenceUrl` varchar(2048),
	`resolutionStatus` enum('PENDING','VERIFIED','REJECTED','NEEDS_REVIEW') NOT NULL DEFAULT 'PENDING',
	`artifactId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `musicRights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`topicBrief` text NOT NULL,
	`channelProfileId` varchar(64) NOT NULL DEFAULT 'red-hat-engineer',
	`contentPillar` varchar(64) NOT NULL,
	`audienceLevel` varchar(32) NOT NULL,
	`targetDurationSeconds` int NOT NULL DEFAULT 540,
	`requiredPoints` json NOT NULL,
	`prohibitedSources` json NOT NULL,
	`status` enum('PENDING','RUNNING','COMPLETED','FAILED','PAUSED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`currentStageKey` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sceneAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stageId` int NOT NULL,
	`sceneNumber` int NOT NULL,
	`prompt` text NOT NULL,
	`status` enum('PENDING','GENERATING','DOWNLOADED','RETRYING','FAILED','APPROVED') NOT NULL DEFAULT 'PENDING',
	`retryCount` int NOT NULL DEFAULT 0,
	`artifactId` int,
	`provenance` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sceneAssets_id` PRIMARY KEY(`id`),
	CONSTRAINT `sceneAssets_project_scene_unique` UNIQUE(`projectId`,`sceneNumber`)
);
--> statement-breakpoint
CREATE TABLE `scriptVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`version` int NOT NULL,
	`status` enum('DRAFT','APPROVED','REJECTED','SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
	`title` varchar(240) NOT NULL,
	`markdown` text NOT NULL,
	`commandReferences` json NOT NULL,
	`sourceReferences` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	CONSTRAINT `scriptVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `scriptVersions_project_version_unique` UNIQUE(`projectId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `workflowStages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stageKey` enum('RESEARCH','SCRIPT','AUDIO','SCENES','IMAGES','MUSIC','RENDER','REVIEW','PUBLISHING') NOT NULL,
	`stageOrder` int NOT NULL,
	`status` enum('PENDING','RUNNING','COMPLETED','FAILED','RETRYING','PAUSED','WAITING_APPROVAL','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`attemptCount` int NOT NULL DEFAULT 0,
	`checkpointVersion` int NOT NULL DEFAULT 0,
	`inputManifest` json,
	`outputManifest` json,
	`failureReason` text,
	`pauseReason` text,
	`requiresApproval` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflowStages_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflowStages_project_stage_unique` UNIQUE(`projectId`,`stageKey`)
);
--> statement-breakpoint
CREATE INDEX `activityEvents_project_created_idx` ON `activityEvents` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `approvals_project_stage_idx` ON `approvals` (`projectId`,`stageId`);--> statement-breakpoint
CREATE INDEX `artifacts_project_kind_idx` ON `artifacts` (`projectId`,`kind`);--> statement-breakpoint
CREATE INDEX `browserRuns_project_stage_idx` ON `browserRuns` (`projectId`,`stageId`);--> statement-breakpoint
CREATE INDEX `musicRights_project_resolution_idx` ON `musicRights` (`projectId`,`resolutionStatus`);--> statement-breakpoint
CREATE INDEX `projects_user_updated_idx` ON `projects` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `workflowStages_project_order_idx` ON `workflowStages` (`projectId`,`stageOrder`);