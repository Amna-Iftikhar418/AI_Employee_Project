'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2, XCircle, Loader2, Mail, MessageCircle, Share2,
  Building2, Globe, Camera, AlertCircle, ChevronRight, Eye, Pencil,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { approvePending, rejectPending, PendingFile } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  email:     <Mail className="w-4 h-4" />,
  gmail:     <Mail className="w-4 h-4" />,
  whatsapp:  <MessageCircle className="w-4 h-4" />,
  linkedin:  <Share2 className="w-4 h-4" />,
  social:    <Share2 className="w-4 h-4" />,
  facebook:  <Share2 className="w-4 h-4" />,
  instagram: <Camera className="w-4 h-4" />,
  odoo:      <Building2 className="w-4 h-4" />,
  browser:   <Globe className="w-4 h-4" />,
};

interface ApprovalCardProps {
  file: PendingFile;
  onApproved: (filepath: string) => void;
  onRejected: (filepath: string) => void;
}

export default function ApprovalCard({ file, onApproved, onRejected }: ApprovalCardProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(file.body);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [fading, setFading] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [previewMode, setPreviewMode] = useState(true);

  const color = DOMAIN_COLORS[file.domain] ?? '#6366f1';
  const waitingText = formatDistanceToNow(new Date(file.createdAt), { addSuffix: true });
  const busy = approving || rejecting;

  const previewLines = file.body.split('\n').slice(0, 3).join('\n');
  const preview = previewLines.length > 160 ? previewLines.slice(0, 160) : previewLines;
  const hasMore = file.body.length > preview.length || file.body.split('\n').length > 3;

  const dismiss = (cb: (fp: string) => void) => {
    setFading(true);
    setOpen(false);
    setTimeout(() => cb(file.filepath), 350);
  };

  const handleApprove = async () => {
    setApproving(true);
    setError('');
    try {
      await approvePending(file.filepath, content !== file.body ? content : undefined);
      dismiss(onApproved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed — please try again');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectConfirm = async () => {
    setRejecting(true);
    setError('');
    try {
      await rejectPending(file.filepath, rejectReason.trim() || undefined);
      dismiss(onRejected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed — please try again');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      {/* ── compact card ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'w-full text-left rounded-xl border border-[#4c7273]/30 bg-[#042630] overflow-hidden',
          'transition-all duration-200 hover:border-[#86b9b0]/40 hover:shadow-[0_0_18px_rgba(134,185,176,0.10)]',
          'cursor-pointer group',
          fading && 'opacity-0 pointer-events-none'
        )}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#4c7273]/20">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}22`, color }}
          >
            {DOMAIN_ICONS[file.domain] ?? <Share2 className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className="text-[10px]"
                style={{ backgroundColor: `${color}22`, color, borderColor: `${color}44` }}
              >
                {file.domain}
              </Badge>
              <span className="text-sm font-medium text-[#d0d6d6] truncate">
                {(file.frontmatter.type as string) ?? file.filename}
              </span>
            </div>
            <p className="text-xs text-amber-400 mt-0.5">
              Waiting{' '}
              <time dateTime={file.createdAt} title={new Date(file.createdAt).toLocaleString()}>
                {waitingText}
              </time>
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#4c7273] group-hover:text-[#86b9b0] transition-colors shrink-0" />
        </div>

        {/* preview */}
        <div className="px-4 py-3">
          <p className="text-xs font-mono text-[#86b9b0]/65 leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
            {preview}{hasMore ? '…' : ''}
          </p>
          <p className="text-[10px] text-[#4c7273]/70 group-hover:text-[#86b9b0]/70 transition-colors mt-2">
            Click to review &amp; approve
          </p>
        </div>
      </button>

      {/* ── full-content modal ────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="w-[min(1100px,calc(100vw-2rem))] max-h-[90vh] bg-[#042630] border border-[#4c7273]/30 text-[#d0d6d6] p-0 overflow-hidden flex flex-col"
        >
          {/* ── pinned header ── */}
          <DialogHeader className="shrink-0 px-5 pt-4 pb-3 border-b border-[#4c7273]/20">
            <div className="flex items-center gap-3 pr-6">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${color}22`, color }}
              >
                {DOMAIN_ICONS[file.domain] ?? <Share2 className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-sm font-semibold text-[#d0d6d6] truncate">
                  {(file.frontmatter.type as string) ?? file.filename}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge
                    className="text-[10px]"
                    style={{ backgroundColor: `${color}22`, color, borderColor: `${color}44` }}
                  >
                    {file.domain}
                  </Badge>
                  <span className="text-[11px] text-amber-400">Waiting {waitingText}</span>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* ── scrollable body ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
            {/* Preview / Edit toggle */}
            <div className="flex items-center gap-1 bg-[#041421] border border-[#4c7273]/30 rounded-lg p-1 w-fit">
              <button
                onClick={() => setPreviewMode(true)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
                  previewMode
                    ? 'bg-[#042630] text-[#86b9b0] border border-[#4c7273]/40'
                    : 'text-[#4c7273] hover:text-[#86b9b0]'
                )}
              >
                <Eye className="w-3 h-3" /> Preview
              </button>
              <button
                onClick={() => setPreviewMode(false)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
                  !previewMode
                    ? 'bg-[#042630] text-[#86b9b0] border border-[#4c7273]/40'
                    : 'text-[#4c7273] hover:text-[#86b9b0]'
                )}
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>

            {previewMode ? (
              <div className="min-h-80 rounded-lg bg-[#041421] border border-[#4c7273]/30 px-4 py-3 overflow-auto prose-custom">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-3">
                        <table className="w-full text-sm border-collapse border border-[#4c7273]/40">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-[#042630]">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="border border-[#4c7273]/40 px-4 py-2.5 text-left font-semibold text-[#86b9b0] text-sm whitespace-nowrap">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="border border-[#4c7273]/40 px-4 py-2.5 text-[#d0d6d6] text-sm">{children}</td>
                    ),
                    tr: ({ children }) => (
                      <tr className="even:bg-[#042630]/50">{children}</tr>
                    ),
                    p: ({ children }) => <p className="text-sm text-[#d0d6d6] mb-3 leading-relaxed">{children}</p>,
                    h1: ({ children }) => <h1 className="text-xl font-bold text-amber-300 mb-3 border-b border-amber-400/30 pb-1">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold text-cyan-300 mb-2 mt-4">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-violet-300 mb-1.5 mt-3">{children}</h3>,
                    code: ({ children }) => <code className="font-mono text-sm bg-[#042630] px-1.5 py-0.5 rounded text-[#86b9b0]">{children}</code>,
                    ul: ({ children }) => <ul className="list-disc list-inside text-sm text-[#d0d6d6] space-y-1.5 mb-3">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-[#d0d6d6] space-y-1.5 mb-3">{children}</ol>,
                    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                    hr: () => <hr className="border-[#4c7273]/30 my-3" />,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="font-mono text-sm bg-[#041421] border-[#4c7273]/30 text-[#d0d6d6] h-80 resize-none w-full"
                aria-label="Proposed content — edit before approving"
              />
            )}

            {showRejectReason && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#4c7273]">
                  Rejection reason <span className="text-[#4c7273]/60">(optional)</span>
                </label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why is this being rejected?"
                  rows={2}
                  className="font-mono text-xs bg-[#041421] border-rose-500/30 text-[#d0d6d6] resize-none w-full"
                  aria-label="Rejection reason"
                  autoFocus
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* ── pinned footer / actions ── */}
          <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-t border-[#4c7273]/20">
            {showRejectReason ? (
              <>
                <button
                  onClick={() => { setShowRejectReason(false); setRejectReason(''); setError(''); }}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-[#041421] hover:bg-[#04202e] text-[#4c7273] disabled:opacity-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-gradient-to-r from-rose-700 to-red-700 hover:from-rose-600 hover:to-red-600 text-white disabled:opacity-50 transition-all"
                >
                  {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Confirm Reject
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleApprove}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white disabled:opacity-50 transition-all"
                >
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve
                </button>
                <button
                  onClick={() => { setShowRejectReason(true); setError(''); }}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-gradient-to-r from-rose-700 to-red-700 hover:from-rose-600 hover:to-red-600 text-white disabled:opacity-50 transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
