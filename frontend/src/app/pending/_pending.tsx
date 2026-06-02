'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle2,
  Mail,
  MessageCircle,
  Share2,
  Building2,
  Globe,
  Camera,
} from 'lucide-react';
import ApprovalCard from '@/components/ApprovalCard';
import { fetchPending, PendingFile } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

// ── domain display config ─────────────────────────────────────────────────────

interface DomainMeta {
  label: string;
  icon: React.ReactNode;
  order: number;
}

const DOMAIN_META: Record<string, DomainMeta> = {
  email:     { label: 'Gmail',     icon: <Mail className="w-4 h-4" />,          order: 0 },
  gmail:     { label: 'Gmail',     icon: <Mail className="w-4 h-4" />,          order: 0 },
  whatsapp:  { label: 'WhatsApp',  icon: <MessageCircle className="w-4 h-4" />, order: 1 },
  linkedin:  { label: 'LinkedIn',  icon: <Share2 className="w-4 h-4" />,        order: 2 },
  facebook:  { label: 'Facebook',  icon: <Share2 className="w-4 h-4" />,        order: 3 },
  instagram: { label: 'Instagram', icon: <Camera className="w-4 h-4" />,        order: 4 },
  social:    { label: 'Social',    icon: <Share2 className="w-4 h-4" />,        order: 4 },
  odoo:      { label: 'Odoo',      icon: <Building2 className="w-4 h-4" />,     order: 5 },
  browser:   { label: 'Browser',   icon: <Globe className="w-4 h-4" />,         order: 6 },
};

function domainLabel(domain: string): string {
  return DOMAIN_META[domain]?.label ?? domain;
}

function domainOrder(domain: string): number {
  return DOMAIN_META[domain]?.order ?? 99;
}

function domainIcon(domain: string): React.ReactNode {
  return DOMAIN_META[domain]?.icon ?? <Clock className="w-4 h-4" />;
}

// ── group helper ──────────────────────────────────────────────────────────────

function groupByDomain(files: PendingFile[]): Map<string, PendingFile[]> {
  const map = new Map<string, PendingFile[]>();
  for (const f of files) {
    const key = f.domain;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return map;
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold text-[#d0d6d6]">No pending approvals — all clear!</p>
        <p className="text-sm text-[#4c7273] mt-1">
          All tasks have been reviewed. New items will appear here automatically.
        </p>
      </div>
    </div>
  );
}

// ── domain section ────────────────────────────────────────────────────────────

interface DomainSectionProps {
  domain: string;
  files: PendingFile[];
  removed: Set<string>;
  onApproved: (fp: string) => void;
  onRejected: (fp: string) => void;
}

function DomainSection({ domain, files, removed, onApproved, onRejected }: DomainSectionProps) {
  const visible = files.filter((f) => !removed.has(f.filepath));
  if (visible.length === 0) return null;

  const color = DOMAIN_COLORS[domain] ?? '#6366f1';
  const label = domainLabel(domain);
  const icon = domainIcon(domain);

  return (
    <section aria-label={`${label} pending approvals`}>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}22`, color }}
          aria-hidden
        >
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-[#d0d6d6]">{label}</h2>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
          style={{ backgroundColor: `${color}18`, color, borderColor: `${color}40` }}
        >
          {visible.length}
        </span>
        <div className="flex-1 h-px bg-[#4c7273]/20" />
      </div>

      {/* Cards grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((file) => (
          <ApprovalCard
            key={file.filepath}
            file={file}
            onApproved={onApproved}
            onRejected={onRejected}
          />
        ))}
      </div>
    </section>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function PendingPage() {
  const queryClient = useQueryClient();
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['pending'],
    queryFn: fetchPending,
    refetchInterval: 8_000,
  });

  const handleRemove = useCallback(
    (filepath: string) => {
      setRemoved((prev) => new Set([...prev, filepath]));
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['pending'] });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['domain'] });
      }, 400);
    },
    [queryClient]
  );

  const visibleCount = files.filter((f) => !removed.has(f.filepath)).length;

  // Sort oldest-first so longest-waiting tasks surface at top
  const oldestFirst = [...files]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const groups = groupByDomain(oldestFirst);
  const sortedDomains = [...groups.keys()].sort(
    (a, b) => domainOrder(a) - domainOrder(b)
  );

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#d0d6d6]">Pending Approvals</h1>
            {visibleCount > 0 && (
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                aria-label={`${visibleCount} pending`}
              >
                {visibleCount}
              </span>
            )}
          </div>
          <p className="text-sm text-[#4c7273] mt-0.5">
            Review and approve AI-generated tasks before they execute
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center text-[#4c7273] text-sm">
          Loading pending approvals…
        </div>
      ) : visibleCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">
          {sortedDomains.map((domain) => (
            <DomainSection
              key={domain}
              domain={domain}
              files={groups.get(domain)!}
              removed={removed}
              onApproved={handleRemove}
              onRejected={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
