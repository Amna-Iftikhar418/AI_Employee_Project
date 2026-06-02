'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Mail, MessageCircle, Share2, Building2, Globe, CalendarDays, Camera, CheckCircle2, WifiOff,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import RevenueBar from '@/components/RevenueBar';
import DomainStatusGrid from '@/components/DomainStatusGrid';
import ActivityFeed from '@/components/ActivityFeed';
import TiltCard from '@/components/three/TiltCard';
import { DynamicHeroMesh } from '@/components/three/SceneLoader';
import { fetchTasks, fetchGoals, fetchHealth, DomainMatrix } from '@/lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function totalTasks(matrix: DomainMatrix[], domain: string): number {
  const row = matrix.find((d) => d.domain === domain);
  if (!row) return 0;
  return Object.values(row.stages).reduce((s, v) => s + v.count, 0);
}

function pendingCount(matrix: DomainMatrix[], domain: string): number {
  const row = matrix.find((d) => d.domain === domain);
  return (row?.stages['Pending_Approval']?.count ?? 0) + (row?.stages['Needs_Action']?.count ?? 0);
}

const KPI_DOMAINS = [
  { key: 'email',     label: 'Gmail',     href: '/gmail',     icon: <Mail className="w-5 h-5" />,         from: '#ea4335', to: '#fbbc04' },
  { key: 'whatsapp',  label: 'WhatsApp',  href: '/whatsapp',  icon: <MessageCircle className="w-5 h-5" />, from: '#25d366', to: '#128c7e' },
  { key: 'linkedin',  label: 'LinkedIn',  href: '/linkedin',  icon: <Share2 className="w-5 h-5" />,        from: '#0a66c2', to: '#004182' },
  { key: 'facebook',  label: 'Facebook',  href: '/social',    icon: <Share2 className="w-5 h-5" />,        from: '#1877f2', to: '#0a4fc4' },
  { key: 'instagram', label: 'Instagram', href: '/social',    icon: <Camera className="w-5 h-5" />,        from: '#e1306c', to: '#833ab4' },
  { key: 'odoo',      label: 'Odoo',      href: '/odoo',      icon: <Building2 className="w-5 h-5" />,     from: '#714b67', to: '#a855f7' },
  { key: 'browser',   label: 'Browser',   href: '/browser',   icon: <Globe className="w-5 h-5" />,         from: '#f97316', to: '#ef4444' },
  { key: 'scheduler', label: 'Scheduler', href: '/scheduler', icon: <CalendarDays className="w-5 h-5" />,  from: '#8b5cf6', to: '#6366f1' },
];

// ── section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#4c7273] shrink-0">
        {children}
      </span>
      <div className="flex-1 h-px bg-[#4c7273]/20" />
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function KpiRow() {
  const { data: matrix = [] } = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {KPI_DOMAINS.map(({ key, label, href, icon, from, to }) => {
        const total = totalTasks(matrix, key);
        const pending = pendingCount(matrix, key);
        return (
          <TiltCard key={key} className="rounded-2xl">
            <KpiCard
              title={label}
              value={total}
              subtitle={pending > 0 ? `${pending} pending` : 'Up to date'}
              subtitleHref={pending > 0 ? '/pending' : undefined}
              icon={icon}
              gradientFrom={from}
              gradientTo={to}
              href={href}
            />
          </TiltCard>
        );
      })}
    </div>
  );
}

function RevenueSection() {
  const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: fetchGoals });
  const fm = goals?.frontmatter ?? {};
  const current = Number(fm['mtd_revenue'] ?? fm['current_revenue'] ?? fm['revenue_mtd'] ?? 0);
  const target = Number(fm['revenue_target'] ?? fm['monthly_target'] ?? fm['target'] ?? 0);

  const renderBar = (c: number, t: number) => (
    <div className="h-full flex flex-col">
      <p className="text-sm font-semibold text-[#d0d6d6] mb-4">Monthly Revenue</p>
      <div className="flex-1 flex items-end">
        <RevenueBar current={c} target={t} />
      </div>
    </div>
  );

  if (target === 0) {
    const match = goals?.content?.match(/(?:mtd|current)[^\d]*(\d[\d,]*)/i);
    const tMatch = goals?.content?.match(/target[^\d]*(\d[\d,]*)/i);
    const c = match ? Number(match[1].replace(/,/g, '')) : 0;
    const t = tMatch ? Number(tMatch[1].replace(/,/g, '')) : 0;
    if (t > 0) return renderBar(c, t);
    return null;
  }

  return renderBar(current, target);
}

function HealthChip() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 30_000 });
  const online = data?.mcp === 'ok';
  const unknown = data === undefined;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        unknown
          ? 'bg-[#4c7273]/10 border-[#4c7273]/30 text-[#4c7273]'
          : online
          ? 'bg-[#86b9b0]/10 border-[#86b9b0]/40 text-[#86b9b0] shadow-[0_0_10px_rgba(134,185,176,0.3)]'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
      }`}
      aria-label={`MCP server status: ${unknown ? 'checking' : online ? 'online' : 'down'}`}
    >
      {unknown ? (
        <span className="w-2 h-2 rounded-full bg-[#4c7273] animate-pulse" />
      ) : online ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <WifiOff className="w-3.5 h-3.5" />
      )}
      {unknown ? 'Checking MCP…' : online ? 'MCP Online' : 'MCP Down'}
      {data?.timestamp && (
        <time dateTime={data.timestamp} className="text-[10px] opacity-60 ml-1">
          {new Date(data.timestamp).toLocaleTimeString()}
        </time>
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">

      {/* Hero header */}
      <header className="relative flex items-center gap-6 mb-8 pb-6 border-b border-[#4c7273]/20 bg-[#041421] rounded-2xl px-6 pt-6">
        <div className="flex-1">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#4c7273] mb-2">
            Autonomous AI System
          </p>
          <h1 className="text-4xl font-black leading-none">
            <span className="bg-gradient-to-r from-[#86b9b0] to-[#d0d6d6] bg-clip-text text-transparent">
              AI Employee
            </span>
          </h1>
          <p className="text-sm text-[#4c7273] mt-2">
            Live control center · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="mt-4">
            <HealthChip />
          </div>
        </div>
        <DynamicHeroMesh />
      </header>

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-4">

        {/* KPI cards — 9 cols */}
        <div className="col-span-12 lg:col-span-9">
          <section aria-label="Domain KPIs">
            <SectionLabel>Task Counts by Domain</SectionLabel>
            <KpiRow />
          </section>
        </div>

        {/* Revenue panel — 3 cols, spans 2 rows */}
        <div className="col-span-12 lg:col-span-3 lg:row-span-2">
          <SectionLabel>Revenue</SectionLabel>
          <div className="h-full bg-[#042630] rounded-2xl border border-[#4c7273]/25 p-5 relative overflow-hidden">
            {/* Subtle radial glow behind bar */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 50% 80%, rgba(134,185,176,0.07) 0%, transparent 70%)',
              }}
            />
            <div className="relative">
              <RevenueSection />
            </div>
          </div>
        </div>

        {/* Domain status — 9 cols on row 2 */}
        <div className="col-span-12 lg:col-span-9">
          <section aria-label="Domain status overview">
            <SectionLabel>Domain Status</SectionLabel>
            <DomainStatusGrid />
          </section>
        </div>

        {/* Activity feed — full width */}
        <div className="col-span-12">
          <section aria-label="Recent activity">
            <SectionLabel>Today&apos;s Activity</SectionLabel>
            <div className="bg-[#042630] rounded-2xl border border-[#4c7273]/25 p-5">
              <ActivityFeed />
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
