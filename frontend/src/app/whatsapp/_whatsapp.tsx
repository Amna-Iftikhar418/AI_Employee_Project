'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Clock, CheckCircle2, XCircle, MessagesSquare } from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import DomainTaskTable, { CustomTab } from '@/components/DomainTaskTable';
import { fetchDomain, DomainFile } from '@/lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function extractSection(body: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  return (re.exec(body)?.[1] ?? '').trim();
}

// ── expanded panel ────────────────────────────────────────────────────────────

function WhatsAppExpandedPanel({ file }: { file: DomainFile }) {
  const fm = file.frontmatter;
  const msgBody = extractSection(file.body, 'Body');
  const proposed = extractSection(file.body, 'Proposed Response');
  const from = str(fm.from ?? fm.sender);
  const created = str(fm.created);
  const status = str(fm.status);
  const priority = str(fm.priority);

  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {from && (
          <span>
            <span className="text-slate-500">From:</span>{' '}
            <span className="text-slate-300">{from}</span>
          </span>
        )}
        {created && (
          <span>
            <span className="text-slate-500">Received:</span>{' '}
            <time dateTime={created} className="text-slate-300">
              {new Date(created).toLocaleString()}
            </time>
          </span>
        )}
        {priority && (
          <span>
            <span className="text-slate-500">Priority:</span>{' '}
            <span className={priority === 'high' ? 'text-amber-400' : 'text-slate-300'}>{priority}</span>
          </span>
        )}
        {status && (
          <span>
            <span className="text-slate-500">Status:</span>{' '}
            <span className="text-slate-300">{status}</span>
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Original message */}
        {msgBody && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Message
            </p>
            <div className="bg-[#041421] rounded-lg p-3 border border-[#4c7273]/20 max-h-48 overflow-y-auto">
              <pre className="font-mono text-xs text-[#4c7273] whitespace-pre-wrap break-words">
                {msgBody}
              </pre>
            </div>
          </div>
        )}

        {/* Proposed reply */}
        {proposed && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1.5">
              Proposed Reply
            </p>
            <div className="bg-[#041421] rounded-lg p-3 border border-emerald-500/20 max-h-48 overflow-y-auto">
              <pre className="font-mono text-xs text-green-300/80 whitespace-pre-wrap break-words">
                {proposed}
              </pre>
            </div>
          </div>
        )}

        {/* Fallback */}
        {!msgBody && !proposed && (
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

const WHATSAPP_TABS: CustomTab[] = [
  { key: 'all', label: 'All', matchFn: () => true },
  {
    key: 'pending',
    label: 'Pending',
    matchFn: (f) => {
      const s = f.stage.toLowerCase();
      return s.includes('pending') || s === 'needs_action';
    },
  },
  { key: 'done', label: 'Done', matchFn: (f) => f.stage.toLowerCase() === 'done' },
  { key: 'rejected', label: 'Rejected', matchFn: (f) => f.stage.toLowerCase() === 'rejected' },
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
  });

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['domain', 'whatsapp'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const messagesToday = countToday(files);
  const pending =
    countStage(files, 'Pending_Approval') + countStage(files, 'Needs_Action');
  const done = countStage(files, 'Done');
  const rejected = countStage(files, 'Rejected');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-green-400" />
          WhatsApp — Message Tasks
        </h1>
        <p className="text-sm text-[#4c7273] mt-0.5">
          Incoming WhatsApp messages processed by the AI Employee
        </p>
      </div>

      {/* KPI strip — clicking filters the table below */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          title="Messages Today"
          value={messagesToday}
          subtitle="click to show all"
          icon={<MessagesSquare className="w-5 h-5" />}
          gradientFrom="#25d366"
          gradientTo="#128c7e"
          onClick={() => setActiveTab('all')}
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

      {/* Task table */}
      {isLoading ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center text-[#4c7273] text-sm">
          Loading WhatsApp tasks…
        </div>
      ) : (
        <DomainTaskTable
          files={files}
          tabs={WHATSAPP_TABS}
          renderExpanded={(file) => <WhatsAppExpandedPanel file={file} />}
          onDelete={handleDelete}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}
