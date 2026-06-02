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
    <aside className="w-64 shrink-0 flex flex-col h-full bg-[#042630] border-r border-[#4c7273]/30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-[#4c7273]/20">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4c7273] to-[#86b9b0] flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(134,185,176,0.3)]">
          <Bot className="w-4 h-4 text-[#041421]" />
        </div>
        <div>
          <span className="text-sm font-bold bg-gradient-to-r from-[#86b9b0] to-[#d0d6d6] bg-clip-text text-transparent">
            AI Employee
          </span>
          <p className="text-[10px] text-[#4c7273] leading-none mt-0.5">Automation Hub</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {NAV_LINKS.map(({ href, label, icon: Icon, color, countKey }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            const badge = getBadge(countKey);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-[#86b9b0]/12 text-[#86b9b0] border-l-2 border-[#86b9b0]'
                      : 'text-[#4c7273] hover:bg-[#042630] hover:text-[#d0d6d6] border-l-2 border-transparent'
                  )}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? color : undefined }} />
                  <span className="flex-1">{label}</span>
                  {countKey && badge > 0 && (
                    <span
                      className="ml-auto min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center border"
                      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}55` }}
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
      <div className="px-5 py-4 border-t border-[#4c7273]/20">
        <p className="text-[10px] text-[#4c7273]">Claude Code · AI Employee v1</p>
      </div>
    </aside>
  );
}
