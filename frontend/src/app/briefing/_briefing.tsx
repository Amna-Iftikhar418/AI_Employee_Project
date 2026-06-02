'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import BriefingRenderer from '@/components/BriefingRenderer';
import TriggerButton from '@/components/TriggerButton';
import { fetchBriefing, fetchBriefingList } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── revenue MTD parser ────────────────────────────────────────────────────────

interface MtdStatus {
  pct: number | null;
  label: string;
  status: 'on-track' | 'at-risk' | 'unknown';
}

function parseMtdStatus(content: string): MtdStatus {
  // Match "MTD vs. target | 85%" or "MTD vs target | 72%"
  const pctMatch = /MTD\s*vs\.?\s*target[^|]*\|\s*([\d.]+)\s*%/i.exec(content);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    return {
      pct,
      label: `${pct.toFixed(0)}% of target`,
      status: pct >= 70 ? 'on-track' : 'at-risk',
    };
  }
  // Check if Odoo is offline (N/A pattern)
  if (/MTD[^|]*\|\s*N\/A/i.test(content)) {
    return { pct: null, label: 'N/A — Odoo offline', status: 'unknown' };
  }
  return { pct: null, label: 'No revenue data', status: 'unknown' };
}

// ── revenue status banner ─────────────────────────────────────────────────────

function RevenueBanner({ content }: { content: string }) {
  const mtd = parseMtdStatus(content);

  const config = {
    'on-track': {
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      text: 'text-emerald-300',
      icon: <TrendingUp className="w-4 h-4" />,
      heading: 'Revenue on track',
    },
    'at-risk': {
      bg: 'bg-rose-500/10 border-rose-500/20',
      text: 'text-rose-300',
      icon: <TrendingDown className="w-4 h-4" />,
      heading: 'Revenue below 70% of target',
    },
    unknown: {
      bg: 'bg-[#4c7273]/10 border-[#4c7273]/20',
      text: 'text-[#4c7273]',
      icon: <Minus className="w-4 h-4" />,
      heading: 'Revenue data unavailable',
    },
  }[mtd.status];

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm', config.bg)}>
      <span className={config.text}>{config.icon}</span>
      <div>
        <span className={cn('font-semibold', config.text)}>{config.heading}</span>
        <span className="text-slate-500 ml-2 text-xs">{mtd.label}</span>
      </div>
      {mtd.pct !== null && (
        <div className="ml-auto flex items-center gap-2">
          <div className="w-24 h-1.5 rounded-full bg-[#041421] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                mtd.status === 'on-track' ? 'bg-emerald-500' : 'bg-rose-500'
              )}
              style={{ width: `${Math.min(100, mtd.pct)}%` }}
            />
          </div>
          <span className={cn('text-xs font-bold tabular-nums', config.text)}>
            {mtd.pct.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── date selector ─────────────────────────────────────────────────────────────

interface DateSelectorProps {
  selected: string;
  onChange: (date: string) => void;
}

function DateSelector({ selected, onChange }: DateSelectorProps) {
  const { data } = useQuery({
    queryKey: ['briefing-list'],
    queryFn: fetchBriefingList,
    staleTime: 60_000,
  });

  const dates = data?.dates ?? [];

  if (dates.length <= 1) return null;

  return (
    <div className="relative inline-flex items-center">
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-[#4c7273]/30 bg-[#042630] text-sm text-[#d0d6d6] focus:outline-none focus:border-[#86b9b0]/50 transition-colors cursor-pointer"
        aria-label="Select briefing date"
      >
        {dates.map((item) => (
          <option key={item.date} value={item.date} className="bg-slate-900">
            {item.date}
            {item.date === dates[0]?.date ? ' (latest)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BriefingPage() {
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  const { data: briefing, isLoading, isError } = useQuery({
    queryKey: ['briefing', selectedDate ?? 'latest'],
    queryFn: () => fetchBriefing(selectedDate),
  });

  // Once the latest briefing loads, seed the date selector with its date
  const displayDate = selectedDate ?? briefing?.date;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <FileText className="w-6 h-6 text-violet-400" />
            CEO Briefing
          </h1>
          <p className="text-sm text-[#4c7273] mt-0.5">
            Monday morning summary generated by the weekly audit skill
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {displayDate && (
            <DateSelector
              selected={displayDate}
              onChange={setSelectedDate}
            />
          )}
          <TriggerButton
            action="briefing"
            label="Generate Now"
            icon={<Plus className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center text-[#4c7273] text-sm">
          Loading briefing…
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-12 text-center">
          <p className="text-rose-400 font-medium">No briefing found</p>
          <p className="text-[#4c7273] text-sm mt-1">
            Use &quot;Generate Now&quot; to create a CEO briefing.
          </p>
        </div>
      )}

      {briefing && !isLoading && (
        <>
          {/* Revenue status banner (14.5) */}
          <RevenueBanner content={briefing.content} />

          {/* Briefing date chip */}
          <div className="flex items-center gap-2 text-xs text-[#4c7273]">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <time dateTime={briefing.date}>
              {new Date(briefing.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
            <span className="text-slate-700">·</span>
            <span className="font-mono">{briefing.filename}</span>
          </div>

          {/* Rendered briefing */}
          <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-6">
            <BriefingRenderer content={briefing.content} />
          </div>
        </>
      )}
    </div>
  );
}
