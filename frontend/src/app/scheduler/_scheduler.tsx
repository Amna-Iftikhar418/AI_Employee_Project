'use client';

import { useState, useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';
import { CalendarDays, Share2, FileText, Trash2, Clock, X } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import TriggerButton from '@/components/TriggerButton';
import { fetchLogs, LogEntry } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

// ── persisted disabled jobs ───────────────────────────────────────────────────

const LS_KEY = 'scheduler_disabled_jobs';
const LS_HISTORY_CLEARED = 'scheduler_history_cleared_date';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadHistoryCleared(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LS_HISTORY_CLEARED) === todayStr();
  } catch {
    return false;
  }
}

function saveHistoryCleared(): void {
  localStorage.setItem(LS_HISTORY_CLEARED, todayStr());
}


function loadDisabled(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveDisabled(set: Set<string>): void {
  localStorage.setItem(LS_KEY, JSON.stringify([...set]));
}

// ── job definitions ───────────────────────────────────────────────────────────

interface Job {
  name: string;
  schedule: string;
  cron: string;
  action: string;
  icon: React.ReactNode;
  color: string;
  triggerLabel: string;
  /** 0–6, Sunday=0; undefined = daily */
  dayOfWeek?: number;
  hour: number;
  minute: number;
}

const JOBS: Job[] = [
  {
    name: 'LinkedIn Post',
    schedule: 'Daily 09:00',
    cron: '0 9 * * *',
    action: 'linkedin',
    icon: <Share2 className="w-4 h-4" />,
    color: '#0a66c2',
    triggerLabel: 'Generate LinkedIn Post Now',
    hour: 9,
    minute: 0,
  },
  {
    name: 'CEO Briefing',
    schedule: 'Every Monday 08:00',
    cron: '0 8 * * 1',
    action: 'briefing',
    icon: <FileText className="w-4 h-4" />,
    color: '#8b5cf6',
    triggerLabel: 'Generate CEO Briefing Now',
    dayOfWeek: 1,
    hour: 8,
    minute: 0,
  },
  {
    name: 'Log Cleanup',
    schedule: 'Every Monday 07:00',
    cron: '0 7 * * 1',
    action: 'cleanup',
    icon: <Trash2 className="w-4 h-4" />,
    color: '#64748b',
    triggerLabel: 'Run Log Cleanup Now',
    dayOfWeek: 1,
    hour: 7,
    minute: 0,
  },
];

// ── schedule math ─────────────────────────────────────────────────────────────

function nextFire(job: Job): Date {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(job.hour, job.minute);

  if (job.dayOfWeek === undefined) {
    // daily
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
  } else {
    // weekly
    const diff = (job.dayOfWeek - now.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (diff === 0 && candidate <= now) candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

function lastRun(job: Job): Date {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(job.hour, job.minute);

  if (job.dayOfWeek === undefined) {
    // daily
    if (candidate > now) candidate.setDate(candidate.getDate() - 1);
  } else {
    // weekly
    const diff = (now.getDay() - job.dayOfWeek + 7) % 7;
    candidate.setDate(candidate.getDate() - diff);
    if (diff === 0 && candidate > now) candidate.setDate(candidate.getDate() - 7);
  }
  return candidate;
}

type JobStatus = 'due-soon' | 'ran-today' | 'scheduled';

function jobStatus(job: Job): JobStatus {
  const now = new Date();
  const next = nextFire(job);
  const last = lastRun(job);
  const msUntilNext = next.getTime() - now.getTime();
  const lastWasToday = last.toDateString() === now.toDateString();
  if (lastWasToday) return 'ran-today';
  if (msUntilNext <= 30 * 60 * 1000) return 'due-soon';
  return 'scheduled';
}

const STATUS_CONFIG = {
  'ran-today': { label: 'Ran today', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  'due-soon': { label: 'Due soon', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400' },
  scheduled: { label: 'Scheduled', dot: 'bg-[#4c7273]', text: 'text-[#4c7273]' },
};

// ── jobs table ────────────────────────────────────────────────────────────────

interface JobsTableProps {
  disabled: Set<string>;
  onToggle: (action: string) => void;
}

function JobsTable({ disabled, onToggle }: JobsTableProps) {
  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
            {['Job Name', 'Schedule', 'Next Fire', 'Last Run', 'Status', 'Enabled'].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4c7273]/20">
          {JOBS.map((job) => {
            const next = nextFire(job);
            const last = lastRun(job);
            const isDisabled = disabled.has(job.action);
            const status = isDisabled ? 'paused' : jobStatus(job);
            const cfg = status === 'paused'
              ? { label: 'Paused', dot: 'bg-slate-600', text: 'text-slate-500' }
              : STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
            return (
              <tr key={job.name} className={cn('hover:bg-[#041421] transition-colors', isDisabled && 'opacity-50')}>
                {/* Job name */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span style={{ color: isDisabled ? '#475569' : job.color }}>{job.icon}</span>
                    <span className="font-medium text-[#d0d6d6]">{job.name}</span>
                  </div>
                </td>

                {/* Schedule */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-[#d0d6d6]">{job.schedule}</span>
                    <span className="text-[10px] font-mono text-[#4c7273]">{job.cron}</span>
                  </div>
                </td>

                {/* Next fire */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <time dateTime={next.toISOString()} className="text-xs text-[#d0d6d6]">
                      {format(next, 'EEE dd MMM, HH:mm')}
                    </time>
                    <span className="text-[10px] text-[#4c7273]">
                      {formatDistanceToNow(next, { addSuffix: true })}
                    </span>
                  </div>
                </td>

                {/* Last run */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <time dateTime={last.toISOString()} className="text-xs text-[#4c7273]">
                      {format(last, 'EEE dd MMM, HH:mm')}
                    </time>
                    <span className="text-[10px] text-[#4c7273]">
                      {formatDistanceToNow(last, { addSuffix: true })}
                    </span>
                  </div>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} aria-hidden />
                    <span className={cn('text-xs font-medium', cfg.text)}>{cfg.label}</span>
                  </div>
                </td>

                {/* Toggle */}
                <td className="px-4 py-3">
                  <button
                    role="switch"
                    aria-checked={!isDisabled}
                    aria-label={`${isDisabled ? 'Enable' : 'Disable'} ${job.name}`}
                    onClick={() => onToggle(job.action)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                      isDisabled ? 'bg-[#4c7273]/50' : 'bg-violet-600'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200',
                        isDisabled ? 'translate-x-0' : 'translate-x-4'
                      )}
                    />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── trigger buttons ───────────────────────────────────────────────────────────

function TriggerRow({ disabled }: { disabled: Set<string> }) {
  return (
    <div className="flex flex-wrap gap-3">
      {JOBS.map((job) => (
        <div key={job.action} className={cn(disabled.has(job.action) && 'opacity-40 pointer-events-none')}>
          <TriggerButton
            action={job.action}
            label={job.triggerLabel}
            icon={<span style={{ color: job.color }}>{job.icon}</span>}
          />
        </div>
      ))}
    </div>
  );
}

// ── scheduler history ─────────────────────────────────────────────────────────

const SCHEDULER_KEYWORDS = ['linkedin', 'briefing', 'cleanup', 'schedule', 'weekly_audit', 'post'];

function isSchedulerEntry(e: LogEntry): boolean {
  if (e.domain === 'scheduler') return true;
  const combined = `${e.action} ${e.result}`.toLowerCase();
  return SCHEDULER_KEYWORDS.some((kw) => combined.includes(kw));
}

function lastNDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

function SchedulerHistory({ cleared = false }: { cleared?: boolean }) {
  const dates = lastNDates(7);

  const results = useQueries({
    queries: dates.map((date) => ({
      queryKey: ['logs', date],
      queryFn: () => fetchLogs(date),
      staleTime: 60_000,
    })),
  });

  const allEntries: Array<LogEntry & { date: string }> = [];
  results.forEach((r, i) => {
    (r.data ?? [])
      .filter(isSchedulerEntry)
      .forEach((e) => allEntries.push({ ...e, date: dates[i] }));
  });

  // Newest first: sort by date desc, then by time desc within same date
  allEntries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.time.localeCompare(a.time);
  });

  const visible = cleared ? [] : allEntries;

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-8 flex flex-col items-center gap-3 text-center">
        <Clock className="w-8 h-8 text-[#4c7273]" />
        <p className="text-[#4c7273] text-sm">No scheduler activity in the last 7 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 max-h-96 overflow-y-auto rounded-xl border border-[#4c7273]/30 bg-[#041421] p-3">
      {visible.map((entry, i) => {
        const color = DOMAIN_COLORS[entry.domain] ?? DOMAIN_COLORS['scheduler'];
        const dt = new Date(`${entry.date}T${entry.time}`);
        return (
          <div
            key={i}
            className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-[#042630] transition-colors"
          >
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  {entry.domain}
                </span>
                <span className="text-xs font-medium text-[#d0d6d6]">{entry.action}</span>
              </div>
              <p className="text-xs text-[#4c7273] mt-0.5 truncate">{entry.result}</p>
            </div>
            <time
              dateTime={dt.toISOString()}
              className="text-[10px] text-[#4c7273] shrink-0 mt-0.5 whitespace-nowrap"
            >
              {entry.date === new Date().toISOString().slice(0, 10)
                ? `Today ${entry.time}`
                : `${entry.date} ${entry.time}`}
            </time>
          </div>
        );
      })}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const [disabledJobs, setDisabledJobs] = useState<Set<string>>(new Set());
  const [historyCleared, setHistoryCleared] = useState(false);

  useEffect(() => {
    setDisabledJobs(loadDisabled());
    setHistoryCleared(loadHistoryCleared());
  }, []);

  const handleClearHistory = () => {
    saveHistoryCleared();
    setHistoryCleared(true);
  };

  const handleToggle = (action: string) => {
    setDisabledJobs((prev) => {
      const next = new Set(prev);
      next.has(action) ? next.delete(action) : next.add(action);
      saveDisabled(next);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
          <CalendarDays className="w-6 h-6 text-violet-400" />
          Scheduler — Automated Jobs
        </h1>
        <p className="text-sm text-[#4c7273] mt-0.5">
          Recurring tasks run automatically by the AI Employee
        </p>
      </div>

      {/* Jobs table */}
      <section aria-label="Scheduled jobs">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#4c7273] mb-3">
          Upcoming Jobs
        </h2>
        <JobsTable disabled={disabledJobs} onToggle={handleToggle} />
      </section>

      {/* Manual trigger buttons */}
      <section aria-label="Manual triggers">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#4c7273] mb-3">
          Manual Triggers
        </h2>
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-4">
          <TriggerRow disabled={disabledJobs} />
        </div>
      </section>

      {/* Scheduler history */}
      <section aria-label="Scheduler history">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#4c7273] shrink-0">
            Activity — Last 7 Days
          </h2>
          <div className="flex-1 h-px bg-[#4c7273]/20" />
          {!historyCleared && (
            <button
              onClick={handleClearHistory}
              aria-label="Clear activity history"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-semibold hover:bg-rose-500/30 hover:border-rose-500/70 transition-colors duration-150 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Clean Up
            </button>
          )}
        </div>
        <SchedulerHistory cleared={historyCleared} />
      </section>
    </div>
  );
}
