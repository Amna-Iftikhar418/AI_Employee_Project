'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Activity,
  Clock,
  XCircle,
  Trash2,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import BrowserTaskCard from '@/components/BrowserTaskCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { fetchDomain, fetchScreenshots, triggerAction, deleteScreenshot, DomainFile } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── filter ────────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'readonly' | 'write' | 'done' | 'rejected';

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'readonly', label: 'Read-only' },
  { key: 'write', label: 'Write (approval)' },
  { key: 'done', label: 'Done' },
  { key: 'rejected', label: 'Rejected' },
];

const READ_ONLY_ACTIONS = new Set(['navigate', 'scrape']);
const WRITE_ACTIONS = new Set(['fill-form', 'submit']);

function matchFilter(file: DomainFile, key: FilterKey): boolean {
  const stage = file.stage.toLowerCase();
  const action = String(file.frontmatter?.action ?? '').toLowerCase();
  switch (key) {
    case 'all': return true;
    case 'readonly': return READ_ONLY_ACTIONS.has(action);
    case 'write':
      return WRITE_ACTIONS.has(action) || stage === 'pending_approval' || stage === 'approved';
    case 'done': return stage === 'done';
    case 'rejected': return stage === 'rejected';
  }
}

// ── KPI helpers ───────────────────────────────────────────────────────────────

function countStage(files: DomainFile[], stage: string) {
  return files.filter((f) => f.stage.toLowerCase() === stage.toLowerCase()).length;
}

function countToday(files: DomainFile[]) {
  const today = new Date().toDateString();
  return files.filter((f) => new Date(f.createdAt).toDateString() === today).length;
}

// ── new browser task dialog ───────────────────────────────────────────────────

const ACTIONS = ['navigate', 'scrape', 'fill-form', 'submit'] as const;

interface TaskForm {
  url: string;
  action: string;
  description: string;
}

const EMPTY: TaskForm = { url: '', action: 'navigate', description: '' };

