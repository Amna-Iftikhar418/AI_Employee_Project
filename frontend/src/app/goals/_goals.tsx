'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, RefreshCw, Pencil, Check, X } from 'lucide-react';
import RevenueBar from '@/components/RevenueBar';
import { fetchGoals, saveGoalsRevenue } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── markdown table parser ─────────────────────────────────────────────────────

function parseMarkdownTable(text: string): Array<Record<string, string>> {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && l.endsWith('|'));

  if (lines.length < 3) return [];

  const headers = lines[0]
    .split('|')
    .slice(1, -1)
    .map(h => h.trim());

  // lines[1] is the separator row — skip it
  return lines.slice(2).map(line => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}

/** Split markdown content into named sections keyed by ## heading text */
function extractSections(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let prevKey = '';
  let prevEnd = 0;

  while ((match = re.exec(content)) !== null) {
    if (prevKey) result[prevKey] = content.slice(prevEnd, match.index).trim();
    prevKey = match[1].trim();
    prevEnd = match.index + match[0].length;
  }
  if (prevKey) result[prevKey] = content.slice(prevEnd).trim();
  return result;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function parseMoney(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, '')) || 0;
}

function daysRemaining(dateStr: string): number | null {
  if (!dateStr || dateStr === 'TBD' || dateStr === '—' || dateStr === '-') return null;
  const due = new Date(dateStr + 'T00:00:00');
  if (isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ── badge helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const cls = v.includes('progress') || v.includes('active')
    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    : v.includes('done') || v.includes('complete') || v.includes('on track')
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    : v.includes('plan') || v.includes('upcoming') || v.includes('scheduled')
    ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
    : v.includes('block') || v.includes('fail') || v.includes('at risk')
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
    : v === '—' || v === '-' || v === ''
    ? 'bg-[#4c7273]/10 text-[#4c7273] border-[#4c7273]/20'
    : 'bg-[#4c7273]/20 text-[#d0d6d6] border-[#4c7273]/30';

  return (
    <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded border', cls)}>
      {value || '—'}
    </span>
  );
}

function PriorityBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const cls = v === 'high'
    ? 'text-rose-400'
    : v === 'medium'
    ? 'text-amber-400'
    : v === 'low'
    ? 'text-emerald-400'
    : 'text-[#4c7273]';
  return <span className={cn('text-xs font-semibold', cls)}>{value || '—'}</span>;
}

function DaysChip({ days }: { days: number | null }) {
  if (days === null) return <span className="text-[#4c7273] text-xs">—</span>;
  if (days < 0)
    return <span className="text-xs font-semibold text-rose-400">{Math.abs(days)}d overdue</span>;
  if (days === 0)
    return <span className="text-xs font-semibold text-amber-400">Due today</span>;
  return (
    <span className={cn('text-xs font-semibold', days <= 7 ? 'text-amber-400' : 'text-slate-300')}>
      {days}d
    </span>
  );
}

// ── section card wrapper ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[#4c7273] mb-3">{title}</h2>
      {children}
    </section>
  );
}

// ── revenue targets (editable) ───────────────────────────────────────────────

type EditRow = { period: string; target: string; current: string };

