'use client';

import type { FC, CSSProperties } from 'react';

type IconComponent = FC<{ className?: string; style?: CSSProperties; strokeWidth?: number }>;
import Link from 'next/link';
import { DomainMatrix } from '@/lib/api';

interface StageBar {
  key: string;
  color: string;
}

const STAGES: StageBar[] = [
  { key: 'Needs_Action',     color: '#f59e0b' },
  { key: 'Pending_Approval', color: '#f97316' },
  { key: 'Approved',         color: '#86b9b0' },
  { key: 'Done',             color: '#10b981' },
  { key: 'Rejected',         color: '#f43f5e' },
];

function getStatus(data: DomainMatrix | undefined): 'green' | 'amber' | 'red' {
  if (!data) return 'red';
  if ((data.stages['Rejected']?.count ?? 0) > 0) return 'red';
  const hot = (data.stages['Pending_Approval']?.count ?? 0) + (data.stages['Needs_Action']?.count ?? 0);
  return hot > 0 ? 'amber' : 'green';
}

const STATUS_GLOW: Record<string, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red:   '#f43f5e',
};

interface Props {
  domainKey: string;
  label: string;
  icon: IconComponent;
  color: string;
  href: string;
  data: DomainMatrix | undefined;
}

export default function DomainCard({ label, icon: Icon, color, href, data }: Props) {
  const status = getStatus(data);
  const glowColor = STATUS_GLOW[status];

  const stageCounts = STAGES.map((s) => ({
    ...s,
    count: data?.stages[s.key]?.count ?? 0,
  }));
  const total = stageCounts.reduce((sum, s) => sum + s.count, 0);

  const needsAction = data?.stages['Needs_Action']?.count ?? 0;
  const pending     = data?.stages['Pending_Approval']?.count ?? 0;
  const done        = data?.stages['Done']?.count ?? 0;
  const rejected    = data?.stages['Rejected']?.count ?? 0;

  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 p-4 rounded-2xl bg-[#042630] border border-[#4c7273]/20 hover:border-[#86b9b0]/40 hover:bg-[#04303e] transition-all duration-200 overflow-hidden"
    >
      {/* Top color bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl transition-opacity duration-200 opacity-50 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }}
      />

      {/* Status dot */}
      <span
        className="absolute top-3 right-3 w-2 h-2 rounded-full shrink-0"
        style={{ background: glowColor, boxShadow: `0 0 6px ${glowColor}99` }}
      />

      {/* Icon + label */}
      <div className="flex items-center gap-2.5 mt-1">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}35` }}
        >
          <Icon className="w-[15px] h-[15px]" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#d0d6d6] leading-none truncate">{label}</p>
          <p className="text-[10px] text-[#4c7273] mt-0.5">{total} total</p>
        </div>
      </div>

      {/* Stage bar */}
      <div className="h-1.5 rounded-full overflow-hidden flex gap-px bg-[#041421]">
        {total === 0 ? (
          <div className="flex-1 rounded-full bg-[#4c7273]/15" />
        ) : (
          stageCounts
            .filter((s) => s.count > 0)
            .map((s) => (
              <div
                key={s.key}
                style={{ background: s.color, width: `${(s.count / total) * 100}%` }}
              />
            ))
        )}
      </div>

      {/* Counts */}
      <div className="flex items-center gap-2 flex-wrap text-[10px] font-medium leading-none">
        {needsAction > 0 && (
          <span className="text-amber-400">{needsAction} action</span>
        )}
        {pending > 0 && (
          <span className="text-orange-400">{pending} pending</span>
        )}
        {rejected > 0 && (
          <span className="text-rose-400">{rejected} rejected</span>
        )}
        {done > 0 && (
          <span className="text-[#4c7273]">{done} done</span>
        )}
        {total === 0 && (
          <span className="text-[#4c7273]/60">No activity</span>
        )}
      </div>
    </Link>
  );
}
