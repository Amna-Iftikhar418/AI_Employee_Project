'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Terminal, RefreshCw, CalendarDays, Download } from 'lucide-react';
import LogViewer from '@/components/LogViewer';
import { fetchLogs, LogEntry } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

// ── export helpers ────────────────────────────────────────────────────────────

function exportCSV(entries: LogEntry[], date: string): void {
  const header = 'time,domain,action,result';
  const rows = entries.map(
    (e) =>
      [e.time, e.domain, e.action, e.result]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
  );
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  triggerDownload(blob, `logs_${date}.csv`);
}

function exportJSON(entries: LogEntry[], date: string): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `logs_${date}.json`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── domain filter config ──────────────────────────────────────────────────────

interface DomainChip {
  key: string;
  label: string;
  matchDomains?: string[];
  isError?: boolean;
}

const CHIPS: DomainChip[] = [
  { key: 'all',       label: 'All' },
  { key: 'gmail',     label: 'Gmail',     matchDomains: ['email', 'gmail'] },
  { key: 'whatsapp',  label: 'WhatsApp',  matchDomains: ['whatsapp'] },
  { key: 'linkedin',  label: 'LinkedIn',  matchDomains: ['linkedin'] },
  { key: 'odoo',      label: 'Odoo',      matchDomains: ['odoo'] },
  { key: 'social',    label: 'Social',    matchDomains: ['social', 'facebook', 'instagram'] },
  { key: 'browser',   label: 'Browser',   matchDomains: ['browser'] },
  { key: 'scheduler', label: 'Scheduler', matchDomains: ['scheduler'] },
  { key: 'error',     label: 'Error',     isError: true },
];

const ERROR_RE = /error|fail|exception/i;

function matchChip(entry: LogEntry, chip: DomainChip): boolean {
  if (chip.key === 'all') return true;
  if (chip.isError) {
    return ERROR_RE.test(entry.action) || ERROR_RE.test(entry.result);
  }
  return (chip.matchDomains ?? []).includes(entry.domain.toLowerCase());
}

function chipColor(key: string): string {
  const colorMap: Record<string, string> = {
    gmail: DOMAIN_COLORS.email,
    whatsapp: DOMAIN_COLORS.whatsapp,
    linkedin: DOMAIN_COLORS.linkedin,
    odoo: DOMAIN_COLORS.odoo,
    social: DOMAIN_COLORS.social,
    browser: DOMAIN_COLORS.browser,
    scheduler: DOMAIN_COLORS.scheduler,
    error: '#ef4444',
  };
  return colorMap[key] ?? '#6366f1';
}

// ── date helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── log stats ─────────────────────────────────────────────────────────────────

function LogStats({ entries }: { entries: LogEntry[] }) {
  const total = entries.length;
  const errors = entries.filter((e) => ERROR_RE.test(e.action) || ERROR_RE.test(e.result)).length;
  const domains = new Set(entries.map((e) => e.domain)).size;

  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <span><strong className="text-slate-300">{total}</strong> entries</span>
      <span><strong className="text-slate-300">{domains}</strong> domains</span>
      {errors > 0 && (
        <span className="text-rose-400">
          <strong>{errors}</strong> error{errors !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [date, setDate] = useState<string>(todayISO);
  const [activeChip, setActiveChip] = useState<string>('all');

  const isToday = date === todayISO();

  const { data: allEntries = [], isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['logs', date],
    queryFn: () => fetchLogs(date),
    refetchInterval: isToday ? 10_000 : false,
  });

  // Apply domain chip filter before passing to LogViewer
  const activeChipDef = CHIPS.find((c) => c.key === activeChip)!;
  const filtered = allEntries.filter((e) => matchChip(e, activeChipDef));

  // Per-chip counts from the full unfiltered set
  function chipCount(chip: DomainChip): number {
    if (chip.key === 'all') return allEntries.length;
    return allEntries.filter((e) => matchChip(e, chip)).length;
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <Terminal className="w-6 h-6 text-[#4c7273]" />
            System Logs
          </h1>
          <p className="text-sm text-[#4c7273] mt-0.5">
            Real-time activity log from all AI Employee domains
          </p>
        </div>

        {/* Date picker + refresh indicator */}
        <div className="flex items-center gap-3">
          {isToday && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <RefreshCw
                className={cn('w-3 h-3', isFetching && 'animate-spin text-slate-400')}
              />
              {lastUpdated && dataUpdatedAt && (
                <time dateTime={new Date(dataUpdatedAt).toISOString()}>
                  Updated {lastUpdated}
                </time>
              )}
            </div>
          )}
          <div className="relative flex items-center">
            <CalendarDays className="absolute left-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => {
                setDate(e.target.value);
                setActiveChip('all');
              }}
              className="pl-8 pr-3 py-2 rounded-lg border border-[#4c7273]/30 bg-[#042630] text-sm text-[#d0d6d6] focus:outline-none focus:border-[#86b9b0]/50 transition-colors [color-scheme:dark]"
              aria-label="Select log date"
            />
          </div>

          {/* Export dropdown */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => exportCSV(filtered, date)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-l-lg border border-[#4c7273]/30 bg-[#042630] text-xs font-medium text-[#4c7273] hover:text-[#d0d6d6] hover:bg-[#042630] transition-all"
                aria-label="Export logs as CSV"
                title="Export as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                onClick={() => exportJSON(filtered, date)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-r-lg border border-l-0 border-[#4c7273]/30 bg-[#042630] text-xs font-medium text-[#4c7273] hover:text-[#d0d6d6] hover:bg-[#042630] transition-all"
                aria-label="Export logs as JSON"
                title="Export as JSON"
              >
                JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Domain filter chips */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter logs by domain"
      >
        {CHIPS.map((chip) => {
          const count = chipCount(chip);
          const isActive = activeChip === chip.key;
          const color = chipColor(chip.key);

          return (
            <button
              key={chip.key}
              onClick={() => setActiveChip(chip.key)}
              aria-pressed={isActive}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                isActive
                  ? 'text-[#d0d6d6] border-transparent'
                  : 'bg-[#042630] border-[#4c7273]/30 text-[#4c7273] hover:text-[#d0d6d6] hover:border-[#4c7273]/50'
              )}
              style={
                isActive
                  ? { backgroundColor: `${color}30`, borderColor: `${color}60`, color }
                  : undefined
              }
            >
              {/* Colored dot */}
              {chip.key !== 'all' && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: isActive ? color : '#475569' }}
                />
              )}
              {chip.label}
              {count > 0 && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1 rounded',
                    isActive ? 'opacity-80' : 'text-[#4c7273]'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stats row */}
      {allEntries.length > 0 && <LogStats entries={allEntries} />}

      {/* Log viewer — takes domain-filtered entries, adds its own search on top */}
      {allEntries.length === 0 && !isFetching ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center">
          <Terminal className="w-8 h-8 text-[#4c7273] mx-auto mb-3" />
          <p className="text-[#4c7273] text-sm">
            No log entries for{' '}
            <time dateTime={date} className="font-mono text-slate-400">
              {date}
            </time>
            .
          </p>
        </div>
      ) : (
        <LogViewer entries={filtered} date={date} />
      )}

      {/* Today live indicator */}
      {isToday && (
        <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live — auto-refreshes every 10 seconds
        </p>
      )}
    </div>
  );
}
