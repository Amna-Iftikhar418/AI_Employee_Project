'use client';

import { useState } from 'react';
import {
  MousePointerClick,
  Mail, MessageCircle, Share2, Building2, Globe, CalendarDays, Camera,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTasks, DomainMatrix } from '@/lib/api';

const DOMAINS = [
  { key: 'email',     label: 'Gmail',     icon: <Mail className="w-5 h-5" />,         from: '#ea4335', to: '#fbbc04' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: <MessageCircle className="w-5 h-5" />, from: '#25d366', to: '#128c7e' },
  { key: 'linkedin',  label: 'LinkedIn',  icon: <Share2 className="w-5 h-5" />,        from: '#0a66c2', to: '#004182' },
  { key: 'facebook',  label: 'Facebook',  icon: <Share2 className="w-5 h-5" />,        from: '#1877f2', to: '#0a4fc4' },
  { key: 'instagram', label: 'Instagram', icon: <Camera className="w-5 h-5" />,        from: '#e1306c', to: '#833ab4' },
  { key: 'odoo',      label: 'Odoo',      icon: <Building2 className="w-5 h-5" />,     from: '#714b67', to: '#a855f7' },
  { key: 'browser',   label: 'Browser',   icon: <Globe className="w-5 h-5" />,         from: '#f97316', to: '#ef4444' },
  { key: 'scheduler', label: 'Scheduler', icon: <CalendarDays className="w-5 h-5" />,  from: '#8b5cf6', to: '#6366f1' },
] as const;

function totalTasks(matrix: DomainMatrix[], domain: string) {
  const row = matrix.find((d) => d.domain === domain);
  if (!row) return 0;
  return Object.values(row.stages).reduce((s, v) => s + v.count, 0);
}
function pendingCount(matrix: DomainMatrix[], domain: string) {
  const row = matrix.find((d) => d.domain === domain);
  return (row?.stages['Pending_Approval']?.count ?? 0) + (row?.stages['Needs_Action']?.count ?? 0);
}

const DECK_TOP = 0;
const CARD_H   = 140;

export default function TaskCountsCarousel() {
  const { data: matrix = [] } = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks, refetchInterval: 30_000 });
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [contentKey, setContentKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const handleClick = () => {
    if (busy) return;
    setBusy(true);
    setContentKey((k) => k + 1);
    setCurrentIndex((prev) => (prev >= DOMAINS.length - 1 ? -1 : prev + 1));
    setTimeout(() => setBusy(false), 240);
  };

  const domain  = currentIndex >= 0 ? DOMAINS[currentIndex] : null;
  const total   = domain ? totalTasks(matrix, domain.key) : 0;
  const pending = domain ? pendingCount(matrix, domain.key) : 0;

  return (
    <div className="flex flex-col items-center select-none pt-6">
      {/* ── Deck — stack never moves, only top card content fades ── */}
      <div
        className="relative cursor-pointer"
        style={{ width: 320, height: DECK_TOP + CARD_H }}
        onClick={handleClick}
        role="button"
        aria-label="Task count deck — click to cycle domains"
      >
        {/* Back card 3 */}
        <div
          className="absolute rounded-2xl bg-[#042630] border border-[#4c7273]/18 overflow-hidden"
          style={{ top: DECK_TOP, left: 22, right: 22, height: CARD_H, zIndex: 1,
            transform: 'rotate(-9deg) translateX(-8px) translateY(4px)' }}
        >
          <div className="h-[3px] rounded-t-2xl bg-[#8b5cf6]/28" />
          <div className="p-4 mt-2 space-y-2">
            {[65, 48, 38, 56].map((w, i) => (
              <div key={i} className="h-1.5 rounded bg-[#4c7273]/12" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>

        {/* Back card 2 */}
        <div
          className="absolute rounded-2xl bg-[#042630] border border-[#4c7273]/28 overflow-hidden"
          style={{ top: DECK_TOP, left: 11, right: 11, height: CARD_H, zIndex: 2,
            transform: 'rotate(-4deg) translateX(-3px) translateY(2px)' }}
        >
          <div className="h-[3px] rounded-t-2xl bg-[#86b9b0]/20" />
          <div className="p-4 mt-2 space-y-2">
            {[60, 45, 35, 52].map((w, i) => (
              <div key={i} className="h-1.5 rounded bg-[#4c7273]/18" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>

        {/* Top card — NEVER moves, content fades on click */}
        <div
          className="absolute rounded-2xl overflow-hidden"
          style={{
            top: DECK_TOP, left: 0, right: 0, height: CARD_H,
            zIndex: 10,
            background: '#042630',
            border: `1px solid ${domain ? 'rgba(134,185,176,0.45)' : 'rgba(76,114,115,0.50)'}`,
            boxShadow: domain
              ? '0 0 28px rgba(134,185,176,0.15), 0 4px 18px rgba(0,0,0,0.5)'
              : '0 4px 18px rgba(0,0,0,0.45)',
            transform: 'rotate(2deg)',
            transition: 'border-color 300ms, box-shadow 300ms',
          }}
        >
          {/* Colour bar at top — updates when domain changes */}
          <div
            className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
            style={{
              background: domain
                ? `linear-gradient(to right, ${domain.from}cc, ${domain.to}cc)`
                : 'linear-gradient(to right, rgba(134,185,176,0.38), rgba(76,114,115,0.52), rgba(134,185,176,0.38))',
              transition: 'background 220ms',
            }}
          />

          {/* Content — fades in whenever contentKey changes */}
          <div key={contentKey} className="content-fade-in h-full">
            {!domain ? (
              /* Idle: "Click on me" */
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#041421] border border-[#4c7273]/35">
                  <MousePointerClick
                    className="w-6 h-6 text-[#86b9b0]"
                    style={{ animation: 'wave-float 2.2s ease-in-out infinite' }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-[#d0d6d6] font-bold text-sm tracking-wide">Click on me</p>
                  <p className="text-[#4c7273] text-[10px] mt-0.5">8 domain task cards</p>
                </div>
                <div className="flex gap-1.5">
                  {DOMAINS.map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#4c7273]/40" />
                  ))}
                </div>
              </div>
            ) : (
              /* Active: KPI data */
              <div className="h-full relative flex items-center gap-4 px-5 pb-8">
                {/* Left colour stripe */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-2xl"
                  style={{ background: `linear-gradient(to bottom, ${domain.from}, ${domain.to})` }}
                />
                {/* Icon */}
                <div
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-[#041421] border border-[#4c7273]/30"
                  style={{ marginLeft: 6 }}
                >
                  <span style={{ color: domain.from }}>{domain.icon}</span>
                </div>
                {/* Numbers */}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4c7273]">
                    {domain.label}
                  </p>
                  <p className="text-5xl font-black text-[#d0d6d6] leading-none mt-0.5">{total}</p>
                  <p className="text-xs mt-1.5" style={{ color: pending > 0 ? '#f59e0b' : '#4c7273' }}>
                    {pending > 0 ? `${pending} pending` : 'Up to date'}
                  </p>
                </div>
                {/* Progress dots — inside card, bottom center */}
                <div className="absolute bottom-2.5 left-0 right-0 flex flex-col items-center gap-0.5">
                  <div className="flex gap-1.5">
                    {DOMAINS.map((_, i) => (
                      <div
                        key={i}
                        className={`rounded-full transition-all duration-300 ${
                          i === currentIndex ? 'w-3 h-1.5 bg-[#86b9b0]' : 'w-1.5 h-1.5 bg-[#4c7273]/35'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[9px] text-[#4c7273]">
                    {currentIndex + 1} / {DOMAINS.length} · click for next
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
