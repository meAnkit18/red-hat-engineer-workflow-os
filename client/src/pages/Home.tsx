import DashboardLayout from "@/components/DashboardLayout";
import { WorkflowStatusBadge } from "@/components/WorkflowStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatPillar } from "@/lib/workflowUi";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowUpRight, Clock3, FileSearch, FolderKanban, GitBranch, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

function MetricCard({ label, value, annotation, icon: Icon, tone }: { label: string; value: number; annotation: string; icon: typeof FolderKanban; tone: "cyan" | "pink" | "ink" }) {
  const tones = {
    cyan: "border-cyan-200 bg-cyan-50/80 text-cyan-900",
    pink: "border-pink-200 bg-pink-50/80 text-pink-900",
    ink: "border-slate-200 bg-white text-slate-900",
  } as const;
  return (
    <Card className={`blueprint-card overflow-hidden border ${tones[tone]}`}>
      <CardContent className="relative p-5">
        <div className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-current/15 bg-white/70">
          <Icon className="h-4 w-4" />
        </div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
        <p className="mt-5 text-4xl font-black tracking-[-0.07em]">{value}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] opacity-70">{annotation}</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const projectsQuery = trpc.workflow.list.useQuery();
  const projects = projectsQuery.data ?? [];
  const activeProjects = projects.filter(project => project.status === "RUNNING" || project.status === "PAUSED").length;
  const approvals = projects.reduce((total, project) => total + project.stages.filter(stage => stage.status === "WAITING_APPROVAL").length, 0);
  const completed = projects.filter(project => project.status === "COMPLETED").length;

  return (
    <DashboardLayout>
      <div className="blueprint-shell mx-auto max-w-7xl space-y-8 pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white px-6 py-8 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.42)] md:px-10 md:py-10">
          <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border border-cyan-200/80" />
          <div className="absolute right-12 top-12 h-24 w-24 rotate-45 border border-pink-200/80" />
          <div className="absolute bottom-4 right-6 font-mono text-[10px] tracking-[0.24em] text-slate-300">RHE / WORKFLOW-OS / 01</div>
          <div className="relative max-w-3xl">
            <div className="mb-5 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-700">
              <span className="h-2 w-2 rounded-full bg-cyan-500" /> Red Hat Engineer channel system
            </div>
            <h1 className="max-w-2xl text-4xl font-black leading-[0.93] tracking-[-0.075em] text-slate-950 md:text-6xl">Engineering videos, built as a reproducible system.</h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-600 md:text-base">Coordinate live browser research, source-backed scripting, configurable Gemini narration, scene assets, rights evidence, deterministic rendering, and approvals from one persistent project state machine.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={() => setLocation("/projects/new")} className="rounded-xl bg-slate-950 px-5 text-white shadow-lg shadow-slate-900/15 hover:bg-slate-800">
                <Plus className="mr-2 h-4 w-4" /> New production project
              </Button>
              <Button variant="outline" onClick={() => document.getElementById("workflow-projects")?.scrollIntoView({ behavior: "smooth" })} className="rounded-xl border-slate-300 bg-white">
                View active work <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total projects" value={projects.length} annotation="Persistent project ledger" icon={FolderKanban} tone="ink" />
          <MetricCard label="Active systems" value={activeProjects} annotation="Running or intentionally paused" icon={Activity} tone="cyan" />
          <MetricCard label="Approvals queued" value={approvals} annotation="Human decision required" icon={ShieldCheck} tone="pink" />
          <MetricCard label="Released workflows" value={completed} annotation="All workflow gates passed" icon={Sparkles} tone="ink" />
        </section>

        <section id="workflow-projects" className="grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
          <Card className="blueprint-card overflow-hidden border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 md:px-6">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Production ledger</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950">Projects and stage health</h2>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLocation("/projects/new")} className="rounded-lg"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add project</Button>
            </div>
            <CardContent className="p-0">
              {projectsQuery.isLoading ? (
                <div className="space-y-4 p-6">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div>
              ) : projectsQuery.isError ? (
                <div className="p-8 text-center text-sm text-rose-700">The project ledger could not be loaded. Refresh the page or verify the database migration.</div>
              ) : projects.length === 0 ? (
                <div className="grid min-h-72 place-items-center px-6 py-10 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50"><GitBranch className="h-5 w-5 text-cyan-700" /></div>
                    <h3 className="mt-5 text-xl font-black tracking-[-0.04em] text-slate-950">Your pipeline is ready for its first brief.</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Create a production project to activate the live research, script, scene, rights, and delivery workflow.</p>
                    <Button className="mt-5 rounded-xl" onClick={() => setLocation("/projects/new")}><Plus className="mr-2 h-4 w-4" /> Create first project</Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {projects.map(project => {
                    const progress = Math.round((project.completedStages / project.totalStages) * 100);
                    return (
                      <button key={project.id} onClick={() => setLocation(`/projects/${project.id}`)} className="group w-full px-5 py-5 text-left transition-colors hover:bg-slate-50 md:px-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><WorkflowStatusBadge status={project.status} /><span className="font-mono text-[10px] uppercase tracking-[0.13em] text-slate-400">{formatPillar(project.contentPillar)}</span></div>
                            <h3 className="mt-3 truncate text-lg font-black tracking-[-0.04em] text-slate-950 group-hover:text-cyan-800">{project.title}</h3>
                            <p className="mt-1 line-clamp-1 text-sm text-slate-500">{project.topicBrief}</p>
                          </div>
                          <div className="shrink-0 text-left sm:text-right"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">Updated</p><p className="mt-1 text-xs text-slate-600">{formatDate(project.updatedAt)}</p></div>
                        </div>
                        <div className="mt-4 flex items-center gap-3"><Progress value={progress} className="h-1.5 flex-1 bg-slate-100" /><span className="font-mono text-[10px] font-semibold text-slate-600">{project.completedStages}/{project.totalStages}</span></div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="blueprint-card relative overflow-hidden border-slate-200 bg-slate-950 text-white">
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(103,232,249,0.32)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.32)_1px,transparent_1px)] [background-size:22px_22px]" />
            <CardContent className="relative flex h-full flex-col p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200"><FileSearch className="h-3.5 w-3.5" /> Live research protocol</div>
              <h2 className="mt-5 text-3xl font-black leading-none tracking-[-0.06em]">Browser-first, not knowledge-first.</h2>
              <p className="mt-5 text-sm leading-6 text-slate-300">Every production begins with a connected-browser handoff: active navigation, primary-source reading, version checks, contradiction capture, and an importable evidence package.</p>
              <div className="mt-7 space-y-4 border-t border-white/15 pt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-300">
                <div className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full border border-cyan-300/50 text-cyan-200">01</span> Navigate live sources</div>
                <div className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full border border-cyan-300/50 text-cyan-200">02</span> Capture claims + versions</div>
                <div className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full border border-cyan-300/50 text-cyan-200">03</span> Import package + audit</div>
              </div>
              <div className="mt-auto flex items-center gap-2 pt-8 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400"><Clock3 className="h-3.5 w-3.5" /> Resumable at every stage checkpoint</div>
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}
