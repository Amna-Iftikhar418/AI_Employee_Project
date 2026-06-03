'use client';

import { useState } from 'react';
import { Globe, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DomainFile, deleteVaultFile, approvePending, rejectPending } from '@/lib/api';
import { cn } from '@/lib/utils';

const ACTION_STYLE: Record<string, string> = {
  navigate: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'fill-form': 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  scrape: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  submit: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

interface BrowserTaskCardProps {
  file: DomainFile;
  screenshots?: string[];
  onDeleted?: (filepath: string) => void;
  onActioned?: (filepath: string) => void;
}

export default function BrowserTaskCard({
  file,
  screenshots = [],
  onDeleted,
  onActioned,
}: BrowserTaskCardProps) {
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Prefer frontmatter fields; fall back to parsing the body JSON payload for
  // older task files created before the trigger route was updated.
  const _bodyUrl = (() => { const m = file.body.match(/"url"\s*:\s*"([^"]+)"/); return m ? m[1] : ''; })();
  const _bodyAction = (() => { const m = file.body.match(/"action"\s*:\s*"([^"]+)"/); return m ? m[1] : ''; })();
  const url = (file.frontmatter?.url as string) || _bodyUrl;
  const _fmAction = file.frontmatter?.action as string;
  // "browser" is the trigger name, not a real action — fall through to body parse
  const action = (_fmAction && _fmAction !== 'browser') ? _fmAction : (_bodyAction || 'navigate');
  const desc = (file.frontmatter?.description as string) ?? file.body.trim().slice(0, 120);

  const actionStyle = ACTION_STYLE[action] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/40';
  const canDelete = true;
  const isWriteAction = action === 'fill-form' || action === 'submit';
  // Show approve/reject for any Needs_Action or Pending_Approval task so stuck cards can be manually unblocked
  const isPending = file.stage === 'Pending_Approval' || file.stage === 'Needs_Action';

  const stageColor =
    file.stage === 'Done'
      ? 'text-emerald-400'
      : isPending
      ? 'text-amber-400'
      : file.stage === 'Rejected'
      ? 'text-rose-400'
      : 'text-slate-400';

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteVaultFile(file.filepath);
      onDeleted?.(file.filepath);
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
      onActioned?.(file.filepath);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRejecting(true);
    try {
      await rejectPending(file.filepath);
      onActioned?.(file.filepath);
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="text-xs font-mono text-slate-300 truncate">{url || '(no URL)'}</span>
          </div>
          <Badge className={cn('text-[10px] border shrink-0', actionStyle)}>{action}</Badge>
        </div>

        {/* Description */}
        {desc && <p className="text-xs text-slate-400 line-clamp-2">{desc}</p>}

        {/* Status + filename */}
        <div className="flex items-center justify-between text-xs">
          <span className={cn('font-medium', stageColor)}>{file.stage}</span>
          <span className="text-slate-600 font-mono truncate max-w-[160px]">{file.filename}</span>
        </div>

        {/* Screenshot thumbnails (when passed by parent) */}
        {screenshots.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {screenshots.slice(0, 4).map((src) => (
              <button
                key={src}
                onClick={() => setPreviewImg(src)}
                className="w-16 h-12 rounded overflow-hidden border border-[#4c7273]/30 hover:border-[#86b9b0]/50 transition-colors"
                aria-label={`View screenshot: ${src}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="screenshot" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Warning for actions that require manual Claude execution */}
        {isWriteAction && isPending && (
          <p className="text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
            ⚠ fill-form / submit tasks require manual execution via the browser_handler Claude skill — approving will reject them automatically.
          </p>
        )}

        {/* Approve / Reject — Pending_Approval and Needs_Action tasks */}
        {isPending && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleApprove}
              disabled={approving || rejecting}
              aria-label="Approve browser task"
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-50 transition-all"
            >
              {approving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <CheckCircle2 className="w-3.5 h-3.5" />}
              Approve
            </button>
            <button
              onClick={handleReject}
              disabled={approving || rejecting}
              aria-label="Reject browser task"
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium bg-rose-700/80 hover:bg-rose-600 text-white disabled:opacity-50 transition-all"
            >
              {rejecting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <XCircle className="w-3.5 h-3.5" />}
              Reject
            </button>
          </div>
        )}

        {/* Delete — available from all stages */}
        {canDelete && (
          <div className="flex items-center justify-end gap-1 pt-1">
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            ) : confirming ? (
              <>
                <button
                  onClick={handleDelete}
                  aria-label="Confirm delete"
                  className="w-6 h-6 flex items-center justify-center rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors text-[10px] font-bold"
                >✓</button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
                  aria-label="Cancel delete"
                  className="w-6 h-6 flex items-center justify-center rounded bg-[#041421] hover:bg-[#042630] text-[#4c7273] transition-colors text-[10px]"
                >✗</button>
              </>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
                aria-label="Delete task"
                className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs text-[#4c7273] hover:text-rose-400 hover:bg-rose-500/10 border border-[#4c7273]/30 hover:border-rose-500/30 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Screenshot full-size preview */}
      {previewImg && (
        <Dialog open onOpenChange={(open) => !open && setPreviewImg(null)}>
          <DialogContent className="max-w-3xl bg-[#042630] border-[#4c7273]/30">
            <DialogHeader>
              <DialogTitle className="text-slate-200 text-sm font-mono truncate">{previewImg}</DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Screenshot full view" className="w-full rounded-lg" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
