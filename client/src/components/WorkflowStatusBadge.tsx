import { Badge } from "@/components/ui/badge";
import { statusClass, statusDotClass, statusLabel } from "@/lib/workflowUi";
import type { ProjectStatus, StageStatus } from "@shared/workflow";

export function WorkflowStatusBadge({ status }: { status: StageStatus | ProjectStatus }) {
  return (
    <Badge variant="outline" className={`gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] ${statusClass(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(status)}`} />
      {statusLabel(status)}
    </Badge>
  );
}
