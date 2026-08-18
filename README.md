# Red Hat Engineer Content Workflow OS

This application is a **persistent video-production control center** for the Red Hat Engineer YouTube channel. It turns a technical topic brief into a durable workflow that records source research, script revisions, narrator manifests, scene-image provenance, music rights, render quality checks, and required human decisions.

The product deliberately separates three categories of work. The dashboard owns **state, evidence, approvals, and manifests**. A connected browser performs user-session work such as live research and Google Flow generation. A local worker performs FFmpeg rendering. This structure means a project remains resumable even when one external tool or provider requires manual intervention.

## Included workflow

| Stage | What the application records | How the stage advances |
| --- | --- | --- |
| Live research | Browser handoff, structured JSON evidence, readable Markdown report, claims, contradictions, and version notes | Import a complete live-research package |
| Script | Versioned narration draft, commands, and source references | Human approval is mandatory |
| Gemini TTS | Sentence-safe chunk manifest, model, voice, chunk checkpoints, and generated audio artifacts | Configure Gemini, then run the narration job |
| Scene plan | Independent scene prompts and scene task records | Produce a source-aware visual plan |
| Google Flow images | Browser handoff, per-scene prompt, image location, download time, and provenance | Import every scene separately; retry only failed scenes |
| Music rights | Track source, license type, attribution, commercial-use evidence, and Content ID evidence | All rights fields must be verified |
| Render | Deterministic FFmpeg manifest, local render result, and QC report | Import a final video with every QC check passing |
| Review and publishing | Human approval records and a YouTube-ready publishing package | Each approval is explicitly recorded |

## Run locally

Install dependencies and start the project from the repository root.

```bash
pnpm install
pnpm dev
```

Run static and unit validation with:

```bash
pnpm check
pnpm test
```

The full-stack template already supplies the database and application-authentication configuration for the managed environment. For a fresh local clone, configure the template’s required `DATABASE_URL`, OAuth, and application environment values using the same mechanism as your local template setup. Do **not** commit a `.env` file with private values.

## Optional provider configuration

The application works in **manifest-and-handoff mode** without third-party credentials. In that mode, projects can be created, browser-research requests can be prepared, research evidence can be imported, rights evidence can be recorded, and local render manifests can be produced. Live provider execution remains paused until configured.

| Variable | Purpose | Default when absent |
| --- | --- | --- |
| `GEMINI_API_KEY` | Enables server-side Gemini narration execution | Audio stage pauses after producing the chunk manifest |
| `GEMINI_TTS_MODEL` | Selects the Gemini speech model | `gemini-3.1-flash-tts-preview` |
| `GEMINI_TTS_VOICE` | Selects the Gemini voice | `Kore` |

After adding a valid Gemini key, return to a paused **Gemini TTS** stage and select **Resume**, then **Run Gemini TTS**. The application preserves generated chunks as individual artifacts so an interrupted run can restart from the next recorded checkpoint rather than discarding completed output. Retryable provider responses use bounded exponential backoff, record the retry outcome against the chunk artifact, and validate the generated WAV container before accepting the chunk.

## Live browser research protocol

The dashboard intentionally does not pretend to browse the web from the hosted application. Select **Request browser research** to create a project-specific handoff. Complete the following work in a connected browser session:

1. Start from a search engine and navigate to primary sources such as Red Hat documentation, upstream Linux documentation, Ansible documentation, Kubernetes documentation, OpenShift documentation, and relevant release notes.
2. Follow source links when a technical statement depends on a release, command syntax, support boundary, or version behavior. Record a source URL and access timestamp for every evidence item.
3. Use community sources only for clearly labeled secondary context. Record contradictions and unresolved questions rather than treating them as facts.
4. Return a structured JSON object with `summary`, `sources`, `claims`, `contradictions`, `unknowns`, and `versionSensitiveNotes`.
5. Use **Import research JSON** in the project workspace. The system stores both the original JSON and a generated Markdown evidence report.

The research import rejects incomplete sources or unsupported claims, which ensures script generation begins with traceable evidence.

## Google Flow image procedure

The app produces a scene plan before image work begins. Select **Prepare Google Flow handoff**, open Google Flow in your connected browser session, and generate each scene independently. Keep the generated image filename stable, for example `scene-001.png`.

After downloading an image, open **Import scene** and enter the scene, image location, Google Flow URL, exact prompt used, and download timestamp. The system stores the provenance against that scene. Failed scenes can be retried or re-imported without affecting downloaded scenes.

> The dashboard cannot use a user’s browser session directly. This is a deliberate boundary that keeps browser credentials and user-controlled third-party actions outside the application runtime.

## Music rights intake

Only add music from a source that you have independently verified as permitted for the intended use. The API accepts only URLs from the current source allowlist: **YouTube Studio Audio Library, Pixabay, Mixkit, Free Music Archive, Incompetech, and Uppbeat**. Enter the track source, license type, attribution requirement, commercial-use confirmation, Content ID status, and a URL to the license evidence. The pipeline blocks render and publishing work until the music record is marked **VERIFIED**.

This is a rights-evidence workflow, not a legal clearance service. Retain the original source and license evidence outside the application as part of your channel’s compliance records.

## Local FFmpeg rendering

The application creates a reproducible render manifest but does not execute FFmpeg inside the autoscaling web runtime. Use the manifest and stored artifacts on a local workstation or purpose-built rendering worker.

The manifest specifies a 16:9, 1920×1080, 30 FPS MP4 with H.264 video, AAC audio, slow zoom-and-pan motion, narration, ducked music, and subtitle expectations. After rendering, import the final video URL or storage location and confirm all quality controls:

- duration is present and positive;
- narration and visuals are synchronized;
- no black frames are detected;
- audio loudness is acceptable; and
- subtitles are present and usable.

The project cannot enter final review until every check is recorded as passed.

## Development checks

The repository includes Vitest coverage for the highest-risk rules: legal state transitions, dependency-driven stage eligibility, approval pausing, complete research evidence, music-rights gating, render QC, and publishing eligibility.

| Command | Expected result |
| --- | --- |
| `pnpm check` | TypeScript completes without errors |
| `pnpm test` | Authentication and workflow policy tests pass |
| Manual project creation | A project receives all nine stages and starts at live research |
| Browser handoff | A project-specific instruction package appears without requiring provider credentials |
| Rights intake | Missing evidence pauses music; verified evidence unlocks the render prerequisite |

## Repository structure

| Path | Responsibility |
| --- | --- |
| `shared/workflow.ts` | State-machine contract, dependencies, channel profile, and artifact vocabulary |
| `server/workflowService.ts` | Persistent orchestration, provider adapters, approval logic, manifests, and handoffs |
| `server/workflowPolicy.ts` | Pure testable evidence, rights, QC, and publishing rules |
| `server/routers/workflow.ts` | Authenticated workflow API contract |
| `server/db.ts` | Project, stage, event, artifact, approval, scene, and rights persistence |
| `client/src/pages/` | Control center, creation brief, and project-workspace interface |
| `drizzle/schema.ts` | Database model and migrations |

## Safety and operating boundaries

The system records a human approval before audio proceeds from the script, before final review passes, and before any publishing package is considered ready. It does not perform automatic YouTube publication. Browser-connected work, rights verification, and final delivery remain explicit operator actions.
