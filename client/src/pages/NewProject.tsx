import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AUDIENCE_LEVELS, CHANNEL_PILLARS } from "@shared/workflow";
import { ArrowLeft, Braces, CheckCircle2, CircleDashed, Loader2, Plus, ShieldAlert } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const DEFAULT_BRIEF = "Explain the production problem, desired learning outcome, Red Hat or upstream versions to cover, and practical context the viewer should understand.";

export default function NewProject() {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState("");
  const [topicBrief, setTopicBrief] = useState(DEFAULT_BRIEF);
  const [contentPillar, setContentPillar] = useState<(typeof CHANNEL_PILLARS)[number]["value"]>("RHEL_LINUX");
  const [audienceLevel, setAudienceLevel] = useState<(typeof AUDIENCE_LEVELS)[number]["value"]>("INTERMEDIATE");
  const [durationMinutes, setDurationMinutes] = useState("10");
  const [requiredPoints, setRequiredPoints] = useState("Exact prerequisites\nA safe, practical workflow\nVersion-sensitive caveats\nHow to verify the result");
  const [prohibitedSources, setProhibitedSources] = useState("");
  const createProject = trpc.workflow.create.useMutation({
    onSuccess: ({ projectId }) => {
      toast.success("Production project created. The research stage is ready to activate.");
      setLocation(`/projects/${projectId}`);
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration = Number(durationMinutes);
    if (!Number.isFinite(duration) || duration < 1 || duration > 120) {
      toast.error("Set a target duration between 1 and 120 minutes.");
      return;
    }
    createProject.mutate({
      title,
      topicBrief,
      contentPillar,
      audienceLevel,
      targetDurationSeconds: Math.round(duration * 60),
      requiredPoints: requiredPoints.split("\n").map(item => item.trim()).filter(Boolean),
      prohibitedSources: prohibitedSources.split("\n").map(item => item.trim()).filter(Boolean),
    });
  }

  return (
    <DashboardLayout>
      <div className="blueprint-shell mx-auto max-w-5xl pb-12">
        <button onClick={() => setLocation("/")} className="mb-6 inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-950"><ArrowLeft className="h-3.5 w-3.5" /> Return to control center</button>
        <div className="grid gap-7 lg:grid-cols-[0.78fr_1.42fr]">
          <aside className="space-y-5 lg:pt-8">
            <div className="eyebrow">New production project</div>
            <h1 className="text-4xl font-black leading-[0.93] tracking-[-0.075em] text-slate-950">Start with an engineering brief, not a prompt.</h1>
            <p className="text-sm leading-6 text-slate-600">The brief becomes the persistent contract for research, scripting, narration, image handoffs, licensing evidence, render QC, and publishing approval.</p>
            <div className="blueprint-note mt-7 space-y-4">
              <div className="flex gap-3"><CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" /><p><b>Browser-first research.</b> The first live handoff is designed to gather verifiable, version-aware source evidence.</p></div>
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p><b>Explicit approval gates.</b> Script, final review, and publication never progress without a recorded decision.</p></div>
              <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-pink-700" /><p><b>Rights are a hard blocker.</b> Music must include commercial-use and Content ID evidence before rendering or publishing.</p></div>
            </div>
          </aside>
          <Card className="blueprint-card border-slate-200 bg-white">
            <CardContent className="p-6 md:p-8">
              <form onSubmit={submit} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="title">Working title</Label><Input id="title" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Build an idempotent RHEL patching workflow with Ansible" className="h-11 rounded-xl" required /></div>
                  <div className="space-y-2"><Label>Channel pillar</Label><Select value={contentPillar} onValueChange={value => setContentPillar(value as typeof contentPillar)}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{CHANNEL_PILLARS.map(pillar => <SelectItem key={pillar.value} value={pillar.value}>{pillar.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Audience level</Label><Select value={audienceLevel} onValueChange={value => setAudienceLevel(value as typeof audienceLevel)}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{AUDIENCE_LEVELS.map(level => <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label htmlFor="brief">Technical brief</Label><Textarea id="brief" value={topicBrief} onChange={event => setTopicBrief(event.target.value)} className="min-h-32 rounded-xl" required /><p className="field-caption">Specify the practical engineering problem, intended result, platform context, and version or support boundaries that must be investigated.</p></div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="duration">Target duration (minutes)</Label><Input id="duration" type="number" min="1" max="120" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} className="h-11 rounded-xl" required /></div>
                  <div className="space-y-2"><Label htmlFor="prohibited">Prohibited sources</Label><Textarea id="prohibited" value={prohibitedSources} onChange={event => setProhibitedSources(event.target.value)} className="min-h-20 rounded-xl" placeholder="One domain or source per line" /><p className="field-caption">Optional. This is enforced in the browser-research brief.</p></div>
                </div>
                <div className="space-y-2"><Label htmlFor="points">Required teaching points</Label><Textarea id="points" value={requiredPoints} onChange={event => setRequiredPoints(event.target.value)} className="min-h-28 rounded-xl" required /><p className="field-caption">One requirement per line. These become research and script acceptance criteria.</p></div>
                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" className="rounded-xl" onClick={() => setLocation("/")}>Cancel</Button><Button type="submit" disabled={createProject.isPending} className="rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800">{createProject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Create pipeline project</Button></div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
