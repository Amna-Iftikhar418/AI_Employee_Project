'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import DomainTaskTable, { CustomTab } from '@/components/DomainTaskTable';
import { fetchDomain, DomainFile } from '@/lib/api';

// ── email-specific expanded panel ─────────────────────────────────────────────

function extractSection(body: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  return (re.exec(body)?.[1] ?? '').trim();
}

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function EmailExpandedPanel({ file }: { file: DomainFile }) {
  const fm = file.frontmatter;
  const emailBody = extractSection(file.body, 'Body');
  const proposed = extractSection(file.body, 'Proposed Response');
  const sentTo = str(fm.sent_to);
  const subject = str(fm.sent_subject);
  const created = str(fm.created);
  const status = str(fm.status);

  return (
    <div className="space-y-4">
      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {sentTo && (
          <span><span className="text-slate-500">To:</span> <span className="text-slate-300">{sentTo}</span></span>
        )}
        {subject && (
          <span><span className="text-slate-500">Subject:</span> <span className="text-slate-300">{subject}</span></span>
        )}
        {created && (
          <span>
            <span className="text-slate-500">Received:</span>{' '}
            <time dateTime={created} className="text-slate-300">
              {new Date(created).toLocaleString()}
            </time>
          </span>
        )}
        {status && (
          <span><span className="text-slate-500">Status:</span> <span className="text-slate-300">{status}</span></span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Original email body */}
        {emailBody && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Original Email</p>
            <div className="bg-[#041421] rounded-lg p-3 border border-[#4c7273]/20 max-h-48 overflow-y-auto">
              <pre className="font-mono text-xs text-[#4c7273] whitespace-pre-wrap break-words">{emailBody}</pre>
            </div>
          </div>
        )}

        {/* Proposed reply */}
        {proposed && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 mb-1.5">Proposed Reply</p>
            <div className="bg-[#041421] rounded-lg p-3 border border-emerald-500/20 max-h-48 overflow-y-auto">
              <pre className="font-mono text-xs text-emerald-300/80 whitespace-pre-wrap break-words">{proposed}</pre>
            </div>
          </div>
        )}

        {/* Fallback: raw body if no sections found */}
        {!emailBody && !proposed && (
          <div className="sm:col-span-2">
            <pre className="font-mono text-xs text-slate-400 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
              {file.body || '(empty)'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── filter tabs ───────────────────────────────────────────────────────────────

const GMAIL_TABS: CustomTab[] = [
  { key: 'all', label: 'All', matchFn: () => true },
  { key: 'needs_action', label: 'Needs Action', matchFn: (f) => f.stage.toLowerCase() === 'needs_action' },
  { key: 'pending', label: 'Pending Approval', matchFn: (f) => f.stage.toLowerCase() === 'pending_approval' },
  { key: 'approved', label: 'Approved', matchFn: (f) => f.stage.toLowerCase() === 'approved' },
  { key: 'done', label: 'Done', matchFn: (f) => f.stage.toLowerCase() === 'done' },
  { key: 'rejected', label: 'Rejected', matchFn: (f) => f.stage.toLowerCase() === 'rejected' },
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

// ── page component ────────────────────────────────────────────────────────────

export default function GmailPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['domain', 'email'],
    queryFn: () => fetchDomain('email'),
  });

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['domain', 'email'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['pending'] });
  };

  const processedToday = countProcessedToday(files);
  const approved = countStage(files, 'Approved');
  const rejected = countStage(files, 'Rejected');
  const pending =
    countStage(files, 'Pending_Approval') + countStage(files, 'Needs_Action');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
          <Mail className="w-6 h-6 text-red-400" />
          Gmail — Email Tasks
        </h1>
        <p className="text-sm text-[#4c7273] mt-0.5">Incoming emails processed by the AI Employee</p>
      </div>

      {/* KPI strip — clicking filters the table below */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          title="Processed Today"
          value={processedToday}
          subtitle="click to show all"
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
          subtitle="click to filter"
          icon={<Clock className="w-5 h-5" />}
          gradientFrom="#f59e0b"
          gradientTo="#d97706"
          onClick={() => setActiveTab('pending')}
        />
      </div>

      {/* Task table */}
      {isLoading ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center text-[#4c7273] text-sm">
          Loading email tasks…
        </div>
      ) : (
        <DomainTaskTable
          files={files}
          tabs={GMAIL_TABS}
          renderExpanded={(file) => <EmailExpandedPanel file={file} />}
          onDelete={handleDelete}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          approvable
        />
      )}
    </div>
  );
}