function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<TaskForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set =
    (field: keyof TaskForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await triggerAction('browser', {
        url: form.url,
        action: form.action,
        description: form.description,
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const requiresApproval = WRITE_ACTIONS.has(form.action);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-[#042630] border-[#4c7273]/30">
        <DialogHeader>
          <DialogTitle className="text-[#d0d6d6]">New Browser Task</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-8 flex flex-col items-center gap-3 text-emerald-400">
            <CheckCircle2 className="w-10 h-10" />
            <p className="text-sm font-medium">Browser task queued</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* URL */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">
                URL <span className="text-rose-400">*</span>
              </label>
              <input
                type="url"
                value={form.url}
                onChange={set('url')}
                required
                placeholder="https://example.com"
                className={inputCls}
              />
            </div>

            {/* Action */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">
                Action <span className="text-rose-400">*</span>
              </label>
              <select
                value={form.action}
                onChange={set('action')}
                className={cn(inputCls, 'cursor-pointer')}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a} className="bg-slate-900">
                    {a}
                    {WRITE_ACTIONS.has(a) ? ' (requires approval)' : ' (read-only)'}
                  </option>
                ))}
              </select>

              {requiresApproval ? (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  This action requires human approval before execution.
                </p>
              ) : (
                <p className="text-[11px] text-slate-600">
                  Read-only — no approval needed.
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Description</label>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={3}
                placeholder="What should the browser do on this page?"
                className={cn(inputCls, 'resize-none')}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-600/80 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {requiresApproval ? 'Queue for Approval' : 'Run Task'}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  'w-full rounded-lg border border-[#4c7273]/30 bg-[#041421] px-3 py-2 text-sm text-[#d0d6d6] placeholder:text-[#4c7273] focus:outline-none focus:border-[#86b9b0]/50 transition-colors';

// ── screenshot gallery ────────────────────────────────────────────────────────

function ScreenshotGallery() {
  const [preview, setPreview] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['screenshots'],
    queryFn: fetchScreenshots,
    refetchInterval: 30_000,
  });

  const screenshots = data?.screenshots ?? [];

  const handleDelete = async (src: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleting(src);
    try {
      await deleteScreenshot(src);
      queryClient.invalidateQueries({ queryKey: ['screenshots'] });
      if (preview === src) setPreview(null);
    } finally {
      setDeleting(null);
    }
  };

  if (screenshots.length === 0) {
    return (
      <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-8 flex flex-col items-center gap-3 text-center">
        <ImageIcon className="w-8 h-8 text-[#4c7273]" />
        <p className="text-[#4c7273] text-sm">No screenshots yet.</p>
        <p className="text-xs text-[#4c7273]">Screenshots from browser tasks will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {screenshots.map((src) => {
          const name = decodeURIComponent(src.split('/').pop() ?? src);
          const isDeleting = deleting === src;
          return (
            <div key={src} className="relative group aspect-video">
              <button
                onClick={() => setPreview(src)}
                className="w-full h-full rounded-lg overflow-hidden border border-[#4c7273]/30 group-hover:border-[#86b9b0]/50 transition-colors bg-[#041421]"
                aria-label={`View screenshot: ${name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={name}
                  className="w-full h-full object-cover group-hover:opacity-70 transition-opacity"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'w-full h-full flex items-center justify-center text-slate-600 text-xs';
                    placeholder.textContent = 'Image unavailable';
                    img.parentElement?.appendChild(placeholder);
                  }}
                />
              </button>
              {/* Delete X button */}
              <button
                onClick={(e) => handleDelete(src, e)}
                disabled={isDeleting}
                aria-label={`Delete screenshot: ${name}`}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600/80 hover:bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
              >
                {isDeleting
                  ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  : <XCircle className="w-3 h-3" />}
              </button>
            </div>
          );
        })}
      </div>

      {preview && (
        <Dialog open onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-4xl bg-[#042630] border-[#4c7273]/30">
            <DialogHeader>
              <DialogTitle className="text-[#4c7273] text-xs font-mono truncate">
                {decodeURIComponent(preview.split('/').pop() ?? preview)}
              </DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Screenshot full view"
              className="w-full rounded-lg max-h-[70vh] object-contain"
            />
            <div className="flex justify-end pt-1">
              <button
                onClick={() => handleDelete(preview)}
                disabled={deleting === preview}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 hover:border-rose-500/50 transition-colors disabled:opacity-50"
              >
                {deleting === preview
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Trash2 className="w-3 h-3" />}
                Delete screenshot
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BrowserPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showNewTask, setShowNewTask] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const { data: rawFiles = [], isLoading } = useQuery({
    queryKey: ['domain', 'browser'],
    queryFn: () => fetchDomain('browser'),
    refetchInterval: 8_000,
  });

  const files = rawFiles.filter((f) => !removed.has(f.filepath));
  const today = countToday(files);
  const pending = countStage(files, 'Pending_Approval') + countStage(files, 'Needs_Action');
  const done = countStage(files, 'Done');
  const failed = countStage(files, 'Rejected');

  const visible = [...files.filter((f) => matchFilter(f, filter))].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleDeleted = (filepath: string) => {
    setRemoved((prev) => new Set([...prev, filepath]));
    queryClient.invalidateQueries({ queryKey: ['domain', 'browser'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleActioned = (filepath: string) => {
    setRemoved((prev) => new Set([...prev, filepath]));
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['domain', 'browser'] });
      queryClient.invalidateQueries({ queryKey: ['pending'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }, 500);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <Globe className="w-6 h-6 text-orange-400" />
            Browser — Web Automation
          </h1>
          <p className="text-sm text-[#4c7273] mt-0.5">
            Automated browser tasks powered by Playwright
          </p>
        </div>
        <button
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-600/30 border border-orange-500/40 text-orange-200 hover:bg-orange-600/50 transition-colors"
          aria-label="Create a new browser task"
        >
          <Plus className="w-4 h-4" />
          New Browser Task
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          title="Today"
          value={today}
          subtitle="tasks created today"
          icon={<Activity className="w-5 h-5" />}
          gradientFrom="#f97316"
          gradientTo="#ef4444"
        />
        <KpiCard
          title="Pending"
          value={pending}
          subtitle="awaiting review"
          icon={<Clock className="w-5 h-5" />}
          gradientFrom="#f59e0b"
          gradientTo="#d97706"
        />
        <KpiCard
          title="Done"
          value={done}
          subtitle="completed"
          icon={<CheckCircle2 className="w-5 h-5" />}
          gradientFrom="#10b981"
          gradientTo="#059669"
        />
        <KpiCard
          title="Failed"
          value={failed}
          subtitle="rejected / failed"
          icon={<XCircle className="w-5 h-5" />}
          gradientFrom="#ef4444"
          gradientTo="#dc2626"
        />
      </div>

      {/* Filter tabs + task cards */}
      <section aria-label="Browser task list">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1 border-b border-[#4c7273]/20 mb-4">
          {FILTER_TABS.map((t) => {
            const count = files.filter((f) => matchFilter(f, t.key)).length;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  filter === t.key
                    ? 'text-[#86b9b0] border-[#86b9b0]'
                    : 'text-[#4c7273] border-transparent hover:text-[#d0d6d6]'
                )}
              >
                {t.label}
                <span className="ml-1.5 text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 flex items-center justify-center gap-3 text-[#4c7273] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading tasks…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center">
            <Globe className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No browser tasks in this category.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((file) => (
              <BrowserTaskCard
                key={file.filepath}
                file={file}
                onDeleted={handleDeleted}
                onActioned={handleActioned}
              />
            ))}
          </div>
        )}
      </section>

      {/* Screenshot gallery */}
      <section aria-label="Screenshot gallery">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Screenshots
        </h2>
        <ScreenshotGallery />
      </section>

      {/* New task dialog */}
      {showNewTask && <NewTaskDialog onClose={() => setShowNewTask(false)} />}
    </div>
  );
}
