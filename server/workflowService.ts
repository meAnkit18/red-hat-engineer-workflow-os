import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  addActivity,
  approveScriptVersion,
  createApproval,
  createArtifact,
  createBrowserRun,
  createMusicRight,
  createSceneAsset,
  createScriptVersion,
  getProjectStage,
  getWorkflowProject,
  hasVerifiedMusicRights,
  resolveApproval,
  updateBrowserRun,
  updateProjectWorkflowStatus,
  updateSceneAsset,
  updateStageState,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import {
  STAGE_DEFINITIONS,
  type ArtifactKind,
  type StageKey,
  type StageStatus,
  stageDefinition,
} from "../shared/workflow";
import { assertValidStageTransition, deriveProjectStatus, nextEligibleStage } from "./workflowUtils";
import { geminiBackoffMs, hasCompleteResearchEvidence, hasPassingRenderQc, isAllowlistedMusicSource, isRetryableGeminiStatus, resolveMusicRights } from "./workflowPolicy";

type ResearchSource = {
  title: string;
  url: string;
  publisher: string;
  accessedAt: string;
  notes?: string;
};

type ResearchClaim = {
  claim: string;
  sourceUrls: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  versionNotes?: string;
  contradiction?: string;
};

export type ResearchPackage = {
  summary: string;
  sources: ResearchSource[];
  claims: ResearchClaim[];
  contradictions: string[];
  unknowns: string[];
  versionSensitiveNotes: string[];
};

type ScriptPayload = {
  title: string;
  markdown: string;
  commands: Array<{ command: string; context: string }>;
  sources: Array<{ label: string; url: string }>;
};

function serviceError(message: string, code: "BAD_REQUEST" | "CONFLICT" | "PRECONDITION_FAILED" | "NOT_FOUND" = "BAD_REQUEST") {
  return new TRPCError({ code, message });
}

function stageByKey(workspace: NonNullable<Awaited<ReturnType<typeof getWorkflowProject>>>, key: StageKey) {
  const stage = workspace.stages.find(current => current.stageKey === key);
  if (!stage) throw serviceError(`Workflow stage ${key} is missing.`, "NOT_FOUND");
  return stage;
}

function nowStageStatus(workspace: NonNullable<Awaited<ReturnType<typeof getWorkflowProject>>>) {
  return deriveProjectStatus(workspace.stages.map(stage => stage.status));
}

function researchMarkdown(research: ResearchPackage) {
  const sourceTable = research.sources
    .map(source => `| ${source.title} | ${source.publisher} | ${source.url} | ${source.accessedAt} |`)
    .join("\n");
  const claimSection = research.claims
    .map(claim => `### ${claim.claim}\n\n- Confidence: ${claim.confidence}\n- Sources: ${claim.sourceUrls.join(", ")}\n${claim.versionNotes ? `- Version note: ${claim.versionNotes}` : ""}${claim.contradiction ? `\n- Contradiction: ${claim.contradiction}` : ""}`)
    .join("\n\n");
  return `# Research package\n\n## Executive summary\n\n${research.summary}\n\n## Sources\n\n| Title | Publisher | URL | Accessed |\n| --- | --- | --- | --- |\n${sourceTable || "| No sources imported | — | — | — |"}\n\n## Claims\n\n${claimSection || "No claims were imported."}\n\n## Contradictions\n\n${research.contradictions.map(item => `- ${item}`).join("\n") || "No contradictions recorded."}\n\n## Unknowns\n\n${research.unknowns.map(item => `- ${item}`).join("\n") || "No unknowns recorded."}\n\n## Version-sensitive notes\n\n${research.versionSensitiveNotes.map(item => `- ${item}`).join("\n") || "No version-sensitive notes recorded."}\n`;
}

function browserResearchInstructions(input: { title: string; topicBrief: string; requiredPoints: string[]; prohibitedSources: string[] }) {
  const prohibited = input.prohibitedSources.length ? input.prohibitedSources.map(source => `- Do not use: ${source}`).join("\n") : "- No excluded source domains were supplied.";
  const required = input.requiredPoints.length ? input.requiredPoints.map(point => `- ${point}`).join("\n") : "- Establish the relevant concepts, commands, risks, and version boundaries.";
  return `# Live browser research request\n\nUse the connected browser to research **${input.title}** for the Red Hat Engineer YouTube channel. Start with a search engine, then open and read primary sources including Red Hat documentation and relevant upstream Linux, Ansible, Kubernetes, OpenShift, or project documentation. Follow links inside the source documents when a claim depends on a version, release note, command reference, or support boundary. Use community sources only to surface practical context, and clearly label them as secondary.\n\n## Topic brief\n\n${input.topicBrief}\n\n## Required coverage\n\n${required}\n\n## Prohibited sources\n\n${prohibited}\n\n## Required structured output\n\nReturn a JSON package with \`summary\`, \`sources\`, \`claims\`, \`contradictions\`, \`unknowns\`, and \`versionSensitiveNotes\`. Each source needs title, URL, publisher, and access time. Every technical claim must include its supporting URLs, confidence level, and version note where relevant. Do not present uncertain or contradictory claims as settled facts.`;
}

