export type ResearchEvidence = {
  sources: Array<{ title?: string; url?: string; publisher?: string; accessedAt?: string }>;
  claims: Array<{ claim?: string; sourceUrls?: string[]; confidence?: string }>;
  contradictions: string[];
  unknowns: string[];
  versionSensitiveNotes: string[];
};

export function hasCompleteResearchEvidence(research: ResearchEvidence) {
  return research.sources.length > 0
    && research.claims.length > 0
    && research.sources.every(source => Boolean(source.title?.trim() && source.url?.trim() && source.publisher?.trim() && source.accessedAt?.trim()))
    && research.claims.every(claim => Boolean(claim.claim?.trim() && claim.sourceUrls?.length && claim.confidence));
}

export type MusicRightsCandidate = {
  trackTitle: string;
  sourceUrl: string;
  licenseType: string;
  commercialUseAllowed: boolean;
  contentIdClear: boolean;
  evidenceUrl?: string;
};

export function resolveMusicRights(candidate: MusicRightsCandidate) {
  const verified = Boolean(
    candidate.trackTitle.trim()
    && candidate.sourceUrl.trim()
    && candidate.licenseType.trim()
    && candidate.commercialUseAllowed
    && candidate.contentIdClear
    && candidate.evidenceUrl?.trim(),
  );
  return verified ? "VERIFIED" as const : "NEEDS_REVIEW" as const;
}

export const MUSIC_SOURCE_ALLOWLIST = [
  "studio.youtube.com",
  "pixabay.com",
  "mixkit.co",
  "freemusicarchive.org",
  "incompetech.com",
  "uppbeat.io",
] as const;

export function isAllowlistedMusicSource(sourceUrl: string) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return MUSIC_SOURCE_ALLOWLIST.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function isRetryableGeminiStatus(status: number) {
  return [429, 500, 502, 503, 504].includes(status);
}

export function geminiBackoffMs(attempt: number, retryAfterSeconds?: number) {
  if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 30_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

export type RenderQc = {
  durationSeconds: number;
  audioSyncPassed: boolean;
  blackFramesPassed: boolean;
  loudnessPassed: boolean;
  subtitlesPassed: boolean;
};

export function hasPassingRenderQc(qc: RenderQc) {
  return Number.isFinite(qc.durationSeconds)
    && qc.durationSeconds > 0
    && qc.audioSyncPassed
    && qc.blackFramesPassed
    && qc.loudnessPassed
    && qc.subtitlesPassed;
}

export function canPublishWorkflow(input: { verifiedMusicRights: boolean; finalVideoUrl?: string; scriptApproved: boolean }) {
  return input.verifiedMusicRights && Boolean(input.finalVideoUrl?.trim()) && input.scriptApproved;
}
