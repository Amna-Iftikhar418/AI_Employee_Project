'use client';

import type { FC, CSSProperties } from 'react';

type IconComponent = FC<{ className?: string; style?: CSSProperties; strokeWidth?: number }>;
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2, WifiOff, Bot, AlertTriangle,
  Layers, Clock, CheckCheck, Activity,
  Mail, MessageCircle, Share2, Building2, Globe, CalendarDays, Camera,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import ActivityFeed from '@/components/ActivityFeed';
import DomainCard from '@/components/DomainCard';
import WorkloadChart from '@/components/WorkloadChart';
import { fetchHealth, fetchTasks, fetchPending, PendingFile, DomainMatrix } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';

// ── domain config ──────────────────────────────────────────────────────────────

const DOMAIN_CONFIG = [
  { key: 'email',     label: 'Gmail',     icon: Mail,          href: '/gmail',      color: '#ea4335' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle, href: '/whatsapp',   color: '#25d366' },
  { key: 'linkedin',  label: 'LinkedIn',  icon: Share2,        href: '/linkedin',   color: '#0a66c2' },
  { key: 'facebook',  label: 'Facebook',  icon: Share2,        href: '/social',     color: '#1877f2' },
  { key: 'instagram', label: 'Instagram', icon: Camera,        href: '/social',     color: '#e1306c' },
  { key: 'odoo',      label: 'Odoo',      icon: Building2,     href: '/odoo',       color: '#714b67' },
  { key: 'browser',   label: 'Browser',   icon: Globe,         href: '/browser',    color: '#f97316' },
  { key: 'scheduler', label: 'Scheduler', icon: CalendarDays,  href: '/scheduler',  color: '#8b5cf6' },
] as const;

// ── helpers ────────────────────────────────────────────────────────────────────

function sumStage(matrix: DomainMatrix[], stage: string): number {
  return matrix.reduce((t, d) => t + (d.stages[stage]?.count ?? 0), 0);
}

function sumAll(matrix: DomainMatrix[]): number {
  return matrix.reduce(
    (t, d) => t + Object.values(d.stages).reduce((s, v) => s + v.count, 0),
    0,
  );
}

// ── topbar health chip ─────────────────────────────────────────────────────────

