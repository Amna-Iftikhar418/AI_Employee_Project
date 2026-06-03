'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2, Plus, Hash, FileText, Calendar, ExternalLink, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchDomain, deleteVaultFile, approvePending, rejectPending, markLinkedInPublished, DomainFile, triggerAction } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function extractPostContent(body: string): string {
  const re = /##\s+Post Content[\s\S]*?\n([\s\S]*?)(?=\n##\s|$)/i;
  return (re.exec(body)?.[1] ?? '').trim();
}

function threeLinePreview(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 200);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hashtagCount(text: string): number {
  return (text.match(/#\w+/g) ?? []).length;
}

// ── filter tabs ───────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'pending' | 'approved' | 'published' | 'rejected';

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'published', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
];

function matchFilter(file: DomainFile, key: FilterKey): boolean {
  const s = file.stage.toLowerCase();
  switch (key) {
    case 'all': return true;
    case 'pending': return s === 'pending_approval' || s === 'needs_action';
    case 'approved': return s === 'approved';
    case 'published': return s === 'done';
    case 'rejected': return s === 'rejected';
  }
}

// ── status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  done: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  approved: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  pending_approval: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  needs_action: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  rejected: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

function statusLabel(stage: string): string {
  const map: Record<string, string> = {
    done: 'Published',
    approved: 'Approved',
    pending_approval: 'Pending',
    needs_action: 'Needs Action',
    rejected: 'Rejected',
  };
  return map[stage.toLowerCase()] ?? stage;
}

// ── create post dialog ────────────────────────────────────────────────────────

function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreate = async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      await triggerAction('linkedin', topic.trim() ? { topic: topic.trim() } : {});
      setStatus('success');
      setTimeout(() => {
        setOpen(false);
        setStatus('idle');
        setTopic('');
      }, 1400);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to queue post');
      setStatus('error');
    }
  };

  const handleClose = (val: boolean) => {
    if (status === 'loading') return;
    setOpen(val);
    if (!val) { setTopic(''); setStatus('idle'); setErrorMsg(''); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-600/50 transition-all"
      >
        <Plus className="w-4 h-4" />
        Create LinkedIn Post
      </button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[min(480px,calc(100vw-2rem))] bg-[#042630] border border-[#4c7273]/30 text-[#d0d6d6] p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-[#4c7273]/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                <Share2 className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold text-[#d0d6d6]">
                  Create LinkedIn Post
                </DialogTitle>
                <p className="text-xs text-[#4c7273] mt-0.5">
                  AI will generate a post and send it for your approval
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#86b9b0] uppercase tracking-wide">
                Post Topic
                <span className="ml-1.5 text-[#4c7273] font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && status === 'idle' && handleCreate()}
                placeholder="e.g. AI automation in business"
                disabled={status === 'loading' || status === 'success'}
                className="w-full bg-[#041421] border border-[#4c7273]/30 rounded-lg px-3 py-2.5 text-sm text-[#d0d6d6] placeholder:text-[#4c7273] outline-none focus:border-[#86b9b0]/50 transition-colors disabled:opacity-50"
                autoFocus
              />
              <p className="text-[11px] text-[#4c7273]">
                Leave blank to auto-select from the rotation list
              </p>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errorMsg}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              onClick={() => handleClose(false)}
              disabled={status === 'loading'}
              className="flex-1 h-9 rounded-lg text-sm font-medium bg-[#041421] hover:bg-[#04202e] text-[#4c7273] hover:text-[#86b9b0] border border-[#4c7273]/20 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={status === 'loading' || status === 'success'}
              className={cn(
                'flex-1 h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-60',
                status === 'success'
                  ? 'bg-emerald-600/80 text-white'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white'
              )}
            >
              {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
              {status === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {status === 'success' ? 'Queued!' : status === 'loading' ? 'Queuing…' : 'Create Post'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── post card ─────────────────────────────────────────────────────────────────

const DELETABLE = new Set(['done', 'rejected']);
const PENDING_STAGES = new Set(['pending_approval', 'needs_action']);

function PostCard({
  file,
  onOpen,
  onDeleted,
  onActioned,
}: {
  file: DomainFile;
  onOpen: (f: DomainFile) => void;
  onDeleted: (fp: string) => void;
  onActioned: (fp: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [marking, setMarking] = useState(false);
  const fm = file.frontmatter;
  const topic = str(fm.topic);
  const publishedAt = str(fm.published_at ?? fm.created);
  const postContent = extractPostContent(file.body);
  const preview = threeLinePreview(postContent || file.body);
  const stageKey = file.stage.toLowerCase();
  const canDelete = DELETABLE.has(stageKey);
  const isPending = PENDING_STAGES.has(stageKey);
  const isApproved = stageKey === 'approved';

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

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setApproving(true);
    try {
      await approvePending(file.filepath);
      onActioned(file.filepath);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRejecting(true);
    try {
      await rejectPending(file.filepath);
      onActioned(file.filepath);
    } finally {
      setRejecting(false);
    }
  };

  const handleMarkPublished = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMarking(true);
    try {
      await markLinkedInPublished(file.filepath);
      onActioned(file.filepath);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="relative group rounded-xl border border-[#4c7273]/30 bg-[#042630] overflow-hidden">
      <button
        onClick={() => onOpen(file)}
        className="text-left w-full p-4 space-y-3 hover:bg-[#041421] transition-all"
        aria-label={`View post: ${topic || file.filename}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {topic && (
              <span className="inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 mb-2 truncate max-w-full">
                {topic}
              </span>
            )}
            <p className="text-sm text-[#d0d6d6] line-clamp-3 leading-relaxed">{preview || '(no content)'}</p>
          </div>
          <Badge
            className={cn('text-[10px] border shrink-0 ml-1', STATUS_STYLES[stageKey] ?? 'bg-slate-500/20 text-slate-300')}
          >
            {statusLabel(file.stage)}
          </Badge>
        </div>

        {publishedAt && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Calendar className="w-3 h-3" />
            <time dateTime={publishedAt}>{new Date(publishedAt).toLocaleDateString()}</time>
          </div>
        )}
      </button>

      {/* Approve / Reject buttons for pending posts */}
      {isPending && (
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={handleApprove}
            disabled={approving || rejecting}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-50 transition-all"
            aria-label="Approve post"
          >
            {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>✓</span>}
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={approving || rejecting}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium bg-rose-700/80 hover:bg-rose-600 text-white disabled:opacity-50 transition-all"
            aria-label="Reject post"
          >
            {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>✗</span>}
            Reject
          </button>
        </div>
      )}

      {/* Mark as Published button for approved posts (auto-publish running in background) */}
      {isApproved && (
        <div className="px-4 pb-4">
          <button
            onClick={handleMarkPublished}
            disabled={marking}
            className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium bg-blue-600/80 hover:bg-blue-500 text-white disabled:opacity-50 transition-all"
            aria-label="Mark post as published"
          >
            {marking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>✓</span>}
            Mark as Published
          </button>
          <p className="text-[10px] text-slate-600 text-center mt-1">Auto-publishing runs in background</p>
        </div>
      )}

      {/* Delete button for done/rejected posts */}
      {canDelete && (
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {deleting ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          ) : confirming ? (
            <>
              <button onClick={handleDelete} className="w-6 h-6 flex items-center justify-center rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors text-[10px] font-bold">✓</button>
              <button onClick={(e) => { e.stopPropagation(); setConfirming(false); }} className="w-6 h-6 flex items-center justify-center rounded bg-[#041421] hover:bg-[#042630] text-[#4c7273] transition-colors text-[10px]">✗</button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
              className="w-6 h-6 flex items-center justify-center rounded bg-[#041421] hover:bg-rose-500/10 text-[#4c7273] hover:text-rose-400 transition-colors"
              aria-label="Delete post"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── published history table ───────────────────────────────────────────────────

function PublishedTable({ files }: { files: DomainFile[] }) {
  const published = files.filter((f) => f.stage.toLowerCase() === 'done');

  if (published.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
        Published History
      </h2>
      <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Topic</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide hidden sm:table-cell">Date</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Words</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
                <Hash className="w-3.5 h-3.5 inline" />
              </th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#4c7273]/20">
            {published.map((file) => {
              const fm = file.frontmatter;
              const topic = str(fm.topic);
              const publishedAt = str(fm.published_at ?? fm.created);
              const postUrl = str(fm.post_url);
              const content = extractPostContent(file.body);
              const wc = wordCount(content || file.body);
              const hc = hashtagCount(content || file.body);

              return (
                <tr key={file.filepath} className="hover:bg-[#041421] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-slate-300 line-clamp-1">{topic || file.filename}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {publishedAt ? (
                      <time dateTime={publishedAt} className="text-xs text-slate-500">
                        {new Date(publishedAt).toLocaleDateString()}
                      </time>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">{wc}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">{hc}</td>
                  <td className="px-4 py-3">
                    {postUrl && (
                      <a
                        href={postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        aria-label="Open LinkedIn post"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── post dialog ───────────────────────────────────────────────────────────────

function PostDialog({ file, onClose }: { file: DomainFile; onClose: () => void }) {
  const fm = file.frontmatter;
  const topic = str(fm.topic);
  const publishedAt = str(fm.published_at ?? fm.created);
  const postUrl = str(fm.post_url);
  const content = extractPostContent(file.body);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-[#042630] border-[#4c7273]/30 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-200 pr-6">
            {topic || 'LinkedIn Post'}
          </DialogTitle>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            <Badge className={cn('text-[10px] border', STATUS_STYLES[file.stage.toLowerCase()] ?? 'bg-slate-500/20 text-slate-300')}>
              {statusLabel(file.stage)}
            </Badge>
            {publishedAt && (
              <time dateTime={publishedAt} className="text-xs text-slate-500">
                {new Date(publishedAt).toLocaleString()}
              </time>
            )}
            {postUrl && (
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3 h-3" /> View on LinkedIn
              </a>
            )}
          </div>
        </DialogHeader>
        <div className="mt-2">
          <pre className="text-sm text-slate-300 whitespace-pre-wrap break-words font-sans leading-relaxed">
            {content || file.body || '(no content)'}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function LinkedInPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<DomainFile | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const { data: rawFiles = [], isLoading } = useQuery({
    queryKey: ['domain', 'linkedin'],
    queryFn: () => fetchDomain('linkedin'),
    refetchInterval: 15_000,
  });

  // Only show real LinkedIn posts — filter out trigger task files (TASK_*)
  const files = rawFiles.filter(
    (f) => !removed.has(f.filepath) && f.filename.startsWith('LINKEDIN_POST_')
  );
  const visible = [...files.filter((f) => matchFilter(f, filter))].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleDeleted = (filepath: string) => {
    setRemoved((prev) => new Set([...prev, filepath]));
    if (selected?.filepath === filepath) setSelected(null);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleActioned = (filepath: string) => {
    setRemoved((prev) => new Set([...prev, filepath]));
    if (selected?.filepath === filepath) setSelected(null);
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['domain', 'linkedin'] });
      queryClient.invalidateQueries({ queryKey: ['pending'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }, 600);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <Share2 className="w-6 h-6 text-blue-400" />
            LinkedIn — Post Management
          </h1>
          <p className="text-sm text-[#4c7273] mt-0.5">AI-generated LinkedIn posts pipeline</p>
        </div>
        <CreatePostDialog />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 border-b border-white/10 pb-0">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              filter === t.key
                ? 'text-white border-blue-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] opacity-60">
              ({files.filter((f) => matchFilter(f, t.key)).length})
            </span>
          </button>
        ))}
      </div>

      {/* Post cards grid */}
      {isLoading ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center text-[#4c7273] text-sm">
          Loading posts…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center">
          <FileText className="w-8 h-8 text-[#4c7273] mx-auto mb-3" />
          <p className="text-[#4c7273] text-sm">No posts in this category.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((file) => (
            <PostCard key={file.filepath} file={file} onOpen={setSelected} onDeleted={handleDeleted} onActioned={handleActioned} />
          ))}
        </div>
      )}

      {/* Published history */}
      <PublishedTable files={files} />

      {/* Post dialog */}
      {selected && <PostDialog file={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
