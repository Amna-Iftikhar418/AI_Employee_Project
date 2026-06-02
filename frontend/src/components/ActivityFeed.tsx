'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { fetchLogs } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';

function entryDate(time: string): Date {
  const today = new Date();
  const [h, m, s] = time.split(':').map(Number);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, s);
}

export default function ActivityFeed() {
  const { data: entries = [] } = useQuery({
    queryKey: ['logs', 'today'],
    queryFn: () => fetchLogs(),
    refetchInterval: 30_000,
  });

  const recent = [...entries].reverse().slice(0, 50);

  if (recent.length === 0) {
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
      {recent.map((entry, i) => {
        const color = DOMAIN_COLORS[entry.domain] ?? '#86b9b0';
        const date = entryDate(entry.time);
        return (
          <div
            key={i}
            className="relative flex items-start gap-4 py-2.5 pl-8 pr-2 hover:bg-[#042630] rounded-xl transition-colors"
          >
            {/* Timeline node */}
            <div className="absolute left-0 top-3 w-4 h-4 rounded-full border-2 border-[#4c7273] bg-[#041421] flex items-center justify-center shrink-0">
              <span
                className={`w-1.5 h-1.5 rounded-full${i === 0 ? ' pulse-accent' : ''}`}
                style={{ backgroundColor: color }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  {entry.domain}
                </span>
                <span className="text-xs font-medium text-[#d0d6d6]">{entry.action}</span>
              </div>
              <p className="text-xs text-[#4c7273] mt-0.5 truncate">{entry.result}</p>
            </div>

            <time
              dateTime={date.toISOString()}
              className="text-[10px] text-[#4c7273] shrink-0 mt-0.5"
            >
              {formatDistanceToNow(date, { addSuffix: true })}
            </time>
          </div>
        );
      })}
    </div>
  );
}
