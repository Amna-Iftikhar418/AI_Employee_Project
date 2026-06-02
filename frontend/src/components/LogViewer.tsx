'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchLogs, LogEntry, LogStatus } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';

// ── status config ─────────────────────────────────────────────────────────────

const STATUS_ICON: Record<LogStatus, React.ReactNode> = {
  success: <CheckCircle2  className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
  error:   <XCircle       className="w-4 h-4 text-rose-400    shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400   shrink-0 mt-0.5" />,
  info:    <Info          className="w-4 h-4 text-[#86b9b0]   shrink-0 mt-0.5" />,
};

const STATUS_BADGE: Record<LogStatus, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  error:   'bg-rose-500/15    text-rose-400    border-rose-500/25',
  warning: 'bg-amber-500/15   text-amber-400   border-amber-500/25',
  info:    'bg-[#4c7273]/20   text-[#86b9b0]   border-[#4c7273]/25',
};

const FILTER_ACTIVE: Record<LogStatus | 'all', string> = {
  all:     'bg-[#86b9b0]/20 text-[#86b9b0]   border-[#86b9b0]/30',
  success: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40',
  error:   'bg-rose-500/25    text-rose-300    border-rose-500/40',
  warning: 'bg-amber-500/25   text-amber-300   border-amber-500/40',
  info:    'bg-[#4c7273]/30   text-[#a8b8b8]   border-[#4c7273]/40',
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

// ── single entry row ──────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: GroupedEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color  = DOMAIN_COLORS[entry.domain] ?? '#86b9b0';
  const status = entry.status ?? 'info';
  const isLong = entry.result.length > 110;

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 border-b border-[#4c7273]/10 last:border-0 hover:bg-[#042630]/70 transition-colors">
      {/* Status icon */}
      {STATUS_ICON[status]}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Domain chip */}
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {entry.domain}
          </span>

          {/* Human-readable action */}
          <span className="text-xs font-semibold text-[#d0d6d6]">
            {entry.label}
          </span>

          {/* Repeat badge */}
          {entry.count > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4c7273]/20 text-[#4c7273] font-mono tabular-nums">
              ×{entry.count}
            </span>
          )}

          {/* Status badge */}
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
              : <><ChevronDown className="w-3 h-3" /> Show more</>
            }
          </button>
        )}
      </div>

      {/* Time */}
      <time className="text-[10px] text-[#4c7273] shrink-0 mt-0.5 tabular-nums font-mono">
        {entry.time}
      </time>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface LogViewerProps {
  date?: string;
  entries?: LogEntry[];
}

export default function LogViewer({ date, entries: propEntries }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LogStatus | 'all'>('all');

  const isToday = !date || date === new Date().toISOString().slice(0, 10);

  const { data: fetched = [] } = useQuery({
    queryKey: ['logs', date ?? 'today'],
    queryFn: () => fetchLogs(date),
    refetchInterval: isToday ? 10_000 : false,
    enabled: !propEntries,
  });

  const entries = propEntries ?? fetched;
  const grouped = groupConsecutive(entries);

  const counts: Record<LogStatus | 'all', number> = {
    all:     grouped.length,
    error:   grouped.filter((e) => e.status === 'error').length,
    warning: grouped.filter((e) => e.status === 'warning').length,
    success: grouped.filter((e) => e.status === 'success').length,
    info:    grouped.filter((e) => e.status === 'info').length,
  };

  const filtered = grouped.filter((e) => {
    const s = e.status ?? 'info';
    if (statusFilter !== 'all' && s !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.domain.includes(q) ||
      e.label.toLowerCase().includes(q) ||
      e.result.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="flex flex-col rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#041421]">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#4c7273]/20 bg-[#042630] space-y-3">

        {/* Search */}
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-[#4c7273] shrink-0" />
          <input
            type="text"
            placeholder="Filter by domain, action, or keyword…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-[#d0d6d6] placeholder:text-[#4c7273] outline-none"
            aria-label="Search logs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-[#4c7273] hover:text-[#86b9b0] text-xs transition-colors"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'error', 'warning', 'success', 'info'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border transition-colors cursor-pointer capitalize ${
                statusFilter === s
                  ? FILTER_ACTIVE[s]
                  : 'bg-transparent border-[#4c7273]/20 text-[#4c7273] hover:text-[#86b9b0] hover:border-[#4c7273]/40'
              }`}
            >
              {s === 'all' ? 'All' : s} <span className="opacity-70">{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      <div className="overflow-y-auto max-h-[460px]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="w-8 h-8 rounded-full border border-[#4c7273]/30 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-[#4c7273]/50" />
            </div>
            <p className="text-xs text-[#4c7273]">No log entries found.</p>
          </div>
        ) : (
          filtered.map((entry, i) => <EntryRow key={i} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