function splitNarration(markdown: string) {
  const plainText = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[>*_`]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = plainText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(sentence => sentence.trim()).filter(Boolean) ?? [];
  const chunks: Array<{ index: number; text: string; characterCount: number }> = [];
  let current = "";
  for (const sentence of sentences) {
    if (`${current} ${sentence}`.trim().length > 520 && current) {
      chunks.push({ index: chunks.length + 1, text: current.trim(), characterCount: current.trim().length });
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current) chunks.push({ index: chunks.length + 1, text: current.trim(), characterCount: current.trim().length });
  return chunks;
}

function wavFromPcm(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function callGeminiTts(text: string, voice: string, model: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw serviceError("Gemini TTS is not configured. Add GEMINI_API_KEY before running narration generation.", "PRECONDITION_FAILED");
  const request = {
    model,
    input: `Read this Red Hat Engineer narration clearly, with a practical and precise teaching tone:\n\n${text}`,
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice }] },
  };
  let lastError = "Unknown Gemini TTS failure";
  let totalBackoffMs = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(request),
    });
    if (response.ok) {
      const body = (await response.json()) as { output_audio?: { data?: string } };
      const data = body.output_audio?.data;
      if (!data) throw serviceError("Gemini TTS returned no audio payload.", "PRECONDITION_FAILED");
      return { pcm: Buffer.from(data, "base64"), attemptCount: attempt + 1, totalBackoffMs };
    }
    lastError = await response.text();
    if (!isRetryableGeminiStatus(response.status) || attempt === 3) break;
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    const delay = geminiBackoffMs(attempt, retryAfter);
    totalBackoffMs += delay;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw serviceError(`Gemini TTS failed: ${lastError}`, "PRECONDITION_FAILED");
}

function validateWavBuffer(wave: Buffer, sampleRate = 24000) {
  if (wave.length <= 44 || wave.subarray(0, 4).toString() !== "RIFF" || wave.subarray(8, 12).toString() !== "WAVE") {
    throw serviceError("Generated narration did not produce a valid WAV file.", "PRECONDITION_FAILED");
  }
  const declaredDataLength = wave.readUInt32LE(40);
  if (declaredDataLength !== wave.length - 44 || declaredDataLength === 0) {
    throw serviceError("Generated narration WAV data is incomplete.", "PRECONDITION_FAILED");
  }
  return { byteLength: wave.length, durationSeconds: Number((declaredDataLength / (sampleRate * 2)).toFixed(3)) };
}

async function setStageCompleteAndAdvance(userId: number, projectId: number, stageKey: StageKey, outputManifest?: Record<string, unknown>) {
  const workspace = await getWorkflowProject(userId, projectId);
  if (!workspace) throw serviceError("Project not found.", "NOT_FOUND");
  const stage = stageByKey(workspace, stageKey);
  await updateStageState({
    projectId,
    stageId: stage.id,
    status: "COMPLETED",
    outputManifest: outputManifest ?? stage.outputManifest,
    completedAt: new Date(),
    pauseReason: null,
    failureReason: null,
  });
  const refreshed = await getWorkflowProject(userId, projectId);
  if (!refreshed) throw serviceError("Project not found.", "NOT_FOUND");
  const nextStageKey = nextEligibleStage(refreshed.stages);
  await updateProjectWorkflowStatus(projectId, deriveProjectStatus(refreshed.stages.map(item => item.status)), nextStageKey);
  return nextStageKey;
}

async function startStage(userId: number, projectId: number, stageKey: StageKey) {
  const data = await getProjectStage(userId, projectId, stageKey);
  if (!data) throw serviceError("Project or stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  for (const dependency of stageDefinition(stageKey).dependsOn) {
    if (stageByKey(workspace, dependency).status !== "COMPLETED") {
      throw serviceError(`${stageDefinition(stageKey).label} cannot start until ${stageDefinition(dependency).label} is completed.`, "PRECONDITION_FAILED");
    }
  }
  if (stage.status !== "RUNNING") {
    assertValidStageTransition(stage.status, "RUNNING");
    await updateStageState({
      projectId,
      stageId: stage.id,
      status: "RUNNING",
      attemptCount: stage.attemptCount + 1,
      startedAt: new Date(),
      pauseReason: null,
      failureReason: null,
    });
    await updateProjectWorkflowStatus(projectId, "RUNNING", stageKey);
  }
  return stage;
}

export async function requestBrowserResearch(userId: number, projectId: number) {
  const { workspace, stage } = (await getProjectStage(userId, projectId, "RESEARCH")) ?? {};
  if (!workspace || !stage) throw serviceError("Research stage not found.", "NOT_FOUND");
  await startStage(userId, projectId, "RESEARCH");
  const instructions = browserResearchInstructions(workspace.project);
  const browserRunId = await createBrowserRun({
    projectId,
    stageId: stage.id,
    purpose: "RESEARCH",
    state: "WAITING_FOR_USER",
    instructions,
    handoffPayload: { targetDomains: ["access.redhat.com", "docs.redhat.com", "docs.ansible.com", "kubernetes.io"], schemaVersion: 1 },
  });
  await updateStageState({ projectId, stageId: stage.id, status: "PAUSED", pauseReason: "Waiting for the connected-browser research package.", checkpointVersion: stage.checkpointVersion + 1 });
  await updateProjectWorkflowStatus(projectId, "PAUSED", "RESEARCH");
  await addActivity({ projectId, stageId: stage.id, eventType: "BROWSER_RESEARCH_READY", severity: "INFO", message: "Live browser research handoff created. Import the structured package when browsing is complete.", payload: { browserRunId } });
  return { browserRunId, instructions };
}

export async function importResearchPackage(userId: number, projectId: number, research: ResearchPackage) {
  const data = await getProjectStage(userId, projectId, "RESEARCH");
  if (!data) throw serviceError("Research stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  if (!hasCompleteResearchEvidence(research)) throw serviceError("A research package requires complete source details and at least one supported claim.", "PRECONDITION_FAILED");
  const markdown = researchMarkdown(research);
  const checksum = crypto.createHash("sha256").update(JSON.stringify(research)).digest("hex");
  await createArtifact({ projectId, stageId: stage.id, kind: "RESEARCH_JSON", title: "Structured live research package", inlineContent: JSON.stringify(research, null, 2), checksum, metadata: { sourceCount: research.sources.length, claimCount: research.claims.length } });
  await createArtifact({ projectId, stageId: stage.id, kind: "RESEARCH_MARKDOWN", title: "Live research narrative", inlineContent: markdown, checksum: crypto.createHash("sha256").update(markdown).digest("hex"), metadata: { sourceCount: research.sources.length } });
  const latestRun = workspace.browserRuns.find(run => run.purpose === "RESEARCH" && run.state !== "IMPORTED");
  if (latestRun) await updateBrowserRun({ id: latestRun.id, projectId, state: "IMPORTED", resultSummary: research.summary, handoffPayload: research as unknown as Record<string, unknown> });
  const nextStageKey = await setStageCompleteAndAdvance(userId, projectId, "RESEARCH", { sourceCount: research.sources.length, claimCount: research.claims.length, checksum });
  await addActivity({ projectId, stageId: stage.id, eventType: "RESEARCH_IMPORTED", severity: "SUCCESS", message: `Imported ${research.sources.length} live sources and ${research.claims.length} supported claims.`, payload: { nextStageKey } });
  return { nextStageKey };
}

export async function generateScriptDraft(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "SCRIPT");
  if (!data) throw serviceError("Script stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  await startStage(userId, projectId, "SCRIPT");
  const researchJson = workspace.artifacts.find(artifact => artifact.kind === "RESEARCH_JSON")?.inlineContent ?? "{}";
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You create precise, practical Red Hat Engineer YouTube scripts. Do not invent technical facts. Keep commands safe, explain assumptions, cite sources supplied in research, and distinguish commands from narration." },
      { role: "user", content: `Create a technical script for the topic below.\n\nTopic: ${workspace.project.title}\nBrief: ${workspace.project.topicBrief}\nAudience: ${workspace.project.audienceLevel}\nTarget duration: ${workspace.project.targetDurationSeconds} seconds\nRequired points: ${workspace.project.requiredPoints.join("; ")}\n\nResearch package:\n${researchJson}` },
    ],
    maxTokens: 3500,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "red_hat_engineer_script",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            markdown: { type: "string" },
            commands: { type: "array", items: { type: "object", properties: { command: { type: "string" }, context: { type: "string" } }, required: ["command", "context"], additionalProperties: false } },
            sources: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["label", "url"], additionalProperties: false } },
          },
          required: ["title", "markdown", "commands", "sources"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message.content;
  if (typeof content !== "string") throw serviceError("Script generator returned an invalid response.", "PRECONDITION_FAILED");
  let script: ScriptPayload;
  try {
    script = JSON.parse(content) as ScriptPayload;
  } catch {
    throw serviceError("Script generator returned invalid JSON.", "PRECONDITION_FAILED");
  }
  const scriptId = await createScriptVersion({ projectId, title: script.title, markdown: script.markdown, commandReferences: script.commands, sourceReferences: script.sources });
  const scriptArtifactId = await createArtifact({ projectId, stageId: stage.id, kind: "SCRIPT_MARKDOWN", title: `Script draft: ${script.title}`, version: workspace.scripts.length + 1, inlineContent: script.markdown, checksum: crypto.createHash("sha256").update(script.markdown).digest("hex"), metadata: { scriptId, commandCount: script.commands.length, sourceCount: script.sources.length } });
  await createArtifact({ projectId, stageId: stage.id, kind: "SCRIPT_JSON", title: `Script draft data: ${script.title}`, version: workspace.scripts.length + 1, inlineContent: JSON.stringify(script, null, 2), metadata: { scriptId, scriptArtifactId } });
  const approvalId = await createApproval(projectId, stage.id, "SCRIPT");
  await updateStageState({ projectId, stageId: stage.id, status: "WAITING_APPROVAL", outputManifest: { scriptId, scriptArtifactId, approvalId }, checkpointVersion: stage.checkpointVersion + 1, pauseReason: "A human must approve the script before audio generation." });
  await updateProjectWorkflowStatus(projectId, "PAUSED", "SCRIPT");
  await addActivity({ projectId, stageId: stage.id, eventType: "SCRIPT_DRAFT_READY", severity: "SUCCESS", message: "A new versioned script draft is ready for human review.", payload: { scriptId, approvalId } });
  return { scriptId, approvalId };
}

export async function decideApproval(userId: number, projectId: number, approvalId: number, decision: "APPROVED" | "REJECTED", notes?: string) {
  const workspace = await getWorkflowProject(userId, projectId);
  if (!workspace) throw serviceError("Project not found.", "NOT_FOUND");
  const approval = workspace.approvals.find(item => item.id === approvalId);
  if (!approval || approval.decision !== "PENDING") throw serviceError("Pending approval not found.", "NOT_FOUND");
  await resolveApproval({ approvalId, projectId, reviewerUserId: userId, decision, notes });
  const stage = workspace.stages.find(item => item.id === approval.stageId);
  if (!stage) throw serviceError("Approval stage is missing.", "NOT_FOUND");
  if (decision === "REJECTED") {
    await updateStageState({ projectId, stageId: stage.id, status: "PAUSED", pauseReason: notes ?? "Approval was rejected." });
    await updateProjectWorkflowStatus(projectId, "PAUSED", stage.stageKey);
    await addActivity({ projectId, stageId: stage.id, eventType: "APPROVAL_REJECTED", severity: "WARNING", message: `Approval rejected for ${stageDefinition(stage.stageKey).label}.`, payload: { approvalId } });
    return { nextStageKey: stage.stageKey, status: "PAUSED" as const };
  }
  if (approval.approvalType === "SCRIPT") {
    const draft = workspace.scripts.find(script => script.status === "DRAFT");
    if (!draft) throw serviceError("No draft script is available for approval.", "PRECONDITION_FAILED");
    await approveScriptVersion(projectId, draft.id);
  }
  const nextStageKey = await setStageCompleteAndAdvance(userId, projectId, stage.stageKey);
  await addActivity({ projectId, stageId: stage.id, eventType: "APPROVAL_GRANTED", severity: "SUCCESS", message: `Approval granted for ${stageDefinition(stage.stageKey).label}.`, payload: { approvalId, nextStageKey } });
  return { nextStageKey, status: "COMPLETED" as const };
}

export async function prepareAudioManifest(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "AUDIO");
  if (!data) throw serviceError("Audio stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  await startStage(userId, projectId, "AUDIO");
  const approvedScript = workspace.scripts.find(script => script.status === "APPROVED");
  if (!approvedScript) throw serviceError("Approve a script before preparing narration.", "PRECONDITION_FAILED");
  const chunks = splitNarration(approvedScript.markdown);
  if (!chunks.length) throw serviceError("The approved script contains no narration text.", "PRECONDITION_FAILED");
  const manifest = { model: process.env.GEMINI_TTS_MODEL ?? "gemini-3.1-flash-tts-preview", voice: process.env.GEMINI_TTS_VOICE ?? "Kore", sampleRate: 24000, sourceScriptVersion: approvedScript.version, chunks, status: process.env.GEMINI_API_KEY ? "READY" : "CONFIGURATION_REQUIRED" };
  const artifactId = await createArtifact({ projectId, stageId: stage.id, kind: "AUDIO_CHUNK_MANIFEST", title: "Gemini TTS chunk manifest", inlineContent: JSON.stringify(manifest, null, 2), checksum: crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"), metadata: { chunkCount: chunks.length, configured: Boolean(process.env.GEMINI_API_KEY) } });
  if (!process.env.GEMINI_API_KEY) {
    await updateStageState({ projectId, stageId: stage.id, status: "PAUSED", outputManifest: { artifactId, ...manifest }, checkpointVersion: stage.checkpointVersion + 1, pauseReason: "Gemini TTS is not configured. Add GEMINI_API_KEY, then resume this stage." });
    await updateProjectWorkflowStatus(projectId, "PAUSED", "AUDIO");
  } else {
    await updateStageState({ projectId, stageId: stage.id, status: "PENDING", outputManifest: { artifactId, ...manifest }, checkpointVersion: stage.checkpointVersion + 1 });
    await updateProjectWorkflowStatus(projectId, "PENDING", "AUDIO");
  }
  await addActivity({ projectId, stageId: stage.id, eventType: "AUDIO_MANIFEST_READY", severity: "SUCCESS", message: `${chunks.length} sentence-safe narration chunks are ready for Gemini TTS.`, payload: { artifactId, configured: Boolean(process.env.GEMINI_API_KEY) } });
  return { artifactId, chunkCount: chunks.length, configured: Boolean(process.env.GEMINI_API_KEY) };
}

export async function runGeminiAudio(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "AUDIO");
  if (!data) throw serviceError("Audio stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  const manifestArtifact = workspace.artifacts.find(artifact => artifact.kind === "AUDIO_CHUNK_MANIFEST");
  if (!manifestArtifact?.inlineContent) throw serviceError("Create an audio chunk manifest first.", "PRECONDITION_FAILED");
  const manifest = JSON.parse(manifestArtifact.inlineContent) as { model: string; voice: string; chunks: Array<{ index: number; text: string }> };
  await startStage(userId, projectId, "AUDIO");
  const recordedOutputs = workspace.artifacts
    .filter(artifact => artifact.kind === "AUDIO_MASTER" && typeof (artifact.metadata as { chunkIndex?: unknown }).chunkIndex === "number" && artifact.url)
    .map(artifact => ({ index: Number((artifact.metadata as { chunkIndex: number }).chunkIndex), artifactId: artifact.id, url: artifact.url! }));
  const outputs: Array<{ index: number; artifactId: number; url: string }> = [...recordedOutputs];
  for (const chunk of manifest.chunks) {
    if (outputs.some(output => output.index === chunk.index)) continue;
    await updateStageState({ projectId, stageId: stage.id, status: "RUNNING", checkpointVersion: stage.checkpointVersion + outputs.length, outputManifest: { ...manifest, outputs, currentChunk: chunk.index, retryPolicy: { maxAttempts: 4, exponentialBackoff: true } } });
    try {
      const generated = await callGeminiTts(chunk.text, manifest.voice, manifest.model);
      const wave = wavFromPcm(generated.pcm);
      const validation = validateWavBuffer(wave);
      const stored = await storagePut(`red-hat-engineer/${projectId}/audio/chunk-${String(chunk.index).padStart(3, "0")}.wav`, wave, "audio/wav");
      const artifactId = await createArtifact({ projectId, stageId: stage.id, kind: "AUDIO_MASTER", title: `Narration chunk ${chunk.index}`, storageKey: stored.key, url: stored.url, checksum: crypto.createHash("sha256").update(wave).digest("hex"), metadata: { chunkIndex: chunk.index, model: manifest.model, voice: manifest.voice, sampleRate: 24000, validation, attemptCount: generated.attemptCount, backoffMs: generated.totalBackoffMs } });
      outputs.push({ index: chunk.index, artifactId, url: stored.url });
      await updateStageState({ projectId, stageId: stage.id, status: "RUNNING", checkpointVersion: stage.checkpointVersion + outputs.length, outputManifest: { ...manifest, outputs, currentChunk: null, completedChunkCount: outputs.length } });
      if (generated.attemptCount > 1) await addActivity({ projectId, stageId: stage.id, eventType: "AUDIO_RATE_LIMIT_RECOVERED", severity: "WARNING", message: `Narration chunk ${chunk.index} recovered after ${generated.attemptCount} provider attempts.`, payload: { chunkIndex: chunk.index, attemptCount: generated.attemptCount, backoffMs: generated.totalBackoffMs } });
      await addActivity({ projectId, stageId: stage.id, eventType: "AUDIO_CHUNK_COMPLETED", severity: "INFO", message: `Generated and validated narration chunk ${chunk.index} of ${manifest.chunks.length}.`, payload: { chunkIndex: chunk.index, artifactId, validation } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gemini TTS failure";
      await updateStageState({ projectId, stageId: stage.id, status: "PAUSED", pauseReason: `Narration chunk ${chunk.index} needs a retry: ${message}`, checkpointVersion: stage.checkpointVersion + outputs.length, outputManifest: { ...manifest, outputs, currentChunk: chunk.index, retryState: "EXHAUSTED_OR_CONFIGURATION_REQUIRED" } });
      await updateProjectWorkflowStatus(projectId, "PAUSED", "AUDIO");
      await addActivity({ projectId, stageId: stage.id, eventType: "AUDIO_CHUNK_PAUSED", severity: "WARNING", message: `Narration stopped at chunk ${chunk.index}; completed chunks are preserved for resume.`, payload: { chunkIndex: chunk.index, completedChunkCount: outputs.length, error: message } });
      throw error;
    }
  }
  const nextStageKey = await setStageCompleteAndAdvance(userId, projectId, "AUDIO", { ...manifest, outputs });
  await addActivity({ projectId, stageId: stage.id, eventType: "AUDIO_GENERATION_COMPLETED", severity: "SUCCESS", message: `Generated ${outputs.length} persistent narration artifacts.`, payload: { nextStageKey } });
  return { outputs, nextStageKey };
}

export async function generateScenePlan(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "SCENES");
  if (!data) throw serviceError("Scene stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  await startStage(userId, projectId, "SCENES");
  const approvedScript = workspace.scripts.find(script => script.status === "APPROVED");
  if (!approvedScript) throw serviceError("Approve a script before planning scenes.", "PRECONDITION_FAILED");
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a visual director for the Red Hat Engineer YouTube channel. Create technical, realistic scene prompts. Never render code or command output inside generated images; reserve text and commands for deterministic overlays. Use a 16:9 composition and specify what needs to be visually clear." },
      { role: "user", content: `Break this approved script into 5 to 14 sequential 16:9 scenes. Return concise but production-ready Google Flow image prompts.\n\n${approvedScript.markdown}` },
    ],
    maxTokens: 2200,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scene_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            scenes: { type: "array", minItems: 5, maxItems: 14, items: { type: "object", properties: { sceneNumber: { type: "integer" }, prompt: { type: "string" }, narrationCue: { type: "string" }, estimatedSeconds: { type: "integer" } }, required: ["sceneNumber", "prompt", "narrationCue", "estimatedSeconds"], additionalProperties: false } },
          },
          required: ["scenes"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message.content;
  if (typeof content !== "string") throw serviceError("Scene planner returned an invalid response.", "PRECONDITION_FAILED");
  const plan = JSON.parse(content) as { scenes: Array<{ sceneNumber: number; prompt: string; narrationCue: string; estimatedSeconds: number }> };
  const sceneIds = [] as number[];
  for (const scene of plan.scenes) sceneIds.push(await createSceneAsset({ projectId, stageId: stage.id, sceneNumber: scene.sceneNumber, prompt: scene.prompt }));
  const artifactId = await createArtifact({ projectId, stageId: stage.id, kind: "SCENE_PLAN", title: "Google Flow scene plan", inlineContent: JSON.stringify(plan, null, 2), checksum: crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex"), metadata: { sceneCount: plan.scenes.length, sceneIds } });
  const nextStageKey = await setStageCompleteAndAdvance(userId, projectId, "SCENES", { artifactId, sceneCount: plan.scenes.length });
  await addActivity({ projectId, stageId: stage.id, eventType: "SCENE_PLAN_READY", severity: "SUCCESS", message: `Created ${plan.scenes.length} isolated image-generation scene tasks.`, payload: { artifactId, nextStageKey } });
  return { artifactId, sceneCount: plan.scenes.length, nextStageKey };
}

export async function requestGoogleFlowImages(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "IMAGES");
  if (!data) throw serviceError("Image stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  await startStage(userId, projectId, "IMAGES");
  const pendingScenes = workspace.scenes.filter(scene => ["PENDING", "RETRYING", "FAILED"].includes(scene.status));
  if (!pendingScenes.length) throw serviceError("No scene prompts are available for image generation.", "PRECONDITION_FAILED");
  const instructions = `# Google Flow image-generation handoff\n\nUse the connected browser to open Google Flow. Work through each listed scene independently. For every completed scene, download the image using a stable filename such as \`scene-001.png\`, then import the file URL and provenance into this project. If a scene fails, retry only that scene; do not restart completed scenes.\n\n${pendingScenes.map(scene => `## Scene ${scene.sceneNumber}\n\n${scene.prompt}`).join("\n\n")}`;
  const browserRunId = await createBrowserRun({ projectId, stageId: stage.id, purpose: "GOOGLE_FLOW", state: "WAITING_FOR_USER", instructions, handoffPayload: { sceneIds: pendingScenes.map(scene => scene.id), provider: "Google Flow" } });
  await updateStageState({ projectId, stageId: stage.id, status: "PAUSED", pauseReason: "Waiting for Google Flow image-generation and download handoff.", checkpointVersion: stage.checkpointVersion + 1, outputManifest: { browserRunId, requestedSceneCount: pendingScenes.length } });
  await updateProjectWorkflowStatus(projectId, "PAUSED", "IMAGES");
  await addActivity({ projectId, stageId: stage.id, eventType: "GOOGLE_FLOW_HANDOFF_READY", severity: "INFO", message: `Google Flow handoff prepared for ${pendingScenes.length} independent scenes.`, payload: { browserRunId } });
  return { browserRunId, instructions };
}

export async function importSceneImage(userId: number, input: { projectId: number; sceneId: number; url: string; sourceUrl: string; promptUsed: string; downloadedAt: string }) {
  const workspace = await getWorkflowProject(userId, input.projectId);
  if (!workspace) throw serviceError("Project not found.", "NOT_FOUND");
  const imagesStage = stageByKey(workspace, "IMAGES");
  const scene = workspace.scenes.find(item => item.id === input.sceneId);
  if (!scene) throw serviceError("Scene not found.", "NOT_FOUND");
  const artifactId = await createArtifact({ projectId: input.projectId, stageId: imagesStage.id, kind: "IMAGE_MANIFEST", title: `Scene ${scene.sceneNumber} image provenance`, url: input.url, metadata: { sceneId: scene.id, sceneNumber: scene.sceneNumber, sourceUrl: input.sourceUrl, promptUsed: input.promptUsed, downloadedAt: input.downloadedAt, provider: "Google Flow" } });
  await updateSceneAsset({ id: scene.id, projectId: input.projectId, status: "DOWNLOADED", artifactId, provenance: { sourceUrl: input.sourceUrl, promptUsed: input.promptUsed, downloadedAt: input.downloadedAt, provider: "Google Flow" } });
  await addActivity({ projectId: input.projectId, stageId: imagesStage.id, eventType: "SCENE_IMAGE_IMPORTED", severity: "SUCCESS", message: `Imported Google Flow image for scene ${scene.sceneNumber}.`, payload: { sceneId: scene.id, artifactId } });
  const refreshed = await getWorkflowProject(userId, input.projectId);
  if (refreshed && refreshed.scenes.length && refreshed.scenes.every(item => ["DOWNLOADED", "APPROVED"].includes(item.status))) {
    const nextStageKey = await setStageCompleteAndAdvance(userId, input.projectId, "IMAGES", { completedSceneCount: refreshed.scenes.length });
    return { artifactId, completedAllScenes: true, nextStageKey };
  }
  return { artifactId, completedAllScenes: false, nextStageKey: null };
}

export async function recordMusicRights(userId: number, input: { projectId: number; trackTitle: string; sourceUrl: string; licenseType: string; attributionText?: string; commercialUseAllowed: boolean; contentIdClear: boolean; evidenceUrl?: string }) {
  if (!isAllowlistedMusicSource(input.sourceUrl)) throw serviceError("Music source is not allowlisted. Use an approved source and preserve its license evidence before continuing.", "PRECONDITION_FAILED");
  const data = await getProjectStage(userId, input.projectId, "MUSIC");
  if (!data) throw serviceError("Music stage not found.", "NOT_FOUND");
  const { stage } = data;
  await startStage(userId, input.projectId, "MUSIC");
  const resolutionStatus = resolveMusicRights(input);
  const musicRightId = await createMusicRight({ ...input, stageId: stage.id, resolutionStatus });
  const artifactId = await createArtifact({ projectId: input.projectId, stageId: stage.id, kind: "MUSIC_RIGHTS", title: `Music rights: ${input.trackTitle}`, inlineContent: JSON.stringify({ ...input, resolutionStatus }, null, 2), metadata: { musicRightId, resolutionStatus } });
  if (resolutionStatus === "VERIFIED") {
    const nextStageKey = await setStageCompleteAndAdvance(userId, input.projectId, "MUSIC", { artifactId, musicRightId, resolutionStatus });
    await addActivity({ projectId: input.projectId, stageId: stage.id, eventType: "MUSIC_RIGHTS_VERIFIED", severity: "SUCCESS", message: "Music license evidence is verified for commercial use and Content ID handling.", payload: { musicRightId, nextStageKey } });
    return { musicRightId, artifactId, resolutionStatus, nextStageKey };
  }
  await updateStageState({ projectId: input.projectId, stageId: stage.id, status: "PAUSED", pauseReason: "Music rights are unresolved. Commercial-use and Content ID evidence are required.", outputManifest: { artifactId, musicRightId, resolutionStatus } });
  await updateProjectWorkflowStatus(input.projectId, "PAUSED", "MUSIC");
  await addActivity({ projectId: input.projectId, stageId: stage.id, eventType: "MUSIC_RIGHTS_BLOCKED", severity: "WARNING", message: "Music record saved, but publishing remains blocked until rights are verified.", payload: { musicRightId } });
  return { musicRightId, artifactId, resolutionStatus, nextStageKey: null };
}

export async function createRenderManifest(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "RENDER");
  if (!data) throw serviceError("Render stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  if (!(await hasVerifiedMusicRights(projectId))) throw serviceError("Rendering is blocked until at least one music track has verified commercial-use and Content ID evidence.", "PRECONDITION_FAILED");
  await startStage(userId, projectId, "RENDER");
  const audio = workspace.artifacts.filter(artifact => artifact.kind === "AUDIO_MASTER").map(artifact => ({ url: artifact.url, metadata: artifact.metadata }));
  const images = workspace.artifacts.filter(artifact => artifact.kind === "IMAGE_MANIFEST").map(artifact => ({ url: artifact.url, metadata: artifact.metadata }));
  const music = workspace.rights.filter(right => right.resolutionStatus === "VERIFIED").map(right => ({ title: right.trackTitle, sourceUrl: right.sourceUrl, attributionText: right.attributionText, artifactId: right.artifactId }));
  const manifest = { version: 1, format: { container: "mp4", width: 1920, height: 1080, fps: 30, videoCodec: "libx264", audioCodec: "aac" }, timeline: { narration: audio, scenes: images, music, motion: { effect: "slow-zoom-pan", maxScale: 1.08 }, subtitles: { format: "srt", mode: "word-safe" } }, qc: { requiredChecks: ["duration", "audio-sync", "black-frame-scan", "audio-loudness", "subtitle-presence", "license-evidence"] }, ffmpeg: { executionMode: "local-worker", commandTemplate: "ffmpeg -y -f concat -safe 0 -i inputs.txt -vf \"scale=1920:1080,fps=30\" -c:v libx264 -c:a aac final.mp4" } };
  const artifactId = await createArtifact({ projectId, stageId: stage.id, kind: "RENDER_MANIFEST", title: "Deterministic FFmpeg render manifest", inlineContent: JSON.stringify(manifest, null, 2), checksum: crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"), metadata: { audioChunkCount: audio.length, imageCount: images.length, musicTrackCount: music.length } });
  await updateStageState({ projectId, stageId: stage.id, status: "PAUSED", outputManifest: { artifactId, ...manifest }, checkpointVersion: stage.checkpointVersion + 1, pauseReason: "Render manifest is ready. Execute FFmpeg in the local worker, then import the completed MP4 and QC results." });
  await updateProjectWorkflowStatus(projectId, "PAUSED", "RENDER");
  await addActivity({ projectId, stageId: stage.id, eventType: "RENDER_MANIFEST_READY", severity: "SUCCESS", message: "Deterministic FFmpeg render manifest created; rendering is intentionally delegated to a local worker.", payload: { artifactId } });
  return { artifactId, manifest };
}

export async function importRenderResult(userId: number, input: { projectId: number; finalVideoUrl: string; durationSeconds: number; audioSyncPassed: boolean; blackFramesPassed: boolean; loudnessPassed: boolean; subtitlesPassed: boolean }) {
  const data = await getProjectStage(userId, input.projectId, "RENDER");
  if (!data) throw serviceError("Render stage not found.", "NOT_FOUND");
  const { stage } = data;
  const checks = { durationSeconds: input.durationSeconds, audioSyncPassed: input.audioSyncPassed, blackFramesPassed: input.blackFramesPassed, loudnessPassed: input.loudnessPassed, subtitlesPassed: input.subtitlesPassed };
  if (!hasPassingRenderQc(checks)) throw serviceError("Render QC failed. Resolve all checks before entering review.", "PRECONDITION_FAILED");
  const artifactId = await createArtifact({ projectId: input.projectId, stageId: stage.id, kind: "REVIEW_REPORT", title: "Render QC report", url: input.finalVideoUrl, inlineContent: JSON.stringify(checks, null, 2), metadata: checks });
  const nextStageKey = await setStageCompleteAndAdvance(userId, input.projectId, "RENDER", { artifactId, finalVideoUrl: input.finalVideoUrl, checks });
  await addActivity({ projectId: input.projectId, stageId: stage.id, eventType: "RENDER_QC_IMPORTED", severity: "SUCCESS", message: "Final MP4 and all required QC checks were imported successfully.", payload: { artifactId, nextStageKey } });
  return { artifactId, nextStageKey };
}

export async function requestReview(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "REVIEW");
  if (!data) throw serviceError("Review stage not found.", "NOT_FOUND");
  const { stage } = data;
  await startStage(userId, projectId, "REVIEW");
  const approvalId = await createApproval(projectId, stage.id, "REVIEW");
  await updateStageState({ projectId, stageId: stage.id, status: "WAITING_APPROVAL", pauseReason: "A human must approve the final technical and media review.", outputManifest: { approvalId } });
  await updateProjectWorkflowStatus(projectId, "PAUSED", "REVIEW");
  await addActivity({ projectId, stageId: stage.id, eventType: "FINAL_REVIEW_READY", severity: "INFO", message: "The final QC package is ready for a human approval decision.", payload: { approvalId } });
  return { approvalId };
}

export async function createPublishingExport(userId: number, projectId: number) {
  const data = await getProjectStage(userId, projectId, "PUBLISHING");
  if (!data) throw serviceError("Publishing stage not found.", "NOT_FOUND");
  const { workspace, stage } = data;
  if (!(await hasVerifiedMusicRights(projectId))) throw serviceError("Publishing is blocked until music rights are verified.", "PRECONDITION_FAILED");
  await startStage(userId, projectId, "PUBLISHING");
  const finalVideo = workspace.artifacts.find(artifact => artifact.kind === "REVIEW_REPORT" && artifact.url);
  if (!finalVideo?.url) throw serviceError("Import a final video and QC result before creating a publishing export.", "PRECONDITION_FAILED");
  const approvedScript = workspace.scripts.find(script => script.status === "APPROVED");
  const exportPackage = { title: approvedScript?.title ?? workspace.project.title, description: `${workspace.project.topicBrief}\n\nSources and technical references are preserved in the workflow artifact list.`, videoUrl: finalVideo.url, rightsVerified: true, channelProfile: "red-hat-engineer", uploadMode: "manual-browser-handoff" };
  const artifactId = await createArtifact({ projectId, stageId: stage.id, kind: "PUBLISH_PACKAGE", title: "YouTube publishing export", inlineContent: JSON.stringify(exportPackage, null, 2), metadata: exportPackage });
  const approvalId = await createApproval(projectId, stage.id, "PUBLISHING");
  await updateStageState({ projectId, stageId: stage.id, status: "WAITING_APPROVAL", outputManifest: { artifactId, approvalId }, pauseReason: "A final human decision is required before preparing browser upload instructions." });
  await updateProjectWorkflowStatus(projectId, "PAUSED", "PUBLISHING");
  await addActivity({ projectId, stageId: stage.id, eventType: "PUBLISHING_EXPORT_READY", severity: "SUCCESS", message: "Rights-cleared publishing export is ready for final approval.", payload: { artifactId, approvalId } });
  return { artifactId, approvalId };
}

export async function retryStage(userId: number, projectId: number, stageKey: StageKey) {
  const data = await getProjectStage(userId, projectId, stageKey);
  if (!data) throw serviceError("Project or stage not found.", "NOT_FOUND");
  const { stage } = data;
  if (!["FAILED", "PAUSED", "WAITING_APPROVAL", "COMPLETED"].includes(stage.status)) throw serviceError("Only failed, paused, approval-waiting, or completed stages can be resumed or rerun.", "PRECONDITION_FAILED");
  assertValidStageTransition(stage.status, "RUNNING");
  await updateStageState({ projectId, stageId: stage.id, status: "RUNNING", attemptCount: stage.attemptCount + 1, checkpointVersion: stage.checkpointVersion + 1, startedAt: new Date(), pauseReason: null, failureReason: null });
  await updateProjectWorkflowStatus(projectId, "RUNNING", stageKey);
  await addActivity({ projectId, stageId: stage.id, eventType: "STAGE_RESUMED", severity: "INFO", message: `${stageDefinition(stageKey).label} resumed from checkpoint ${stage.checkpointVersion}.`, payload: { stageKey, checkpointVersion: stage.checkpointVersion } });
  return { checkpointVersion: stage.checkpointVersion };
}

export function workflowHealth(stages: Array<{ status: StageStatus }>) {
  const counts = STAGE_DEFINITIONS.reduce((accumulator, stage) => {
    const status = stages.find(item => "stageKey" in item && (item as { stageKey: StageKey }).stageKey === stage.key)?.status ?? "PENDING";
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {} as Partial<Record<StageStatus, number>>);
  return { counts, complete: counts.COMPLETED === STAGE_DEFINITIONS.length };
}
