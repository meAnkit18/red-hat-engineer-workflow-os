export const PROJECT_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "PAUSED",
  "CANCELLED",
] as const;

export const STAGE_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "RETRYING",
  "PAUSED",
  "WAITING_APPROVAL",
  "CANCELLED",
] as const;

export const STAGE_KEYS = [
  "RESEARCH",
  "SCRIPT",
  "AUDIO",
  "SCENES",
  "IMAGES",
  "MUSIC",
  "RENDER",
  "REVIEW",
  "PUBLISHING",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type StageStatus = (typeof STAGE_STATUSES)[number];
export type StageKey = (typeof STAGE_KEYS)[number];

export type StageDefinition = {
  key: StageKey;
  label: string;
  description: string;
  requiresApproval: boolean;
  dependsOn: StageKey[];
};

export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    key: "RESEARCH",
    label: "Live research",
    description: "Connected-browser source collection and claim synthesis.",
    requiresApproval: false,
    dependsOn: [],
  },
  {
    key: "SCRIPT",
    label: "Script",
    description: "Versioned Red Hat Engineer narration and technical references.",
    requiresApproval: true,
    dependsOn: ["RESEARCH"],
  },
  {
    key: "AUDIO",
    label: "Gemini TTS",
    description: "Sentence-level narration chunks, timing, and rate-limit recovery.",
    requiresApproval: false,
    dependsOn: ["SCRIPT"],
  },
  {
    key: "SCENES",
    label: "Scene plan",
    description: "Timed image, overlay, and motion instructions derived from narration.",
    requiresApproval: false,
    dependsOn: ["AUDIO"],
  },
  {
    key: "IMAGES",
    label: "Google Flow images",
    description: "Browser-driven Google Flow prompts, downloads, and provenance.",
    requiresApproval: false,
    dependsOn: ["SCENES"],
  },
  {
    key: "MUSIC",
    label: "Music rights",
    description: "Allowlisted music intake with rights and attribution evidence.",
    requiresApproval: false,
    dependsOn: ["AUDIO"],
  },
  {
    key: "RENDER",
    label: "Render",
    description: "Reproducible FFmpeg timeline, subtitles, mix, and final MP4 manifest.",
    requiresApproval: false,
    dependsOn: ["IMAGES", "MUSIC"],
  },
  {
    key: "REVIEW",
    label: "Quality review",
    description: "Technical, media, rights, and metadata quality-control report.",
    requiresApproval: true,
    dependsOn: ["RENDER"],
  },
  {
    key: "PUBLISHING",
    label: "Publishing export",
    description: "Publish-ready metadata package and optional browser-upload handoff.",
    requiresApproval: true,
    dependsOn: ["REVIEW"],
  },
];

export const VALID_STAGE_TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  PENDING: ["RUNNING", "PAUSED", "CANCELLED"],
  RUNNING: ["COMPLETED", "FAILED", "RETRYING", "PAUSED", "WAITING_APPROVAL", "CANCELLED"],
  COMPLETED: ["RUNNING"],
  FAILED: ["RETRYING", "RUNNING", "CANCELLED"],
  RETRYING: ["RUNNING", "FAILED", "PAUSED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  WAITING_APPROVAL: ["RUNNING", "COMPLETED", "CANCELLED"],
  CANCELLED: [],
};

export const CHANNEL_PILLARS = [
  { value: "RHEL_LINUX", label: "RHEL & Linux" },
  { value: "ANSIBLE_AUTOMATION", label: "Ansible & automation" },
  { value: "CONTAINERS_OPENSHIFT", label: "Containers & OpenShift" },
  { value: "CERTIFICATION", label: "RHCSA / RHCE preparation" },
  { value: "TROUBLESHOOTING", label: "Troubleshooting & incident learning" },
  { value: "ENGINEERING_CAREER", label: "Engineering practice & career" },
] as const;

export const AUDIENCE_LEVELS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
] as const;

export type ChannelPillar = (typeof CHANNEL_PILLARS)[number]["value"];
export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number]["value"];

export const RED_HAT_ENGINEER_CHANNEL_PROFILE = {
  id: "red-hat-engineer",
  name: "Red Hat Engineer",
  format: "Narrated technical explainer",
  output: "YouTube 16:9 video",
  defaultDurationMinutes: 9,
  language: "en-US",
  editorialRules: [
    "Anchor important technical claims to a source or flag them for review.",
    "Call out version-specific differences and unsafe command assumptions.",
    "Use deterministic text overlays for commands and configuration rather than image-rendered text.",
    "Maintain a practical, precise, direct teaching voice.",
  ],
} as const;

export type ArtifactKind =
  | "RESEARCH_MARKDOWN"
  | "RESEARCH_JSON"
  | "SCRIPT_MARKDOWN"
  | "SCRIPT_JSON"
  | "AUDIO_CHUNK_MANIFEST"
  | "AUDIO_MASTER"
  | "SCENE_PLAN"
  | "IMAGE_MANIFEST"
  | "MUSIC_RIGHTS"
  | "RENDER_MANIFEST"
  | "SUBTITLES"
  | "REVIEW_REPORT"
  | "PUBLISH_PACKAGE";

export type BrowserRunState = "NOT_REQUESTED" | "READY" | "RUNNING" | "WAITING_FOR_USER" | "IMPORTED" | "FAILED";

export function stageDefinition(key: StageKey) {
  return STAGE_DEFINITIONS.find(stage => stage.key === key)!;
}

export function canTransitionStage(from: StageStatus, to: StageStatus) {
  return VALID_STAGE_TRANSITIONS[from].includes(to);
}