function RevenueTargets({
  rows,
  onSave,
}: {
  rows: Array<Record<string, string>>;
  onSave: (rows: EditRow[]) => Promise<void>;
}) {
  if (rows.length === 0)
    return <p className="text-[#4c7273] text-sm">No revenue data found.</p>;

  const keys = Object.keys(rows[0]);
  const targetKey = keys.find(k => /target/i.test(k)) ?? keys[1] ?? '';
  const currentKey = keys.find(k => /current/i.test(k)) ?? keys[2] ?? '';
  const periodKey = keys[0];

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = () => {
    setEditData(
      rows.map(r => ({
        period: r[periodKey] ?? '',
        target: parseMoney(r[targetKey] ?? '').toString(),
        current: parseMoney(r[currentKey] ?? '').toString(),
      })),
    );
    setError('');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(editData);
      setEditing(false);
    } catch {
      setError('Save failed — check the server.');
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (i: number, field: 'target' | 'current', value: string) => {
    setEditData(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
            {keys.map(k => (
              <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide first:w-28">
                {k}
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide w-48">Progress</th>
            <th className="px-4 py-3 w-24">
              {!editing ? (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-[#4c7273]/40 bg-[#042630] text-[#4c7273] hover:text-[#d0d6d6] hover:border-[#86b9b0]/50 transition-all"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
                  >
                    <Check className="w-3 h-3" /> {saving ? '…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-[#4c7273]/40 text-[#4c7273] hover:text-rose-400 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4c7273]/20">
          {rows.map((row, i) => {
            const ed = editData[i];
            const target = editing ? (parseFloat(ed?.target ?? '0') || 0) : parseMoney(row[targetKey] ?? '');
            const current = editing ? (parseFloat(ed?.current ?? '0') || 0) : parseMoney(row[currentKey] ?? '');

            return (
              <tr key={i} className="hover:bg-[#041421] transition-colors">
                {keys.map(k => (
                  <td key={k} className="px-4 py-3 text-xs text-[#d0d6d6]">
                    {editing && k === targetKey ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[#4c7273]">$</span>
                        <input
                          type="number"
                          min="0"
                          value={ed?.target ?? ''}
                          onChange={e => updateRow(i, 'target', e.target.value)}
                          className="w-24 bg-[#041421] border border-[#4c7273]/50 rounded px-2 py-1 text-xs text-[#d0d6d6] focus:outline-none focus:border-[#86b9b0]"
                        />
                      </div>
                    ) : editing && k === currentKey ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[#4c7273]">$</span>
                        <input
                          type="number"
                          min="0"
                          value={ed?.current ?? ''}
                          onChange={e => updateRow(i, 'current', e.target.value)}
                          className="w-24 bg-[#041421] border border-[#4c7273]/50 rounded px-2 py-1 text-xs text-[#d0d6d6] focus:outline-none focus:border-[#86b9b0]"
                        />
                      </div>
                    ) : (
                      row[k] || '—'
                    )}
                  </td>
                ))}
                <td className="px-4 py-4">
                  <RevenueBar current={current} target={target} label={row[periodKey]} currency="$" />
                </td>
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && (
        <p className="px-4 py-2 text-xs text-rose-400 border-t border-[#4c7273]/20">{error}</p>
      )}
    </div>
  );
}

// ── key metrics (16.3) ────────────────────────────────────────────────────────

function KeyMetrics({ rows }: { rows: Array<Record<string, string>> }) {
  if (rows.length === 0)
    return <p className="text-[#4c7273] text-sm">No metrics found.</p>;

  const keys = Object.keys(rows[0]);
  const statusKey = keys.find(k => /status/i.test(k)) ?? keys[keys.length - 1];

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
            {keys.map(k => (
              <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4c7273]/20">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-[#041421] transition-colors">
              {keys.map(k => (
                <td key={k} className="px-4 py-3 text-xs text-[#d0d6d6]">
                  {k === statusKey
                    ? <StatusBadge value={row[k] ?? ''} />
                    : (row[k] || '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── active projects (16.4) ────────────────────────────────────────────────────

function ActiveProjects({ rows }: { rows: Array<Record<string, string>> }) {
  if (rows.length === 0)
    return <p className="text-[#4c7273] text-sm">No projects found.</p>;

  const keys = Object.keys(rows[0]);
  const statusKey = keys.find(k => /status/i.test(k)) ?? '';
  const dueDateKey = keys.find(k => /due/i.test(k)) ?? '';
  const priorityKey = keys.find(k => /priority/i.test(k)) ?? '';

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
            {keys.map(k => (
              <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
                {k}
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Days Left</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4c7273]/20">
          {rows.map((row, i) => {
            const days = daysRemaining(row[dueDateKey] ?? '');
            const isOverdue = days !== null && days < 0;
            return (
              <tr key={i} className={cn('hover:bg-[#041421] transition-colors', isOverdue && 'bg-rose-500/5')}>
                {keys.map(k => (
                  <td key={k} className="px-4 py-3 text-xs text-[#d0d6d6]">
                    {k === statusKey ? <StatusBadge value={row[k] ?? ''} />
                      : k === priorityKey ? <PriorityBadge value={row[k] ?? ''} />
                      : k === dueDateKey ? (
                        <time dateTime={row[k]} className={cn(isOverdue ? 'text-rose-400' : 'text-[#d0d6d6]')}>
                          {row[k] || '—'}
                        </time>
                      )
                      : (row[k] || '—')}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <DaysChip days={days} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── subscriptions (16.5) ─────────────────────────────────────────────────────

function isFlaggedSub(row: Record<string, string>): boolean {
  const lastActive = (row['Last Active'] ?? '').toLowerCase();
  const notes = (row['Notes'] ?? '').toLowerCase();
  // Flag if inactive, or notes mention unused/inactive
  return (
    (!lastActive.includes('active') && lastActive !== '' && lastActive !== '—') ||
    notes.includes('inact') ||
    notes.includes('unused') ||
    notes.includes('spike')
  );
}

function Subscriptions({ rows }: { rows: Array<Record<string, string>> }) {
  if (rows.length === 0)
    return <p className="text-[#4c7273] text-sm">No subscriptions found.</p>;

  const keys = Object.keys(rows[0]);

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
            {keys.map(k => (
              <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4c7273]/20">
          {rows.map((row, i) => {
            const flagged = isFlaggedSub(row);
            return (
              <tr key={i} className={cn('hover:bg-[#041421] transition-colors', flagged && 'bg-amber-500/10')}>
                {keys.map(k => (
                  <td key={k} className="px-4 py-3 text-xs text-[#d0d6d6]">
                    {row[k] || '—'}
                    {flagged && k === keys[0] && (
                      <span className="ml-2 text-[10px] text-amber-400 font-semibold">⚠ Flagged</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── upcoming deadlines (16.6) ─────────────────────────────────────────────────

function UpcomingDeadlines({ rows }: { rows: Array<Record<string, string>> }) {
  if (rows.length === 0)
    return <p className="text-[#4c7273] text-sm">No deadlines found.</p>;

  const keys = Object.keys(rows[0]);
  const deadlineKey = keys.find(k => /deadline|date/i.test(k)) ?? keys[0];
  const priorityKey = keys.find(k => /priority/i.test(k)) ?? '';

  // Sort ascending by date; rows without dates go last
  const sorted = [...rows].sort((a, b) => {
    const da = daysRemaining(a[deadlineKey] ?? '');
    const db = daysRemaining(b[deadlineKey] ?? '');
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
            {keys.map(k => (
              <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
                {k}
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Days Left</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4c7273]/20">
          {sorted.map((row, i) => {
            const days = daysRemaining(row[deadlineKey] ?? '');
            const isOverdue = days !== null && days < 0;
            return (
              <tr key={i} className={cn('hover:bg-[#041421] transition-colors', isOverdue && 'bg-rose-500/10')}>
                {keys.map(k => (
                  <td key={k} className="px-4 py-3 text-xs">
                    {k === deadlineKey ? (
                      <time
                        dateTime={row[k]}
                        className={cn('font-mono', isOverdue ? 'text-rose-400' : 'text-[#d0d6d6]')}
                      >
                        {row[k] || '—'}
                      </time>
                    ) : k === priorityKey ? (
                      <PriorityBadge value={row[k] ?? ''} />
                    ) : (
                      <span className={isOverdue ? 'text-rose-300' : 'text-[#d0d6d6]'}>
                        {row[k] || '—'}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <DaysChip days={days} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['goals'],
    queryFn: fetchGoals,
    staleTime: 5 * 60_000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['goals'] });
  };

  const handleSaveRevenue = async (rows: EditRow[]) => {
    await saveGoalsRevenue(rows);
    queryClient.invalidateQueries({ queryKey: ['goals'] });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center text-[#4c7273] text-sm">
          Loading business goals…
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-12 text-center">
          <p className="text-rose-400 font-medium">Business_Goals.md not found</p>
          <p className="text-[#4c7273] text-sm mt-1">
            Create <code className="font-mono text-xs">vault/AI_Employee_Vault/Business_Goals.md</code> to populate this page.
          </p>
        </div>
      </div>
    );
  }

  const sections = extractSections(data.content);

  const revenueRows    = parseMarkdownTable(sections['Revenue Targets'] ?? '');
  const metricsRows    = parseMarkdownTable(sections['Key Metrics'] ?? '');
  const projectRows    = parseMarkdownTable(sections['Active Projects'] ?? '');
  const subRows        = parseMarkdownTable(sections['Subscription Audit Rules'] ?? '');
  const deadlineRows   = parseMarkdownTable(sections['Upcoming Deadlines'] ?? '');

  const lastUpdated = String(data.frontmatter?.last_updated ?? '');

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <Target className="w-6 h-6 text-amber-400" />
            Business Goals &amp; Metrics
          </h1>
          <p className="text-sm text-[#4c7273] mt-0.5">
            Amna AI Solutions — read by the weekly audit skill every Monday
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="text-xs text-[#4c7273]">
              Last updated:{' '}
              <time dateTime={lastUpdated} className="text-[#86b9b0] font-mono">
                {lastUpdated}
              </time>
            </div>
          )}
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#4c7273]/30 bg-[#042630] text-[#4c7273] hover:text-[#d0d6d6] hover:bg-[#041421] disabled:opacity-50 transition-all"
            aria-label="Refresh goals data"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Revenue targets */}
      <Section title="Revenue Targets">
        <RevenueTargets rows={revenueRows} onSave={handleSaveRevenue} />
      </Section>

      {/* Key metrics */}
      <Section title="Key Metrics">
        <KeyMetrics rows={metricsRows} />
      </Section>

      {/* Active projects */}
      <Section title="Active Projects">
        <ActiveProjects rows={projectRows} />
      </Section>

      {/* Subscriptions */}
      <Section title="Current Subscriptions">
        <Subscriptions rows={subRows} />
      </Section>

      {/* Upcoming deadlines */}
      <Section title="Upcoming Deadlines">
        <UpcomingDeadlines rows={deadlineRows} />
      </Section>
    </div>
  );
}
