'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle, Clock, CheckCircle2, XCircle, MessagesSquare,
  User, Calendar, Tag, FileText, Send, ListChecks, ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import KpiCard from '@/components/KpiCard';
import DomainTaskTable, { CustomTab } from '@/components/DomainTaskTable';
import { fetchDomain, DomainFile } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── field extractors ──────────────────────────────────────────────────────────

function extractSection(body: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  return (re.exec(body)?.[1] ?? '').trim();
}

function extractInlineField(body: string, field: string): string {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  return (re.exec(body)?.[1] ?? '').trim();
}

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

// ── priority badge ────────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-300 border-red-500/30',
  high:   'bg-orange-500/15 text-orange-300 border-orange-500/30',
  normal: 'bg-[#4c7273]/20 text-[#86b9b0] border-[#4c7273]/30',
  low:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

function PriorityBadge({ priority }: { priority: string }) {
  const p = (priority || 'normal').toLowerCase();
  return (
    <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border', PRIORITY_STYLE[p] ?? PRIORITY_STYLE.normal)}>
      {p}
    </span>
  );
}

// ── metadata chip ─────────────────────────────────────────────────────────────

function MetaChip({ icon: Icon, label, value }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any; label: string; value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center bg-[#042630]">
        <Icon className="w-3 h-3 text-[#4c7273]" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-widest text-[#4c7273] font-semibold">{label}</p>
        <p className="text-xs text-[#d0d6d6] break-words">{value}</p>
      </div>
    </div>
  );
}

// ── markdown components ───────────────────────────────────────────────────────

const MD_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-[#c8d0d0] mb-2 leading-relaxed last:mb-0">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <span className="text-[#86b9b0] underline underline-offset-2 break-all text-xs">{children ?? href}</span>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside text-sm text-[#c8d0d0] space-y-1 mb-2">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside text-sm text-[#c8d0d0] space-y-1 mb-2">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm text-[#c8d0d0] leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-xs bg-[#041421] px-1.5 py-0.5 rounded text-[#86b9b0]">{children}</code>
  ),
  hr: () => <hr className="border-[#4c7273]/20 my-2" />,
};

// ── expanded panel ────────────────────────────────────────────────────────────