function HealthChip() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 30_000 });
  const online  = data?.mcp === 'ok';
  const unknown = data === undefined;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
        unknown
          ? 'bg-[#4c7273]/10 border-[#4c7273]/30 text-[#4c7273]'
          : online
          ? 'bg-[#86b9b0]/10 border-[#86b9b0]/35 text-[#86b9b0]'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
      }`}
    >
      {unknown ? (
        <span className="w-1.5 h-1.5 rounded-full bg-[#4c7273] animate-pulse" />
      ) : online ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <WifiOff className="w-3 h-3" />
      )}
      {unknown ? 'Checking…' : online ? 'MCP Online' : 'MCP Down'}
    </div>
  );
}

// ── stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, accent, sub,
}: {
  label: string;
  value: number;
  icon: IconComponent;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="relative flex flex-col justify-between gap-3 p-4 rounded-2xl bg-[#042630] border border-[#4c7273]/20 overflow-hidden">
      {/* subtle corner glow */}
      <div
        className="absolute -top-6 -right-6 w-16 h-16 rounded-full blur-2xl opacity-30"
        style={{ background: accent }}
      />
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${accent}18`, border: `1px solid ${accent}35` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-[28px] font-black text-[#d0d6d6] leading-none tabular-nums">{value}</p>
        <p className="text-[11px] font-semibold text-[#4c7273] mt-1 uppercase tracking-[0.12em]">{label}</p>
        {sub && <p className="text-[10px] text-[#4c7273]/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── urgent strip ───────────────────────────────────────────────────────────────

function UrgentStrip({ files }: { files: PendingFile[] }) {
  const shown = files.slice(0, 5);
  return (
    <div className="bg-[#042630] border border-amber-400/20 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-amber-400">
          Needs Attention · {files.length} item{files.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1 h-px bg-amber-400/15" />
        <Link
          href="/pending"
          className="text-[10px] text-[#4c7273] hover:text-[#86b9b0] transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="space-y-2">
        {shown.map((f) => {
          const domainColor = DOMAIN_COLORS[f.domain] ?? '#86b9b0';
          return (
            <div
              key={f.filepath}
              className="flex items-center gap-3 py-1.5 px-3 rounded-xl border-l-2 bg-[#041421]"
              style={{ borderColor: `${domainColor}50` }}
            >
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: `${domainColor}20`, color: domainColor }}
              >
                {f.domain}
              </span>
              <span className="text-xs text-[#d0d6d6] flex-1 truncate">{f.filename}</span>
              <time className="text-[10px] text-[#4c7273] shrink-0 tabular-nums">
                {formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}
              </time>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: matrix = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    refetchInterval: 30_000,
  });

  const { data: pendingFiles = [] } = useQuery({
    queryKey: ['pending'],
    queryFn: fetchPending,
    refetchInterval: 15_000,
  });

  const byKey = Object.fromEntries(matrix.map((d) => [d.domain, d]));

  const totalTasks  = sumAll(matrix);
  const needsAction = sumStage(matrix, 'Needs_Action');
  const pendingCount = sumStage(matrix, 'Pending_Approval');
  const doneCount   = sumStage(matrix, 'Done');

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#041421] flex flex-col">

      {/* ── Sticky topbar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3.5 border-b border-[#4c7273]/20 bg-[#041421]/95 backdrop-blur-md shrink-0">
        {/* Logo */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #4c7273 0%, #86b9b0 100%)' }}
        >
          <Bot className="w-4 h-4 text-[#010f16]" strokeWidth={2.3} />
        </div>
        <span className="text-sm font-bold text-[#d0d6d6] tracking-wide">AI Employee</span>
        <span className="text-[#4c7273]/40 text-sm select-none">·</span>
        <span className="text-xs text-[#4c7273]">{today}</span>

        <div className="flex-1" />

        <HealthChip />

        {/* Pending badge */}
        {pendingFiles.length > 0 && (
          <Link
            href="/pending"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/35 text-amber-400 text-[11px] font-bold hover:bg-amber-400/20 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {pendingFiles.length} pending
          </Link>
        )}
      </header>

      {/* ── Page body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 p-5 max-w-[1400px] mx-auto w-full">
        <div className="grid grid-cols-12 gap-5">

          {/* ── LEFT column: 8 / 12 ────────────────────────────────────────── */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Total Tasks"
                value={totalTasks}
                icon={Layers}
                accent="#86b9b0"
                sub="across all domains"
              />
              <StatCard
                label="Needs Action"
                value={needsAction}
                icon={Activity}
                accent="#f59e0b"
                sub="awaiting AI response"
              />
              <StatCard
                label="Pending Approval"
                value={pendingCount}
                icon={Clock}
                accent="#f97316"
                sub="waiting for you"
              />
              <StatCard
                label="Done"
                value={doneCount}
                icon={CheckCheck}
                accent="#10b981"
                sub="completed tasks"
              />
            </div>

            {/* Live workload chart */}
            <WorkloadChart />

            {/* Domain cards */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#4c7273]">
                  Domain Status
                </span>
                <div className="flex-1 h-px bg-[#4c7273]/20" />
                <div className="flex items-center gap-3 text-[10px] text-[#4c7273]">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />clear
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />active
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f43f5e]" />needs fix
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DOMAIN_CONFIG.map(({ key, label, icon, color, href }) => (
                  <DomainCard
                    key={key}
                    domainKey={key}
                    label={label}
                    icon={icon}
                    color={color}
                    href={href}
                    data={byKey[key]}
                  />
                ))}
              </div>
            </div>

            {/* Urgent strip — only when there are pending items */}
            {pendingFiles.length > 0 && (
              <UrgentStrip files={pendingFiles} />
            )}

          </div>

          {/* ── RIGHT column: 4 / 12 — Live Feed ──────────────────────────── */}
          <div className="col-span-12 lg:col-span-4">
            <div className="sticky top-[57px]">
              <div className="bg-[#042630] border border-[#4c7273]/20 rounded-2xl p-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 4.5rem)' }}>
                {/* Feed header */}
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                  <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#4c7273]">
                    Live Feed
                  </span>
                  <div className="flex-1 h-px bg-[#4c7273]/20" />
                  <span className="text-[10px] text-[#4c7273]/60">today</span>
                </div>

                {/* Feed scroll area */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <ActivityFeed />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
