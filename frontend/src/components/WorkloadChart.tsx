'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchTasks, DomainMatrix } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const DOMAIN_SHORT: Record<string, string> = {
  email:     'Gmail',
  whatsapp:  'WA',
  linkedin:  'LinkedIn',
  facebook:  'FB',
  instagram: 'IG',
  odoo:      'Odoo',
  browser:   'Browser',
  scheduler: 'Sched',
};

function transform(matrix: DomainMatrix[]) {
  return matrix.map((d) => ({
    name:          DOMAIN_SHORT[d.domain] ?? d.domain,
    'Needs Action': d.stages['Needs_Action']?.count     ?? 0,
    'Pending':      d.stages['Pending_Approval']?.count ?? 0,
    'Approved':     d.stages['Approved']?.count         ?? 0,
    'Done':         d.stages['Done']?.count             ?? 0,
  }));
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#041421] border border-[#4c7273]/40 rounded-xl p-3 text-xs shadow-xl">
      <p className="font-bold text-[#d0d6d6] mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.fill }} />
          <span className="text-[#4c7273]">{p.name}:</span>
          <span className="font-bold text-[#d0d6d6]">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const LEGEND = [
  { label: 'Needs Action', color: '#f59e0b' },
  { label: 'Pending',      color: '#f97316' },
  { label: 'Approved',     color: '#86b9b0' },
  { label: 'Done',         color: '#10b981' },
];

export default function WorkloadChart() {
  const { data: matrix = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    refetchInterval: 30_000,
  });

  const chartData = transform(matrix);

  return (
    <div className="bg-[#042630] border border-[#4c7273]/20 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#4c7273]">
          Workload Overview
        </span>
        <div className="flex-1 h-px bg-[#4c7273]/20" />
        <span className="text-[10px] text-[#4c7273]/60">live · 30s</span>
      </div>

      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={chartData} barSize={7} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="rgba(76,114,115,0.10)" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#4c7273', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#4c7273', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={22}
            allowDecimals={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(134,185,176,0.05)', radius: 4 }}
          />
          <Bar dataKey="Needs Action" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Pending"      fill="#f97316" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Approved"     fill="#86b9b0" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Done"         fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
        {LEGEND.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2 rounded-sm" style={{ background: color }} />
            <span className="text-[10px] text-[#4c7273]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
