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

// ── per-row delete control ────────────────────────────────────────────────────

interface DeleteCellProps {
  file: DomainFile;
  onDeleted: (filepath: string) => void;
}

function DeleteCell({ file, onDeleted }: DeleteCellProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isDeletable(file.stage)) return <td className="px-4 py-3 w-10" />;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteVaultFile(file.filepath);
      onDeleted(file.filepath);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (deleting) {
    return (
      <td className="px-4 py-3 w-20">
        <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto" />
      </td>
    );
  }

  if (confirming) {
    return (
      <td className="px-4 py-3 w-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            className="w-6 h-6 flex items-center justify-center rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors"
            aria-label="Confirm delete"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            className="w-6 h-6 flex items-center justify-center rounded bg-[#041421] hover:bg-[#042630] text-[#4c7273] transition-colors"
            aria-label="Cancel delete"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
        aria-label={`Delete ${file.filename}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </td>
  );
}

// ── per-row approve / reject control ──────────────────────────────────────────

interface ApproveCellProps {
  file: DomainFile;
  onActioned: (filepath: string) => void;
}

function ApproveCell({ file, onActioned }: ApproveCellProps) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  // Only Pending_Approval rows can be approved/rejected; others get a blank cell.
  if (file.stage !== 'Pending_Approval') return <td className="px-4 py-3 w-40" />;

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
    <td className="px-4 py-3 w-40" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
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
    </td>
  );
}

// ── main table ────────────────────────────────────────────────────────────────

interface DomainTaskTableProps {
  files: DomainFile[];
  tabs?: CustomTab[];
  renderExpanded?: (file: DomainFile) => React.ReactNode;
  onDelete?: (filepath: string) => void;
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** When true, Pending_Approval rows get inline Approve / Reject buttons. */
  approvable?: boolean;
  /** Optional subtitle shown below the filename (e.g. customer name for Odoo rows). */
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

export default function DomainTaskTable({ files, tabs, renderExpanded, onDelete, activeTab, onTabChange, approvable = false, subtitle }: DomainTaskTableProps) {
  // Total column count, used for empty-state and expanded-row colSpan.
  const colCount = approvable ? 7 : 6;
  const activeTabs = tabs ?? DEFAULT_TABS;
  const [internalKey, setInternalKey] = useState(activeTabs[0]?.key ?? 'all');
  const activeKey = activeTab ?? internalKey;
  const setActiveKey = (key: string) => {
    setInternalKey(key);
    onTabChange?.(key);
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);
  const [search, setSearch] = useState('');

  const currentTab = activeTabs.find((t) => t.key === activeKey) ?? activeTabs[0];
  const visible = [...files
    .filter((f) => currentTab?.matchFn(f) ?? true)
    .filter((f) => !removed.has(f.filepath))
    .filter((f) => matchesSearch(f, search))]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Show "Clear All" button only when every visible row is deletable
  const allDeletable = visible.length > 0 && visible.every((f) => isDeletable(f.stage));

  const toggle = (fp: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(fp) ? next.delete(fp) : next.add(fp);
      return next;
    });

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
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      {/* Search bar */}
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

      {/* Filter tabs + clear-all */}
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
            {clearingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Clear all ({visible.length})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#4c7273]/20 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-[#4c7273] uppercase tracking-wide">File</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Stage</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#4c7273] uppercase tracking-wide hidden sm:table-cell">Created</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#4c7273] uppercase tracking-wide hidden md:table-cell">Modified</th>
              {approvable && <th className="px-4 py-3 w-40" />}
              <th className="px-4 py-3 w-10" />
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-[#4c7273] text-sm">
                  {search ? `No files match "${search}".` : 'No files found.'}
                </td>
              </tr>
            )}
            {visible.map((file) => {
              const isOpen = expanded.has(file.filepath);
              return (
                <React.Fragment key={file.filepath}>
                  <tr
                    className="group border-b border-[#4c7273]/20 hover:bg-[#041421] cursor-pointer transition-colors"
                    onClick={() => toggle(file.filepath)}
                  >
                    <td className="px-4 py-3 max-w-[220px]">
                      <span className="font-mono text-xs text-[#d0d6d6] truncate block">{file.filename}</span>
                      {subtitle && (() => { const s = subtitle(file); return s ? <span className="text-[11px] text-[#4c7273] truncate block">{s}</span> : null; })()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="text-[10px]" style={stageBadgeStyle(file.stage)}>
                        {file.stage}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4c7273] hidden sm:table-cell">
                      <time dateTime={file.createdAt}>
                        {new Date(file.createdAt).toLocaleDateString()}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4c7273] hidden md:table-cell">
                      <time dateTime={file.modifiedAt}>
                        {new Date(file.modifiedAt).toLocaleDateString()}
                      </time>
                    </td>
                    {approvable && <ApproveCell file={file} onActioned={handleDeleted} />}
                    <DeleteCell file={file} onDeleted={handleDeleted} />
                    <td className="px-4 py-3 text-slate-500">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${file.filepath}-expanded`} className="bg-[#041421]">
                      <td colSpan={colCount} className="px-4 py-4">
                        {renderExpanded ? (
                          renderExpanded(file)
                        ) : (
                          <pre className="font-mono text-xs text-[#4c7273] whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                            {file.body || '(empty)'}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
