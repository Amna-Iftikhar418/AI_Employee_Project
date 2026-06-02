'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fetchLogs, LogEntry, LogStatus } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';

// ── status colors ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<LogStatus, string> = {
  success: '#10b981',
  error:   '#f43f5e',
  warning: '#f59e0b',
  info:    '#86b9b0',
};

const STATUS_BADGE: Record<LogStatus, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  error:   'bg-rose-500/15    text-rose-400    border-rose-500/25',
  warning: 'bg-amber-500/15   text-amber-400   border-amber-500/25',
  info:    'bg-[#4c7273]/20   text-[#86b9b0]   border-[#4c7273]/25',
};

// ── group consecutive identical entries ───────────────────────────────────────

interface GroupedEntry extends LogEntry {
  count: number;
}

function groupConsecutive(entries: LogEntry[]): GroupedEntry[] {
  const out: GroupedEntry[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.domain === e.domain && last.action === e.action && last.result === e.result) {
      last.count++;
    } else {
      out.push({ ...e, count: 1 });
    }
  }
  return out;
}

function entryDate(time: string): Date {
  const today = new Date();
  const [h, m, s] = time.split(':').map(Number);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, s);
}

// ── single timeline row ───────────────────────────────────────────────────────

function TimelineRow({ entry, isFirst, isLast }: { entry: GroupedEntry; isFirst: boolean; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const domainColor = DOMAIN_COLORS[entry.domain] ?? '#86b9b0';
  const status      = entry.status ?? 'info';
  const statusColor = STATUS_DOT[status];
  const date        = entryDate(entry.time);
  const isLong      = entry.result.length > 100;

  return (
    <div className="relative flex items-start gap-4 py-3 pl-8 pr-2 hover:bg-[#042630] rounded-xl transition-colors">
      {/* Vertical connector */}
      {!isLast && (
        <div className="absolute left-[7px] top-7 bottom-0 w-px bg-[#4c7273]/15" />
      )}

      {/* Timeline node */}
      <div
        className="absolute left-0 top-3.5 w-4 h-4 rounded-full border-2 bg-[#041421] flex items-center justify-center shrink-0"
        style={{ borderColor: statusColor }}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full${isFirst ? ' pulse-accent' : ''}`}
          style={{ backgroundColor: statusColor }}
        />
      </div>

      <div className="flex-1 min-w-0">
        {/* Row header: domain + label + repeat count + status badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${domainColor}20`, color: domainColor }}
          >
            {entry.domain}
          </span>

          <span className="text-xs font-semibold text-[#d0d6d6]">
            {entry.label}
          </span>

          {entry.count > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4c7273]/20 text-[#4c7273] font-mono tabular-nums">
              ×{entry.count}
            </span>
          )}

          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${STATUS_BADGE[status]}`}>
            {status}
          </span>
        </div>

        {/* Result text */}
        <p className={`text-xs text-[#8a9aaa] mt-1 leading-relaxed ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
          {entry.result}
        </p>

        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 flex items-center gap-1 text-[10px] text-[#4c7273] hover:text-[#86b9b0] transition-colors cursor-pointer"
          >
            {expanded
              ? <><ChevronUp   className="w-3 h-3" /> Show less</>
              : <><ChevronDown className="w-3 h-3" /> Show more</>}
          </button>
        )}
      </div>

      <time
        dateTime={date.toISOString()}
        className="text-[10px] text-[#4c7273] shrink-0 mt-0.5 tabular-nums"
      >
        {formatDistanceToNow(date, { addSuffix: true })}
      </time>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function ActivityFeed({ cleared = false }: { cleared?: boolean }) {
  const { data: entries = [] } = useQuery({
    queryKey: ['logs', 'today'],
    queryFn: () => fetchLogs(),
    refetchInterval: 30_000,
  });

  const grouped = cleared ? [] : groupConsecutive([...entries].reverse().slice(0, 50));

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <div className="w-8 h-8 rounded-full border border-[#4c7273]/30 flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-[#4c7273]/50" />
        </div>
        <p className="text-sm text-[#4c7273]">No activity recorded today.</p>
      </div>
    );
  }

  return (
    <div className="activity-timeline space-y-0 max-h-[500px] overflow-y-auto pr-2">
      {grouped.map((entry, i) => (
        <TimelineRow
          key={i}
          entry={entry}
          isFirst={i === 0}
          isLast={i === grouped.length - 1}
        />
      ))}
    </div>
  );
}