function WhatsAppExpandedPanel({ file }: { file: DomainFile }) {
  const fm   = file.frontmatter;
  const body = file.body;

  const fromField  = extractInlineField(body, 'From');
  const msgBody    = extractSection(body, 'Body');
  const proposed   = extractSection(body, 'Proposed Response');
  const actionsRaw = extractSection(body, 'Suggested Actions');

  const sender   = fromField || str(fm.from ?? fm.sender);
  const created  = str(fm.created);
  const priority = str(fm.priority) || 'normal';
  const status   = str(fm.status).replace(/_/g, ' ');

  const actions = actionsRaw
    .split('\n')
    .map((l) => l.replace(/^-\s*\[.\]\s*/, '').trim())
    .filter(Boolean);

  const formattedDate = created
    ? new Date(created).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div className="space-y-5">

      {/* ── metadata strip ── */}
      <div className="rounded-xl bg-[#042630] border border-[#4c7273]/20 p-4">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <MetaChip icon={User}     label="From"     value={sender} />
          {formattedDate && <MetaChip icon={Calendar} label="Received" value={formattedDate} />}
          <div className="flex items-start gap-2">
            <div className="mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center bg-[#042630]">
              <Tag className="w-3 h-3 text-[#4c7273]" />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-[#4c7273] font-semibold">Priority</p>
              <div className="mt-0.5"><PriorityBadge priority={priority} /></div>
            </div>
          </div>
          {status && <MetaChip icon={FileText} label="Status" value={status} />}
        </div>
      </div>

      {/* ── two-column content ── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Original message — WhatsApp chat-bubble style */}
        {msgBody ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5 text-[#25d366]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#25d366]/70">
                Message{sender ? ` from ${sender}` : ''}
              </span>
            </div>
            <div className="flex-1 rounded-xl bg-[#041421] border border-[#25d366]/20 px-4 py-3 max-h-64 overflow-y-auto">
              {/* sender avatar row */}
              {sender && (
                <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-[#4c7273]/15">
                  <div className="w-6 h-6 rounded-full bg-[#25d366]/20 border border-[#25d366]/30 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-[#25d366]">
                      {sender.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#25d366]/80">{sender}</span>
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {msgBody}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}

        {/* Proposed reply */}
        {proposed ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Send className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                Proposed Reply
              </span>
            </div>
            <div className="flex-1 rounded-xl bg-[#041421] border border-emerald-500/25 px-4 py-3 max-h-64 overflow-y-auto">
              <pre className="font-mono text-xs text-emerald-200/80 whitespace-pre-wrap break-words leading-relaxed">
                {proposed}
              </pre>
            </div>
          </div>
        ) : null}

        {/* Fallback */}
        {!msgBody && !proposed && (
          <div className="lg:col-span-2 rounded-xl bg-[#041421] border border-[#4c7273]/20 px-4 py-3 max-h-64 overflow-y-auto">
            <pre className="font-mono text-xs text-[#86b9b0] whitespace-pre-wrap break-words">
              {body || '(empty)'}
            </pre>
          </div>
        )}
      </div>

      {/* ── checklist ── */}
      {actions.length > 0 && (
        <div className="rounded-xl bg-[#042630] border border-[#4c7273]/20 px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-3.5 h-3.5 text-[#4c7273]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#4c7273]">
              Suggested Actions
            </span>
          </div>
          <ul className="space-y-2">
            {actions.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-[#d0d6d6]">
                <ChevronRight className="w-3.5 h-3.5 text-[#4c7273] shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── row subtitle helper ───────────────────────────────────────────────────────

function whatsappSubtitle(file: DomainFile): string | null {
  const sender = extractInlineField(file.body, 'From') || str(file.frontmatter.from ?? file.frontmatter.sender);
  const preview = extractSection(file.body, 'Body').split('\n')[0]?.trim() ?? '';
  const parts = [sender && `From: ${sender}`, preview && `"${preview}"`].filter(Boolean);
  return parts.join('  ·  ') || null;
}

// ── filter tabs ───────────────────────────────────────────────────────────────

const WHATSAPP_TABS: CustomTab[] = [
  { key: 'all',          label: 'All',             matchFn: () => true },
  { key: 'needs_action', label: 'Needs Action',     matchFn: (f) => f.stage.toLowerCase() === 'needs_action' },
  { key: 'pending',      label: 'Pending Approval', matchFn: (f) => f.stage.toLowerCase() === 'pending_approval' },
  { key: 'done',         label: 'Done',             matchFn: (f) => f.stage.toLowerCase() === 'done' },
  { key: 'rejected',     label: 'Rejected',         matchFn: (f) => f.stage.toLowerCase() === 'rejected' },
];

// ── KPI helpers ───────────────────────────────────────────────────────────────

function countStage(files: DomainFile[], stage: string) {
  return files.filter((f) => f.stage.toLowerCase() === stage.toLowerCase()).length;
}

function countToday(files: DomainFile[]) {
  const today = new Date().toDateString();
  return files.filter((f) => new Date(f.createdAt).toDateString() === today).length;
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['domain', 'whatsapp'],
    queryFn: () => fetchDomain('whatsapp'),
    refetchInterval: 15_000,
  });

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['domain', 'whatsapp'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['pending'] });
  };

  const messagesToday = countToday(files);
  const pending  = countStage(files, 'Pending_Approval') + countStage(files, 'Needs_Action');
  const done     = countStage(files, 'Done');
  const rejected = countStage(files, 'Rejected');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">

      {/* ── page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#25d366]/15 border border-[#25d366]/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-[#25d366]" />
            </div>
            WhatsApp
          </h1>
          <p className="text-sm text-[#4c7273] mt-1 ml-12">
            Incoming WhatsApp messages processed and managed by the AI Employee
          </p>
        </div>

        {/* live indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-emerald-400 font-medium">Live · 15s</span>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          title="Messages Today"
          value={messagesToday}
          subtitle="all messages"
          icon={<MessagesSquare className="w-5 h-5" />}
          gradientFrom="#25d366"
          gradientTo="#128c7e"
          onClick={() => setActiveTab('all')}
        />
        <KpiCard
          title="Pending"
          value={pending}
          subtitle="needs review"
          icon={<Clock className="w-5 h-5" />}
          gradientFrom="#f59e0b"
          gradientTo="#d97706"
          onClick={() => setActiveTab('pending')}
        />
        <KpiCard
          title="Done"
          value={done}
          subtitle="click to filter"
          icon={<CheckCircle2 className="w-5 h-5" />}
          gradientFrom="#10b981"
          gradientTo="#059669"
          onClick={() => setActiveTab('done')}
        />
        <KpiCard
          title="Rejected"
          value={rejected}
          subtitle="click to filter"
          icon={<XCircle className="w-5 h-5" />}
          gradientFrom="#ef4444"
          gradientTo="#dc2626"
          onClick={() => setActiveTab('rejected')}
        />
      </div>

      {/* ── task table ── */}
      {isLoading ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center space-y-2">
          <MessageCircle className="w-8 h-8 text-[#25d366]/40 mx-auto animate-pulse" />
          <p className="text-sm text-[#4c7273]">Loading WhatsApp tasks…</p>
        </div>
      ) : (
        <DomainTaskTable
          files={files}
          tabs={WHATSAPP_TABS}
          renderExpanded={(file) => <WhatsAppExpandedPanel file={file} />}
          onDelete={handleDelete}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          subtitle={whatsappSubtitle}
          approvable
        />
      )}
    </div>
  );
}
