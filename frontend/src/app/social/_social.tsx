'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2, Plus, Calendar, Image as ImageIcon, FileText, Hash, Trash2, Loader2, CheckCircle2, XCircle, X, AlertTriangle, ShieldCheck, RefreshCw, Sparkles, SendHorizonal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fetchDomain, fetchSocialTokenStatus, deleteVaultFile, approvePending, rejectPending, DomainFile } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function matchPlatform(file: DomainFile, platform: string): boolean {
  const platforms = str(file.frontmatter.platforms).toLowerCase();
  return platforms.includes(platform);
}

function getPostText(file: DomainFile, platform?: Platform): string {
  // Instagram-specific content lives in `caption`; prefer it when on the Instagram tab
  if (platform === 'instagram') {
    const caption = str(file.frontmatter.caption);
    if (caption) return caption.trim();
  }
  const msg = str(file.frontmatter.message);
  if (msg) return msg.trim();
  // Generic caption fallback (covers Instagram-only files that have no `message`)
  const caption = str(file.frontmatter.caption);
  if (caption) return caption.trim();
  // Last resort: extract from body section
  const re = /##\s+Post Preview[^\n]*\n+([\s\S]*?)(?=\n---|\n##|$)/i;
  return (re.exec(file.body)?.[1] ?? file.body).trim();
}

