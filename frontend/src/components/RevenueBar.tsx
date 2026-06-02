'use client';

import { useEffect, useState } from 'react';

interface RevenueBarProps {
  current: number;
  target: number;
  label?: string;
  currency?: string;
}

export default function RevenueBar({ current, target, label, currency = 'PKR' }: RevenueBarProps) {
  const [width, setWidth] = useState(0);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `${(n / 1_000).toFixed(0)}K`
      : String(n);

  return (
    <div className="w-full">
      {label && <p className="text-xs text-[#4c7273] mb-1.5">{label}</p>}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative h-3 rounded-full bg-[#041421] border border-[#4c7273]/20 overflow-hidden">
          {/* Milestone ticks */}
          {[25, 50, 75].map((tick) => (
            <div
              key={tick}
              className="absolute top-0 bottom-0 w-px bg-[#4c7273]/30 z-10"
              style={{ left: `${tick}%` }}
            />
          ))}
          {/* Fill bar */}
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#4c7273] via-[#86b9b0] to-[#d0d6d6] transition-[width] duration-700 ease-out"
            style={{
              width: `${width}%`,
              boxShadow: '0 0 12px rgba(134, 185, 176, 0.5)',
            }}
          />
        </div>
        <span className="text-sm font-bold text-[#86b9b0] shrink-0">{pct}%</span>
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-xs text-[#4c7273]">
          {currency} {fmt(current)}
        </span>
        <span className="text-xs text-[#4c7273]">
          {currency} {fmt(target)}
        </span>
      </div>
    </div>
  );
}
