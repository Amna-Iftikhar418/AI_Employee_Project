'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Clock,
  Mail,
  MessageCircle,
  Share2,
  Building2,
  Globe,
  CalendarDays,
  FileText,
  Terminal,
  Target,
  Bot,
} from 'lucide-react';
import { fetchPending, fetchTasks, DomainMatrix } from '@/lib/api';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, color: '#86b9b0' },
  { href: '/pending', label: 'Pending', icon: Clock, color: '#f59e0b', countKey: 'pending' },
  { href: '/gmail', label: 'Gmail', icon: Mail, color: '#ea4335', countKey: 'email' },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, color: '#25d366', countKey: 'whatsapp' },
  { href: '/linkedin', label: 'LinkedIn', icon: Share2, color: '#0a66c2', countKey: 'linkedin' },
  { href: '/social', label: 'Social', icon: Share2, color: '#e1306c', countKey: 'social' },
  { href: '/odoo', label: 'Odoo', icon: Building2, color: '#714b67', countKey: 'odoo' },
  { href: '/browser', label: 'Browser', icon: Globe, color: '#f97316', countKey: 'browser' },
  { href: '/scheduler', label: 'Scheduler', icon: CalendarDays, color: '#8b5cf6' },
  { href: '/briefing', label: 'Briefing', icon: FileText, color: '#10b981' },
  { href: '/logs', label: 'Logs', icon: Terminal, color: '#64748b' },
  { href: '/goals', label: 'Goals', icon: Target, color: '#f59e0b' },
];

function domainPendingCount(matrix: DomainMatrix[], domain: string): number {
  const row = matrix.find((d) => d.domain === domain);
  if (!row) return 0;
  return (row.stages['Pending_Approval']?.count ?? 0) + (row.stages['Needs_Action']?.count ?? 0);
}

