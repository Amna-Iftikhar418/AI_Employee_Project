'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mail, CheckCircle2, XCircle, Clock, RefreshCw,
  User, AtSign, Calendar, Tag, FileText, Send,
  ListChecks, ChevronRight,
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

function MetaChip({ icon: Icon, label, value, mono = false }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any; label: string; value: string; mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center bg-[#042630]">
        <Icon className="w-3 h-3 text-[#4c7273]" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-widest text-[#4c7273] font-semibold">{label}</p>
        <p className={cn('text-xs text-[#d0d6d6] break-words', mono && 'font-mono')}>{value}</p>
      </div>
    </div>
  );
}

// ── email body renderer ───────────────────────────────────────────────────────

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

function EmailExpandedPanel({ file }: { file: DomainFile }) {
  const fm = file.frontmatter;
  const body = file.body;

  // Parse metadata from markdown body
  const fromField    = extractInlineField(body, 'From');
  const subjectField = extractInlineField(body, 'Subject');
  const emailBody    = extractSection(body, 'Body');
  const proposed     = extractSection(body, 'Proposed Response');
  const actionsRaw   = extractSection(body, 'Suggested Actions');

  // Fallback to frontmatter
  const sentTo      = fromField   || str(fm.sent_to);
  const subject     = subjectField|| str(fm.sent_subject);
  const created     = str(fm.created);
  const priority    = str(fm.priority) || 'normal';
  const status      = str(fm.status).replace(/_/g, ' ');

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
          <MetaChip icon={User}     label="From"     value={sentTo} />
          <MetaChip icon={AtSign}   label="Subject"  value={subject} />
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
          {status && (
            <MetaChip icon={FileText} label="Status" value={status} />
          )}
        </div>
      </div>

      {/* ── two-column content ── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Original email */}
        {emailBody ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-[#4c7273]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#4c7273]">
                Original Email
              </span>
            </div>
            <div className="flex-1 rounded-xl bg-[#041421] border border-[#4c7273]/20 px-4 py-3 max-h-64 overflow-y-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {emailBody}
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

        {/* Fallback: raw body */}
        {!emailBody && !proposed && (
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

function emailSubtitle(file: DomainFile): string | null {
  const from    = extractInlineField(file.body, 'From') || str(file.frontmatter.sent_to);
  const subject = extractInlineField(file.body, 'Subject') || str(file.frontmatter.sent_subject);
  const parts   = [from && `From: ${from}`, subject && `"${subject}"`].filter(Boolean);
  return parts.join('  ·  ') || null;
}

// ── filter tabs ───────────────────────────────────────────────────────────────

const GMAIL_TABS: CustomTab[] = [
  { key: 'all',          label: 'All',             matchFn: () => true },
  { key: 'needs_action', label: 'Needs Action',     matchFn: (f) => f.stage.toLowerCase() === 'needs_action' },
  { key: 'pending',      label: 'Pending Approval', matchFn: (f) => f.stage.toLowerCase() === 'pending_approval' },
  { key: 'approved',     label: 'Approved',         matchFn: (f) => f.stage.toLowerCase() === 'approved' },
  { key: 'done',         label: 'Done',             matchFn: (f) => f.stage.toLowerCase() === 'done' },
  { key: 'rejected',     label: 'Rejected',         matchFn: (f) => f.stage.toLowerCase() === 'rejected' },
];

// ── KPI helpers ───────────────────────────────────────────────────────────────

function countStage(files: DomainFile[], stage: string) {
  return files.filter((f) => f.stage.toLowerCase() === stage.toLowerCase()).length;
}

function countProcessedToday(files: DomainFile[]) {
  const today = new Date().toDateString();
  return files.filter(
    (f) =>
      (f.stage.toLowerCase() === 'done' || f.stage.toLowerCase() === 'approved') &&
      new Date(f.modifiedAt).toDateString() === today
  ).length;
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function GmailPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['domain', 'email'],
    queryFn: () => fetchDomain('email'),
    refetchInterval: 15_000,
  });

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['domain', 'email'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['pending'] });
  };

  const processedToday = countProcessedToday(files);
  const approved       = countStage(files, 'Approved');
  const rejected       = countStage(files, 'Rejected');
  const pending        = countStage(files, 'Pending_Approval') + countStage(files, 'Needs_Action');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">

      {/* ── page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-red-400" />
            </div>
            Gmail
          </h1>
          <p className="text-sm text-[#4c7273] mt-1 ml-12">
            Incoming emails processed and managed by the AI Employee
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
          title="Processed Today"
          value={processedToday}
          subtitle="all tasks"
          icon={<RefreshCw className="w-5 h-5" />}
          gradientFrom="#6366f1"
          gradientTo="#8b5cf6"
          onClick={() => setActiveTab('all')}
        />
        <KpiCard
          title="Approved"
          value={approved}
          subtitle="click to filter"
          icon={<CheckCircle2 className="w-5 h-5" />}
          gradientFrom="#10b981"
          gradientTo="#059669"
          onClick={() => setActiveTab('approved')}
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
        <KpiCard
          title="Pending"
          value={pending}
          subtitle="needs review"
          icon={<Clock className="w-5 h-5" />}
          gradientFrom="#f59e0b"
          gradientTo="#d97706"
          onClick={() => setActiveTab('pending')}
        />
      </div>

      {/* ── task table ── */}
      {isLoading ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center space-y-2">
          <Mail className="w-8 h-8 text-[#4c7273] mx-auto animate-pulse" />
          <p className="text-sm text-[#4c7273]">Loading email tasks…</p>
        </div>
      ) : (
        <DomainTaskTable
          files={files}
          tabs={GMAIL_TABS}
          renderExpanded={(file) => <EmailExpandedPanel file={file} />}
          onDelete={handleDelete}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          subtitle={emailSubtitle}
          approvable
        />
      )}
    </div>
  );
}
