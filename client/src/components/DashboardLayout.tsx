import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { Boxes, CirclePlus, FolderKanban, LogOut, PanelLeft, Workflow } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: Boxes, label: "Control Center", path: "/" },
  { icon: CirclePlus, label: "New Project", path: "/projects/new" },
];
const SIDEBAR_WIDTH_KEY = "rhe-workflow-sidebar-width";
const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 224;
const MAX_WIDTH = 420;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <div className="blueprint-login grid min-h-screen place-items-center p-5"><div className="max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-800"><Workflow className="h-5 w-5" /></div><p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Red Hat Engineer workflow OS</p><h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">Authenticate to access your production control center.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Projects, research evidence, artifact records, and approval decisions are protected by the application account.</p><Button onClick={() => startLogin()} size="lg" className="mt-7 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">Sign in to continue</Button></div></div>;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  useEffect(() => { const move = (event: MouseEvent) => { if (!isResizing) return; const left = sidebarRef.current?.getBoundingClientRect().left ?? 0; const width = event.clientX - left; if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width); }; const up = () => setIsResizing(false); if (isResizing) { document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; } return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; }; }, [isResizing, setSidebarWidth]);
  return <><div ref={sidebarRef} className="relative"><Sidebar collapsible="icon" className="border-r border-slate-200 bg-white" disableTransition={isResizing}><SidebarHeader className="h-20 border-b border-slate-100 px-3"><div className="flex items-center gap-3"><button onClick={toggleSidebar} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-800" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed ? <div className="min-w-0"><p className="truncate text-sm font-black tracking-[-0.04em] text-slate-950">Red Hat Engineer</p><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-700">Workflow OS</p></div> : null}</div></SidebarHeader><SidebarContent className="px-2 py-3"><SidebarMenu>{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path || (item.path === "/" && location.startsWith("/projects/"))} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl font-medium"><item.icon className="h-4 w-4" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="mx-2 mt-7 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 group-data-[collapsible=icon]:hidden"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-cyan-700">Architecture</p><p className="mt-2 text-xs leading-5 text-slate-600">Persistent state, source evidence, manual browser handoffs, and rights-safe publishing gates.</p></div></SidebarContent><SidebarFooter className="border-t border-slate-100 p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-1 text-left hover:bg-slate-50"><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="bg-slate-950 text-xs text-white">{user?.name?.charAt(0).toUpperCase() ?? "R"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-semibold text-slate-800">{user?.name || "Engineer"}</p><p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-slate-400">Authenticated session</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-rose-700 focus:text-rose-700"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar>{!isCollapsed ? <div className="absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize hover:bg-cyan-300/40" onMouseDown={() => setIsResizing(true)} /> : null}</div><SidebarInset className="min-h-screen bg-[#fbfcfd]">{isMobile ? <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-3 backdrop-blur"><SidebarTrigger className="rounded-xl border border-slate-200 bg-white" /><span className="text-sm font-black tracking-[-0.03em]">Red Hat Engineer</span></div> : null}<main className="flex-1 p-4 md:p-7">{children}</main></SidebarInset></>;
}