export default function Sidebar() {
  const pathname = usePathname();

  const { data: pending } = useQuery({
    queryKey: ['pending'],
    queryFn: fetchPending,
    refetchInterval: 15_000,
  });

  const { data: matrix = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    refetchInterval: 30_000,
  });

  const pendingCount = pending?.length ?? 0;

  function getBadge(countKey?: string): number {
    if (!countKey) return 0;
    if (countKey === 'pending') return pendingCount;
    return domainPendingCount(matrix, countKey);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');

        .sidebar-root {
          font-family: 'DM Sans', sans-serif;
        }

        .sidebar-bg {
          background:
            radial-gradient(ellipse 120% 60% at 50% 0%, rgba(70,140,130,0.13) 0%, transparent 70%),
            radial-gradient(ellipse 80% 40% at 80% 100%, rgba(76,114,115,0.10) 0%, transparent 60%),
            linear-gradient(175deg, #010f16 0%, #021820 18%, #031f28 40%, #042630 65%, #032030 100%);
        }

        .sidebar-noise::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          background-size: 180px 180px;
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }

        .sidebar-border-r {
          border-right: 1px solid transparent;
          border-image: linear-gradient(180deg, rgba(134,185,176,0.18) 0%, rgba(76,114,115,0.12) 50%, rgba(76,114,115,0.04) 100%) 1;
        }

        /* Logo area */
        .logo-glow {
          box-shadow: 0 0 0 1px rgba(134,185,176,0.15);
        }

        .logo-section {
          border-bottom: 1px solid transparent;
          border-image: linear-gradient(90deg, transparent, rgba(134,185,176,0.18) 40%, rgba(76,114,115,0.10) 70%, transparent) 1;
        }

        /* Nav link base */
        .nav-link {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.01em;
          color: rgba(134,185,176,0.55);
          transition: color 0.2s ease, background 0.2s ease, transform 0.15s ease;
          overflow: hidden;
          text-decoration: none;
        }

        .nav-link::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 10px;
          background: linear-gradient(90deg, rgba(134,185,176,0.07) 0%, transparent 100%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .nav-link:hover {
          color: rgba(208,214,214,0.9);
          transform: translateX(2px);
        }

        .nav-link:hover::before {
          opacity: 1;
        }

        /* Active state */
        .nav-link-active {
          color: #c4ddd9 !important;
          background:
            linear-gradient(90deg, rgba(134,185,176,0.16) 0%, rgba(134,185,176,0.04) 80%, transparent 100%);
          transform: none !important;
          box-shadow:
            inset 0 0 0 1px rgba(134,185,176,0.12),
            0 2px 12px rgba(134,185,176,0.08);
        }

        .nav-link-active::before {
          opacity: 0 !important;
        }

        /* Active left bar */
        .nav-link-active::after {
          content: '';
          position: absolute;
          left: 0;
          top: 20%;
          bottom: 20%;
          width: 2.5px;
          border-radius: 0 2px 2px 0;
          background: linear-gradient(180deg, #86b9b0 0%, #4c7273 100%);
        }

        /* Icon active state */
        .nav-icon-active {
          filter: none;
        }

        /* Badge */
        .nav-badge {
          font-family: 'Space Mono', monospace;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.02em;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid;
          backdrop-filter: blur(4px);
          transition: box-shadow 0.2s ease;
        }

        .nav-link:hover .nav-badge,
        .nav-link-active .nav-badge {
          box-shadow: none;
        }

        /* Section divider */
        .nav-divider {
          height: 1px;
          margin: 6px 8px;
          background: linear-gradient(90deg, transparent, rgba(76,114,115,0.25) 40%, rgba(76,114,115,0.12) 70%, transparent);
        }

        /* Dot accent */
        .nav-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          shrink: 0;
          transition: box-shadow 0.2s ease;
        }

        .nav-link-active .nav-dot,
        .nav-link:hover .nav-dot {
          box-shadow: none;
        }

        /* Footer */
        .sidebar-footer {
          border-top: 1px solid transparent;
          border-image: linear-gradient(90deg, transparent, rgba(76,114,115,0.20) 40%, rgba(76,114,115,0.08) 70%, transparent) 1;
        }

        .footer-mono {
          font-family: 'Space Mono', monospace;
          font-size: 9px;
          color: rgba(76,114,115,0.55);
          letter-spacing: 0.06em;
        }

        /* Scrollbar */
        .nav-scroll::-webkit-scrollbar { width: 3px; }
        .nav-scroll::-webkit-scrollbar-track { background: transparent; }
        .nav-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(134,185,176,0.3), rgba(76,114,115,0.15));
          border-radius: 99px;
        }

        /* Status dot pulse */
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .status-pulse {
          animation: pulse-dot 2.5s ease-in-out infinite;
        }
      `}</style>

      <aside className="sidebar-root sidebar-bg sidebar-noise sidebar-border-r w-64 shrink-0 flex flex-col h-full relative overflow-hidden">

        {/* Logo */}
        <div className="logo-section relative z-10 flex items-center gap-3 px-5 py-[22px]">
          <div
            className="logo-glow w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #4c7273 0%, #86b9b0 50%, #a8cec9 100%)',
            }}
          >
            <Bot className="w-[18px] h-[18px] text-[#010f16]" strokeWidth={2.2} />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="text-[13px] font-semibold tracking-wide"
              style={{
                background: 'linear-gradient(90deg, #c4ddd9 0%, #86b9b0 50%, #d0d6d6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              AI Employee
            </span>
            <div className="flex items-center gap-1.5">
              <span className="status-pulse w-1.5 h-1.5 rounded-full bg-[#10b981] inline-block" />
              <span
                className="text-[10px] font-medium tracking-widest uppercase"
                style={{ color: 'rgba(76,114,115,0.7)', fontFamily: "'Space Mono', monospace" }}
              >
                Online
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="nav-scroll flex-1 overflow-y-auto py-3 px-2.5 relative z-10" aria-label="Main navigation">
          <ul className="space-y-0.5">
            {NAV_LINKS.map(({ href, label, icon: Icon, color, countKey }, i) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              const badge = getBadge(countKey);

              const showDivider = i === 0 || i === 4 || i === 8 || i === 10;

              return (
                <li key={href}>
                  {showDivider && i !== 0 && <div className="nav-divider" />}
                  <Link
                    href={href}
                    className={cn('nav-link', isActive && 'nav-link-active')}
                  >
                    {/* Color dot */}
                    <span
                      className="nav-dot shrink-0"
                      style={{ backgroundColor: color, color }}
                    />

                    {/* Icon */}
                    <span
                      className={cn('shrink-0', isActive && 'nav-icon-active')}
                      style={{ color: isActive ? color : undefined }}
                    >
                      <Icon className="w-[15px] h-[15px]" strokeWidth={isActive ? 2 : 1.75} />
                    </span>

                    {/* Label */}
                    <span className="flex-1 truncate">{label}</span>

                    {/* Badge */}
                    {countKey && badge > 0 && (
                      <span
                        className="nav-badge ml-auto shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${color}28 0%, ${color}14 100%)`,
                          color,
                          borderColor: `${color}45`,
                        }}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer relative z-10 px-5 py-3.5 flex items-center justify-between">
          <p className="footer-mono">Claude Code · v1</p>
          <div className="flex items-center gap-1">
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: 'linear-gradient(135deg, #86b9b0, #4c7273)' }}
            />
            <span
              className="w-1 h-1 rounded-full opacity-50"
              style={{ background: '#4c7273' }}
            />
            <span
              className="w-1 h-1 rounded-full opacity-25"
              style={{ background: '#4c7273' }}
            />
          </div>
        </div>

      </aside>
    </>
  );
}
