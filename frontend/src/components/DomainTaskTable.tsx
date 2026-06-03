'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Loader2, Check, X, Search, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DomainFile, deleteVaultFile, approvePending, rejectPending } from '@/lib/api';
import { STATUS_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface CustomTab {
  key: string;
  label: string;
  matchFn: (file: DomainFile) => boolean;
}

const DEFAULT_TABS: CustomTab[] = [
  { key: 'all', label: 'All', matchFn: () => true },
  {
    key: 'pending',
    label: 'Pending',
    matchFn: (f) => {
      const s = f.stage.toLowerCase();
      return s.includes('pending') || s.includes('needs_action');
    },
  },
  { key: 'done', label: 'Done', matchFn: (f) => f.stage.toLowerCase() === 'done' },
  { key: 'rejected', label: 'Rejected', matchFn: (f) => f.stage.toLowerCase() === 'rejected' },
];

function isDeletable(_stage: string) {
  return true;
}

function stageBadgeStyle(stage: string): React.CSSProperties {
  const key = stage.toLowerCase().replace(/_/g, '');
  const color = STATUS_COLORS[stage.toLowerCase()] ?? STATUS_COLORS[key] ?? '#6366f1';
  return { backgroundColor: `${color}22`, color, borderColor: `${color}44` };
}

function stageAccentColor(stage: string): string {
  const key = stage.toLowerCase().replace(/_/g, '');
  return STATUS_COLORS[stage.toLowerCase()] ?? STATUS_COLORS[key] ?? '#6366f1';
}

// ── delete button (div-based, no td) ─────────────────────────────────────────

interface DeleteButtonProps {
  file: DomainFile;
  onDeleted: (filepath: string) => void;
}

function DeleteButton({ file, onDeleted }: DeleteButtonProps) {
  const [deleting, setDeleting] = useState(false);

  if (!isDeletable(file.stage)) return null;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteVaultFile(file.filepath);
      onDeleted(file.filepath);
    } finally {
      setDeleting(false);
    }
  };

  if (deleting) return <Loader2 className="w-4 h-4 animate-spin text-slate-500" />;

  return (
    <button
      onClick={handleDelete}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-colors"
      aria-label={`Delete ${file.filename}`}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

// ── approve / reject buttons (div-based, no td) ───────────────────────────────

interface ApproveButtonsProps {
  file: DomainFile;
  onActioned: (filepath: string) => void;
}

function ApproveButtons({ file, onActioned }: ApproveButtonsProps) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  if (file.stage !== 'Pending_Approval') return null;

  const run = async (action: 'approve' | 'reject', e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(action);
    try {
      if (action === 'approve') await approvePending(file.filepath);
      else await rejectPending(file.filepath);
      onActioned(file.filepath);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => run('approve', e)}
        disabled={busy !== null}
        className="flex items-center gap-1 px-2.5 h-7 rounded-md text-xs font-medium bg-emerald-600/80 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
        aria-label={`Approve ${file.filename}`}
      >
        {busy === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        Approve
      </button>
      <button
        onClick={(e) => run('reject', e)}
        disabled={busy !== null}
        className="flex items-center gap-1 px-2.5 h-7 rounded-md text-xs font-medium bg-rose-700/80 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors"
        aria-label={`Reject ${file.filename}`}
      >
        {busy === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
        Reject
      </button>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface DomainTaskTableProps {
  files: DomainFile[];
  tabs?: CustomTab[];
  renderExpanded?: (file: DomainFile) => React.ReactNode;
  onDelete?: (filepath: string) => void;
  activeTab?: string;
  onTabChange?: (key: string) => void;
  approvable?: boolean;
  subtitle?: (file: DomainFile) => string | null | undefined;
}

function matchesSearch(file: DomainFile, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (file.filename.toLowerCase().includes(q)) return true;
  if (file.body.toLowerCase().includes(q)) return true;
  return Object.values(file.frontmatter).some((v) =>
    String(v).toLowerCase().includes(q)
  );
}

export default function DomainTaskTable({
  files,
  tabs,
  renderExpanded,
  onDelete,
  activeTab,
  onTabChange,
  approvable = false,
  subtitle,
}: DomainTaskTableProps) {
  const activeTabs = tabs ?? DEFAULT_TABS;
  const [internalKey, setInternalKey] = useState(activeTabs[0]?.key ?? 'all');
  const activeKey = activeTab ?? internalKey;
  const setActiveKey = (key: string) => {
    setInternalKey(key);
    onTabChange?.(key);
  };
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);
  const [search, setSearch] = useState('');

  const currentTab = activeTabs.find((t) => t.key === activeKey) ?? activeTabs[0];
  const visible = [...files
    .filter((f) => currentTab?.matchFn(f) ?? true)
    .filter((f) => !removed.has(f.filepath))
    .filter((f) => matchesSearch(f, search))]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const allDeletable = visible.length > 0 && visible.every((f) => isDeletable(f.stage));

  const toggle = (fp: string) => setExpanded((prev) => (prev === fp ? null : fp));

  const handleDeleted = (filepath: string) => {
    setRemoved((prev) => new Set([...prev, filepath]));
    onDelete?.(filepath);
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await Promise.all(visible.map((f) => deleteVaultFile(f.filepath)));
      setRemoved((prev) => new Set([...prev, ...visible.map((f) => f.filepath)]));
      visible.forEach((f) => onDelete?.(f.filepath));
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-transparent">

      {/* ── search bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#4c7273]/20 bg-[#041421]">
        <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search filenames or content…"
          className="flex-1 bg-transparent text-xs text-[#d0d6d6] placeholder:text-[#4c7273] focus:outline-none"
          aria-label="Search tasks"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-slate-600 hover:text-slate-400 transition-colors"
            aria-label="Clear search"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── filter tabs + clear-all ── */}
      <div className="flex items-center justify-between border-b border-[#4c7273]/20 bg-[#042630]">
        <div className="flex flex-wrap">
          {activeTabs.map((t) => {
            const count = files.filter((f) => t.matchFn(f) && !removed.has(f.filepath)).length;
            return (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5',
                  activeKey === t.key
                    ? 'text-[#86b9b0] border-b-2 border-[#86b9b0]'
                    : 'text-[#4c7273] hover:text-[#d0d6d6]'
                )}
              >
                {t.label}
                {count > 0 && (
                  <span className="text-[10px] font-bold text-[#4c7273]">{count}</span>
                )}
              </button>
            );
          })}
        </div>
        {allDeletable && (
          <button
            onClick={handleClearAll}
            disabled={clearingAll}
            className="flex items-center gap-1.5 mr-3 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 transition-all disabled:opacity-50"
            aria-label={`Clear all ${visible.length} files`}
          >
            {clearingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Clear all ({visible.length})
          </button>
        )}
      </div>

      {/* ── card list ── */}
      <div className="p-3 space-y-2">
        {visible.length === 0 && (
          <div className="py-10 text-center text-[#4c7273] text-sm">
            {search ? `No files match "${search}".` : 'No files found.'}
          </div>
        )}

        {visible.map((file) => {
          const isOpen = expanded === file.filepath;
          const accent = stageAccentColor(file.stage);

          return (
            <div
              key={file.filepath}
              className={cn(
                'rounded-xl overflow-hidden border transition-all duration-150',
                isOpen
                  ? 'border-[#86b9b0]/35 shadow-[0_0_0_1px_rgba(134,185,176,0.08)]'
                  : 'border-[#4c7273]/25 hover:border-[#4c7273]/50'
              )}
            >
              {/* ── card header ── */}
              <div className={cn(
                'flex items-center gap-0 transition-colors',
                isOpen ? 'bg-[#031c28]' : 'bg-[#042630] hover:bg-[#041e2a]'
              )}>

                {/* colored left accent strip */}
                <div
                  className="w-1 self-stretch shrink-0 rounded-l-xl"
                  style={{ backgroundColor: `${accent}60` }}
                />

                {/* toggle zone — click expands the card */}
                <button
                  onClick={() => toggle(file.filepath)}
                  className="flex-1 flex items-center gap-3 px-4 py-3.5 min-w-0 text-left"
                >
                  <span className={cn(
                    'shrink-0 transition-colors',
                    isOpen ? 'text-[#86b9b0]' : 'text-[#4c7273]'
                  )}>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </span>

                  {/* filename + subtitle */}
                  <div className="min-w-0 flex-1">
                    <span className={cn(
                      'font-mono text-xs truncate block',
                      isOpen ? 'text-white' : 'text-[#d0d6d6]'
                    )}>
                      {file.filename}
                    </span>
                    {subtitle && (() => {
                      const s = subtitle(file);
                      return s
                        ? <span className="text-[11px] text-[#6b8e8e] truncate block mt-0.5">{s}</span>
                        : null;
                    })()}
                  </div>

                  {/* stage badge */}
                  <Badge
                    className="text-[10px] shrink-0 hidden sm:inline-flex"
                    style={stageBadgeStyle(file.stage)}
                  >
                    {file.stage.replace(/_/g, ' ')}
                  </Badge>

                  {/* dates */}
                  <span className="text-[11px] text-[#4c7273] shrink-0 hidden md:block tabular-nums">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </span>
                </button>

                {/* action zone — never triggers toggle */}
                <div
                  className="flex items-center gap-2 pr-3 pl-2 shrink-0 border-l border-[#4c7273]/15"
                  onClick={(e) => e.stopPropagation()}
                >
                  {approvable && <ApproveButtons file={file} onActioned={handleDeleted} />}
                  <DeleteButton file={file} onDeleted={handleDeleted} />
                </div>
              </div>

              {/* ── expanded content ── */}
              {isOpen && (
                <div className="border-t border-[#4c7273]/20 bg-[#020f18] px-5 py-5">
                  {renderExpanded ? (
                    renderExpanded(file)
                  ) : (
                    <pre className="font-mono text-xs text-[#4c7273] whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                      {file.body || '(empty)'}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
