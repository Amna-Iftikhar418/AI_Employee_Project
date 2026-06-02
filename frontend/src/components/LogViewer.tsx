'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { fetchLogs, LogEntry } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';

interface LogViewerProps {
  date?: string;
  entries?: LogEntry[];
}

export default function LogViewer({ date, entries: propEntries }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  const isToday =
    !date || date === new Date().toISOString().slice(0, 10);

  const { data: fetched = [] } = useQuery({
    queryKey: ['logs', date ?? 'today'],
    queryFn: () => fetchLogs(date),
    refetchInterval: isToday ? 10_000 : false,
    enabled: !propEntries,
  });

  const entries = propEntries ?? fetched;

  const filtered = search
    ? entries.filter(
        (e) =>
          e.domain.includes(search.toLowerCase()) ||
          e.action.toLowerCase().includes(search.toLowerCase()) ||
          e.result.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="flex flex-col rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#041421]">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#4c7273]/20 bg-[#042630]">
        <Search className="w-3.5 h-3.5 text-[#4c7273] shrink-0" />
        <input
          type="text"
          placeholder="Filter by domain or keyword…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-xs text-[#d0d6d6] placeholder:text-[#4c7273] outline-none"
          aria-label="Search logs"
        />
      </div>

      {/* Log lines */}
      <div className="overflow-y-auto max-h-96 font-mono text-xs p-3 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-[#4c7273] text-center py-8">No log entries found.</p>
        )}
        {filtered.map((entry, i) => {
          const color = DOMAIN_COLORS[entry.domain] ?? '#6b7280';
          return (
            <div key={i} className="flex gap-2 items-start leading-relaxed">
              <span className="text-[#4c7273] shrink-0">{entry.time}</span>
              <span
                className="shrink-0 uppercase text-[10px] font-semibold"
                style={{ color }}
              >
                [{entry.domain}]
              </span>
              <span className="text-[#4c7273]">
                <span className="text-[#d0d6d6]">{entry.action}:</span> {entry.result}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