function hashtagCount(text: string): number {
  return (text.match(/#\w+/g) ?? []).length;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  done: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  done_pending: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  approved: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  pending_approval: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  needs_action: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  rejected: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

const STATUS_LABEL: Record<string, string> = {
  done: 'Published',
  done_pending: 'Done (not published)',
  approved: 'Approved',
  pending_approval: 'Pending',
  needs_action: 'Needs Action',
  rejected: 'Rejected',
};

function resolveStageKey(file: DomainFile): string {
  const base = file.stage.toLowerCase();
  // A file in Done/ that still has status:pending was never actually published
  if (base === 'done' && str(file.frontmatter.status) === 'pending') return 'done_pending';
  return base;
}

// ── platform config ───────────────────────────────────────────────────────────

const PLATFORM_CONFIG = {
  facebook: { label: 'Facebook', color: '#1877f2', gradient: 'from-blue-600 to-blue-800' },
  instagram: { label: 'Instagram', color: '#e1306c', gradient: 'from-pink-600 to-purple-700' },
} as const;

type Platform = keyof typeof PLATFORM_CONFIG;

// ── create post button with topic + preview dialog ────────────────────────────

type DialogStep = 'input' | 'generating' | 'preview' | 'submitting' | 'done';

function CreatePostButton({ platform }: { platform: Platform }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>('input');
  const [topic, setTopic] = useState('');
  const [previewTab, setPreviewTab] = useState<Platform>(platform);
  const [fbContent, setFbContent] = useState('');
  const [igContent, setIgContent] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const config = PLATFORM_CONFIG[platform];

  const reset = () => { setStep('input'); setTopic(''); setFbContent(''); setIgContent(''); setError(''); };

  const handleOpen = () => { reset(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 60); };
  const handleClose = () => { setOpen(false); setTimeout(reset, 200); };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setStep('generating');
    setError('');
    try {
      const res = await fetch('/api/social/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setFbContent(data.facebook ?? '');
      setIgContent(data.instagram ?? '');
      setPreviewTab(platform);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStep('input');
    }
  };

  const handleSubmit = async () => {
    setStep('submitting');
    setError('');
    try {
      const res = await fetch('/api/social/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, topic: topic.trim(), facebook: fbContent, instagram: igContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submit failed');
      setStep('done');
      setTimeout(handleClose, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
      setStep('preview');
    }
  };

  const activeContent = previewTab === 'facebook' ? fbContent : igContent;
  const setActiveContent = (v: string) => previewTab === 'facebook' ? setFbContent(v) : setIgContent(v);

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-600/50 transition-all"
      >
        <Plus className="w-4 h-4" />
        Create {config.label} Post
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#4c7273]/40 bg-[#041c2a] shadow-2xl shadow-black/60 flex flex-col max-h-[90vh]">

            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#4c7273]/20 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                <span className="text-sm font-semibold text-[#d0d6d6]">Create {config.label} Post</span>
                {topic && step !== 'input' && (
                  <span className="text-xs text-[#4c7273] truncate max-w-[160px]">· {topic}</span>
                )}
              </div>
              <button onClick={handleClose} className="text-[#4c7273] hover:text-[#d0d6d6] transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">

              {/* ── step: input ── */}
              {step === 'input' && (
                <form onSubmit={handleGenerate} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[#86b9b0]">
                      What should the post be about?
                    </label>
                    <input
                      ref={inputRef}
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder={`e.g. "New product launch", "Summer sale 20% off"…`}
                      className="w-full h-10 rounded-lg bg-[#020f18] border border-[#4c7273]/40 px-3 text-sm text-[#d0d6d6] placeholder:text-[#4c7273] focus:outline-none focus:border-[#86b9b0]/60"
                    />
                  </div>
                  {error && <p className="text-xs text-rose-400">{error}</p>}
                  <button
                    type="submit"
                    disabled={!topic.trim()}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-600/60 transition-all disabled:opacity-40"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Preview
                  </button>
                </form>
              )}

              {/* ── step: generating ── */}
              {step === 'generating' && (
                <div className="py-14 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#86b9b0]" />
                  <p className="text-sm text-[#4c7273]">Writing Facebook &amp; Instagram posts…</p>
                </div>
              )}

              {/* ── step: preview / submitting ── */}
              {(step === 'preview' || step === 'submitting') && (
                <div className="space-y-4">
                  {/* platform toggle */}
                  <div className="flex rounded-lg bg-[#020f18] border border-[#4c7273]/20 p-1 gap-1">
                    {(['facebook', 'instagram'] as Platform[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPreviewTab(p)}
                        style={previewTab === p ? { color: PLATFORM_CONFIG[p].color } : undefined}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-semibold rounded-md transition-all',
                          previewTab === p ? 'bg-[#042630]' : 'text-[#4c7273] hover:text-[#d0d6d6]'
                        )}
                      >
                        {PLATFORM_CONFIG[p].label}
                      </button>
                    ))}
                  </div>

                  {/* editable content */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wide text-[#4c7273] font-semibold">
                        {previewTab === 'facebook' ? 'Facebook Message' : 'Instagram Caption'}
                      </span>
                      <span className="text-[10px] text-[#4c7273] tabular-nums">
                        {activeContent.length} chars
                      </span>
                    </div>
                    <textarea
                      value={activeContent}
                      onChange={(e) => setActiveContent(e.target.value)}
                      rows={10}
                      disabled={step === 'submitting'}
                      className="w-full rounded-lg bg-[#020f18] border border-[#4c7273]/30 px-3 py-2.5 text-sm text-[#d0d6d6] focus:outline-none focus:border-[#86b9b0]/50 resize-none leading-relaxed disabled:opacity-60"
                    />
                    <p className="text-[10px] text-[#4c7273]">You can edit before sending for approval.</p>
                  </div>

                  {error && <p className="text-xs text-rose-400">{error}</p>}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setStep('input')}
                      disabled={step === 'submitting'}
                      className="px-4 h-9 rounded-lg text-xs font-medium text-[#4c7273] hover:text-[#d0d6d6] border border-[#4c7273]/30 hover:border-[#4c7273]/60 transition-all disabled:opacity-50"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={step === 'submitting' || (!fbContent.trim() && !igContent.trim())}
                      className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/40 transition-all disabled:opacity-50"
                    >
                      {step === 'submitting'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <SendHorizonal className="w-4 h-4" />}
                      {step === 'submitting' ? 'Sending…' : 'Send for Approval'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── step: done ── */}
              {step === 'done' && (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-300">Sent for approval!</p>
                  <p className="text-xs text-[#4c7273]">
                    Check <span className="text-[#86b9b0]">Pending Approval</span> tab to review and approve.
                  </p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── post card ─────────────────────────────────────────────────────────────────

const PENDING_STAGES = new Set(['pending_approval', 'needs_action']);

interface PostCardProps {
  file: DomainFile;
  platform: Platform;
  onDeleted: (fp: string) => void;
  onActioned: (fp: string) => void;
}

function PostCard({ file, platform, onDeleted, onActioned }: PostCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState(() => str(file.frontmatter.image_url));
  const fm = file.frontmatter;
  const text = getPostText(file, platform);
  const imageUrl = str(fm.image_url);
  const caption = str(fm.caption);
  const created = str(fm.created);
  const stageKey = resolveStageKey(file);
  const config = PLATFORM_CONFIG[platform];
  const isPending = PENDING_STAGES.has(stageKey);
  // Instagram cannot publish without an image — the Meta Graph API rejects text-only posts.
  const requiresImage = platform === 'instagram';
  const approveDisabled = approving || rejecting || (requiresImage && !imageUrlInput.trim());

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

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setApproving(true);
    try {
      await approvePending(file.filepath, undefined, imageUrlInput.trim() || undefined);
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

  return (
    <div className="relative group rounded-xl border border-[#4c7273]/30 bg-[#042630] overflow-hidden">
      {/* Platform stripe */}
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${config.color}, ${config.color}88)` }}
      />

      <div className="p-4 space-y-3">
        {/* Status + timestamp */}
        <div className="flex items-center justify-between gap-2">
          <Badge
            className={cn(
              'text-[10px] border',
              STATUS_STYLES[stageKey] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
            )}
          >
            {STATUS_LABEL[stageKey] ?? file.stage}
          </Badge>
          {created && (
            <time dateTime={created} className="text-[11px] text-slate-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(created).toLocaleDateString()}
            </time>
          )}
        </div>

        {/* Topic / From */}
        {str(fm.topic) && (
          <p className="text-[11px] text-[#86b9b0] truncate">
            <span className="text-[#4c7273]">from · </span>{str(fm.topic)}
          </p>
        )}

        {/* Image */}
        {imageUrl && (
          <div className="rounded-lg overflow-hidden border border-[#4c7273]/30 bg-[#041421]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Post image"
              className="w-full h-36 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* No-image placeholder */}
        {!imageUrl && (
          <div className="rounded-lg border border-dashed border-[#4c7273]/30 bg-[#041421] h-20 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-[#4c7273]" />
          </div>
        )}

        {/* Post text preview */}
        <p className="text-sm text-slate-300 line-clamp-4 leading-relaxed whitespace-pre-line">
          {text || '(no content)'}
        </p>

        {/* Caption if separate */}
        {caption && caption !== text && (
          <p className="text-xs text-slate-500 italic line-clamp-2">{caption}</p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-[#4c7273] border-t border-[#4c7273]/20 pt-2">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {wordCount(text)} words
          </span>
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {hashtagCount(text)} tags
          </span>
        </div>
      </div>

      {/* Inline approve/reject for pending posts */}
      {isPending && (
        <div className="px-4 pb-4 space-y-2">
          {/* Image URL — required for Instagram, optional for Facebook */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              Image URL {requiresImage ? '(required)' : '(optional)'}
            </label>
            <input
              type="url"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="https://example.com/image.jpg"
              className="w-full h-8 rounded-lg bg-[#041421] border border-[#4c7273]/30 px-2 text-xs text-[#d0d6d6] placeholder:text-[#4c7273] focus:outline-none focus:border-[#86b9b0]/50"
            />
            {requiresImage && !imageUrlInput.trim() && (
              <p className="text-[10px] text-amber-400/80">
                Instagram requires a public image URL before it can publish.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={approveDisabled}
              title={requiresImage && !imageUrlInput.trim() ? 'Add an image URL to publish to Instagram' : undefined}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Approve &amp; Publish
            </button>
            <button
              onClick={handleReject}
              disabled={approving || rejecting}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 disabled:opacity-50 transition-all"
            >
              {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Delete button — hover reveal, all stages */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {deleting ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
        ) : (
          <button
            onClick={handleDelete}
            className="w-6 h-6 flex items-center justify-center rounded bg-[#041421] hover:bg-rose-500/10 text-[#4c7273] hover:text-rose-400 transition-colors"
            aria-label="Delete post"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── published history table ───────────────────────────────────────────────────

interface PublishedTableProps {
  files: DomainFile[];
  platform: Platform;
  onDeleted: (fp: string) => void;
}

function PublishedTable({ files, platform, onDeleted }: PublishedTableProps) {
  const [clearing, setClearing] = useState(false);

  const published = files.filter(
    (f) =>
      f.stage.toLowerCase() === 'done' &&
      matchPlatform(f, platform) &&
      (str(f.frontmatter.published_at) !== '' || str(f.frontmatter.status) === 'completed')
  );

  const handleClearHistory = async () => {
    setClearing(true);
    try {
      await Promise.all(published.map((f) => deleteVaultFile(f.filepath)));
      published.forEach((f) => onDeleted(f.filepath));
    } finally {
      setClearing(false);
    }
  };

  if (published.length === 0) {
    return (
      <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-8 text-center text-[#4c7273] text-sm">
        No published {PLATFORM_CONFIG[platform].label} posts yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#4c7273]/20 bg-[#041421]">
        <span className="text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
          {published.length} published post{published.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={handleClearHistory}
          disabled={clearing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 transition-all disabled:opacity-50"
          aria-label="Clear all published history"
        >
          {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Clear history ({published.length})
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#4c7273]/20">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Preview</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide hidden sm:table-cell">Date</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Words</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
              <Hash className="w-3.5 h-3.5 inline" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4c7273]/20">
          {published.map((file) => {
            const text = getPostText(file, platform);
            const created = str(file.frontmatter.created);
            return (
              <tr key={file.filepath} className="hover:bg-[#041421] transition-colors">
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-300 line-clamp-2 max-w-xs">{text.slice(0, 120)}</p>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {created ? (
                    <time dateTime={created} className="text-xs text-slate-500">
                      {new Date(created).toLocaleDateString()}
                    </time>
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-400">{wordCount(text)}</td>
                <td className="px-4 py-3 text-right text-xs text-slate-400">{hashtagCount(text)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── platform tab content ──────────────────────────────────────────────────────

interface PlatformContentProps {
  files: DomainFile[];
  platform: Platform;
  onDeleted: (fp: string) => void;
  onActioned: (fp: string) => void;
}

function PlatformContent({ files, platform, onDeleted, onActioned }: PlatformContentProps) {
  const platformFiles = [...files.filter((f) => matchPlatform(f, platform))].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (platformFiles.length === 0) {
    return (
      <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center">
        <Share2 className="w-8 h-8 text-[#4c7273] mx-auto mb-3" />
        <p className="text-[#4c7273] text-sm">
          No {PLATFORM_CONFIG[platform].label} posts yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {platformFiles.map((file) => (
          <PostCard key={file.filepath} file={file} platform={platform} onDeleted={onDeleted} onActioned={onActioned} />
        ))}
      </div>

      {/* Published history */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          {PLATFORM_CONFIG[platform].label} — Published History
        </h2>
        <PublishedTable files={files} platform={platform} onDeleted={onDeleted} />
      </div>
    </div>
  );
}

// ── Meta token status banner ────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function RecheckButton({
  onClick,
  busy,
  tone,
}: {
  onClick: () => void;
  busy: boolean;
  tone: 'emerald' | 'amber' | 'rose';
}) {
  const toneClass = {
    emerald: 'text-emerald-300/80 hover:bg-emerald-500/10 border-emerald-500/30',
    amber: 'text-amber-200 hover:bg-amber-500/10 border-amber-500/30',
    rose: 'text-rose-200 hover:bg-rose-500/15 border-rose-500/40',
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="Re-check the Meta token now"
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border bg-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        toneClass
      )}
    >
      <RefreshCw className={cn('w-3.5 h-3.5', busy && 'animate-spin')} />
      {busy ? 'Checking…' : 'Re-check'}
    </button>
  );
}

function TokenStatusBanner() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['social', 'token-status'],
    queryFn: fetchSocialTokenStatus,
    refetchInterval: 60_000,
  });

  if (isLoading) return null;

  if (isError || !data) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Could not check Meta token status — social posting may be unavailable.</span>
        <button onClick={() => void refetch()} className="ml-auto text-yellow-300 hover:text-yellow-100">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const onRecheck = () => { void refetch(); };

  // Healthy token: show a slim confirmation (or an expiry warning if it's running out).
  if (data.valid) {
    const days = data.expiresAt ? daysUntil(data.expiresAt) : null;
    const expiringSoon = days != null && days <= 7;

    if (expiringSoon) {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-medium text-amber-200">
              Meta token expires {days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}
            </p>
            <p className="text-amber-300/70 text-xs mt-0.5">
              Regenerate a long-lived Page access token and update{' '}
              <code className="text-amber-200">META_PAGE_ACCESS_TOKEN</code> in <code className="text-amber-200">.env</code> before it lapses,
              then restart the watchers.
            </p>
          </div>
          <RecheckButton onClick={onRecheck} busy={isFetching} tone="amber" />
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 flex items-center gap-2 text-xs text-emerald-300/80">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        Meta connection active
        {data.expiresAt && (
          <span className="text-emerald-400/50">· token valid for ~{daysUntil(data.expiresAt)} days</span>
        )}
        <div className="ml-auto">
          <RecheckButton onClick={onRecheck} busy={isFetching} tone="emerald" />
        </div>
      </div>
    );
  }

  // Invalid / expired / not configured: loud, actionable banner.
  const isExpired = data.expired;
  const title = !data.configured
    ? 'Meta token not configured'
    : isExpired
      ? 'Meta token expired — posts are stuck in Approved'
      : 'Meta token invalid — posts cannot publish';

  return (
    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div className="text-sm space-y-1.5 flex-1">
        <p className="font-semibold text-rose-200">{title}</p>
        <p className="text-rose-300/80 text-xs">
          Approved Facebook/Instagram posts will keep retrying but cannot publish until the
          token is fixed. They are <span className="font-medium">not</span> rejected — they wait for a valid token.
        </p>
        <p className="text-rose-300/60 text-xs font-mono break-words">{data.message}</p>
        <ol className="text-rose-300/80 text-xs list-decimal list-inside space-y-0.5 pt-1">
          <li>Generate a long-lived Page access token in Meta Business / Graph API Explorer.</li>
          <li>Set <code className="text-rose-200">META_PAGE_ACCESS_TOKEN</code> in <code className="text-rose-200">.env</code>.</li>
          <li>Restart the watchers (<code className="text-rose-200">uv run watchers/main.py</code>).</li>
        </ol>
      </div>
      <RecheckButton onClick={onRecheck} busy={isFetching} tone="rose" />
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function SocialPage() {
  const queryClient = useQueryClient();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Platform>('facebook');

  const { data: rawFiles = [], isLoading } = useQuery({
    queryKey: ['domain', 'social'],
    queryFn: () => fetchDomain('social'),
    refetchInterval: 15_000,
  });

  const files = rawFiles.filter((f) => !removed.has(f.filepath) && f.stage !== 'Plans');

  const handleDeleted = (filepath: string) => {
    setRemoved((prev) => new Set([...prev, filepath]));
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['domain', 'social'] });
  };

  const handleActioned = (filepath: string) => {
    setRemoved((prev) => new Set([...prev, filepath]));
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['domain', 'social'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending'] });
    }, 600);
  };

  const fbCount = files.filter((f) => matchPlatform(f, 'facebook')).length;
  const igCount = files.filter((f) => matchPlatform(f, 'instagram')).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <Share2 className="w-6 h-6 text-pink-400" />
            Social Media — Facebook &amp; Instagram
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            AI-generated social posts pipeline
          </p>
        </div>
        <CreatePostButton platform={tab} />
      </div>

      {/* Meta token health — surfaces expired/invalid tokens that strand Approved posts */}
      <TokenStatusBanner />

      {/* Platform tabs */}
      {isLoading ? (
        <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 text-center text-[#4c7273] text-sm">
          Loading posts…
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Platform)}>
          <TabsList className="mb-4">
            <TabsTrigger value="facebook">
              Facebook
              {fbCount > 0 && (
                <span className="ml-1.5 text-[10px] opacity-60">({fbCount})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="instagram">
              Instagram
              {igCount > 0 && (
                <span className="ml-1.5 text-[10px] opacity-60">({igCount})</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="facebook">
            <PlatformContent files={files} platform="facebook" onDeleted={handleDeleted} onActioned={handleActioned} />
          </TabsContent>

          <TabsContent value="instagram">
            <PlatformContent files={files} platform="instagram" onDeleted={handleDeleted} onActioned={handleActioned} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
