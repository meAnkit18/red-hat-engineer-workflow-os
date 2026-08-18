import type { ProjectStatus, StageStatus } from "@shared/workflow";

type UiStatus = StageStatus | ProjectStatus;

const statusStyles: Record<UiStatus, string> = {
  PENDING: "border-slate-300 bg-white text-slate-600",
  RUNNING: "border-cyan-300 bg-cyan-50 text-cyan-900",
  COMPLETED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  FAILED: "border-rose-300 bg-rose-50 text-rose-900",
  RETRYING: "border-amber-300 bg-amber-50 text-amber-900",
  PAUSED: "border-violet-300 bg-violet-50 text-violet-900",
  WAITING_APPROVAL: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900",
  CANCELLED: "border-slate-300 bg-slate-100 text-slate-500",
};

const statusDots: Record<UiStatus, string> = {
  PENDING: "bg-slate-400",
  RUNNING: "bg-cyan-500 animate-pulse",
  COMPLETED: "bg-emerald-500",
  FAILED: "bg-rose-500",
  RETRYING: "bg-amber-500 animate-pulse",
  PAUSED: "bg-violet-500",
  WAITING_APPROVAL: "bg-fuchsia-500",
  CANCELLED: "bg-slate-400",
};

export function statusClass(status: UiStatus) {
  return statusStyles[status];
}

export function statusDotClass(status: UiStatus) {
  return statusDots[status];
}

export function statusLabel(status: UiStatus) {
  return status.replaceAll("_", " ");
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function formatPillar(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
