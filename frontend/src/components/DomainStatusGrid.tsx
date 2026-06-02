'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Mail, MessageCircle, Share2, Building2, Globe, CalendarDays, Camera } from 'lucide-react';
import { fetchTasks, DomainMatrix } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const DOMAIN_CONFIG = [
  { key: 'email',     label: 'Gmail',     icon: Mail,          href: '/gmail' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle, href: '/whatsapp' },
  { key: 'linkedin',  label: 'LinkedIn',  icon: Share2,        href: '/linkedin' },
  { key: 'facebook',  label: 'Facebook',  icon: Share2,        href: '/social' },
  { key: 'instagram', label: 'Instagram', icon: Camera,        href: '/social' },
  { key: 'odoo',      label: 'Odoo',      icon: Building2,     href: '/odoo' },
  { key: 'browser',   label: 'Browser',   icon: Globe,         href: '/browser' },
  { key: 'scheduler', label: 'Scheduler', icon: CalendarDays,  href: '/scheduler' },
] as const;

function getStatus(domain: DomainMatrix | undefined): 'green' | 'amber' | 'red' {
  if (!domain) return 'red';
  const stages = domain.stages;
  const pending = stages['Pending_Approval']?.count ?? 0;
  const needsAction = stages['Needs_Action']?.count ?? 0;
  const rejected = stages['Rejected']?.count ?? 0;
  if (rejected > 0) return 'red';
  if (pending > 0 || needsAction > 0) return 'amber';
  return 'green';
}

function getTotalCount(domain: DomainMatrix | undefined): number {
  if (!domain) return 0;
  return Object.values(domain.stages).reduce((s, v) => s + v.count, 0);
}

function getLastMod(domain: DomainMatrix | undefined): string | null {
  if (!domain) return null;
  return (
    Object.values(domain.stages)
      .map((s) => s.lastModified)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  );
}

const STATUS_CONFIG: Record<string, { dot: string; glow: string }> = {
  green: { dot: 'bg-emerald-400', glow: 'shadow-[0_0_8px_rgba(52,211,153,0.9)]' },
  amber: { dot: 'bg-amber-400',   glow: 'shadow-[0_0_8px_rgba(251,191,36,0.9)]' },
  red:   { dot: 'bg-rose-400',    glow: 'shadow-[0_0_8px_rgba(251,113,133,0.9)]' },
};

export default function DomainStatusGrid() {
  const { data } = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks, refetchInterval: 30_000 });

  const byKey = Object.fromEntries((data ?? []).map((d) => [d.domain, d]));

  return (
    <div className="flex flex-wrap gap-3">
      {DOMAIN_CONFIG.map(({ key, label, icon: Icon, href }) => {
        const domain = byKey[key];
        const status = getStatus(domain);
        const count = getTotalCount(domain);
        const color = DOMAIN_COLORS[key] ?? '#86b9b0';
        const { dot, glow } = STATUS_CONFIG[status];

        return (
          <Link
            key={key}
            href={href}
            className="flex items-center gap-3 px-4 py-3 rounded-full bg-[#042630] border border-[#4c7273]/25 hover:border-[#86b9b0]/50 hover:shadow-[0_0_18px_rgba(134,185,176,0.15)] transition-all duration-200 min-w-[190px] flex-1"
          >
            <div
              className="w-7 h-7 rounded-full bg-[#041421] border border-[#4c7273]/30 flex items-center justify-center shrink-0"
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#d0d6d6] leading-none">{label}</p>
              {(() => {
                const iso = getLastMod(domain);
                return iso ? (
                  <time dateTime={iso} className="text-[11px] text-[#4c7273] truncate block mt-0.5">
                    {new Date(iso).toLocaleDateString()}
                  </time>
                ) : (
                  <p className="text-[11px] text-[#4c7273] truncate mt-0.5">No activity</p>
                );
              })()}
            </div>
            <span className="text-sm font-bold text-[#d0d6d6] shrink-0">{count}</span>
            <span
              className={cn('w-2.5 h-2.5 rounded-full shrink-0', dot, glow, status === 'red' && 'pulse-accent')}
              aria-label={`Status: ${status}`}
            />
          </Link>
        );
      })}
    </div>
  );
}
