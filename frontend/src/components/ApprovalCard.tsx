'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, XCircle, Loader2, Mail, MessageCircle, Share2, Building2, Globe, Camera, AlertCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { approvePending, rejectPending, PendingFile } from '@/lib/api';
import { DOMAIN_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  gmail: <Mail className="w-4 h-4" />,
  whatsapp: <MessageCircle className="w-4 h-4" />,
  linkedin: <Share2 className="w-4 h-4" />,
  social: <Share2 className="w-4 h-4" />,
  facebook: <Share2 className="w-4 h-4" />,
  instagram: <Camera className="w-4 h-4" />,
  odoo: <Building2 className="w-4 h-4" />,
  browser: <Globe className="w-4 h-4" />,
};

interface ApprovalCardProps {
  file: PendingFile;
  onApproved: (filepath: string) => void;
  onRejected: (filepath: string) => void;
}

export default function ApprovalCard({ file, onApproved, onRejected }: ApprovalCardProps) {
  const [content, setContent] = useState(file.body);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [fading, setFading] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');

  const color = DOMAIN_COLORS[file.domain] ?? '#6366f1';
  const waitingText = formatDistanceToNow(new Date(file.createdAt), { addSuffix: true });
  const busy = approving || rejecting;

  const handleApprove = async () => {
    setApproving(true);
    setError('');
    try {
      await approvePending(file.filepath, content !== file.body ? content : undefined);
      setFading(true);
      setTimeout(() => onApproved(file.filepath), 350);
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
      setFading(true);
      setTimeout(() => onRejected(file.filepath), 350);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed — please try again');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-[#4c7273]/30 bg-[#042630] overflow-hidden transition-opacity duration-300',
        fading && 'opacity-0 pointer-events-none'
      )}
    >
      {/* Header */}
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
      </div>

      {/* Editable content */}
      <div className="px-4 py-3">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="font-mono text-xs bg-[#041421] border-[#4c7273]/30 text-[#d0d6d6] min-h-32 resize-none"
          aria-label="Proposed content — edit before approving"
        />
      </div>

      {/* Rejection reason input */}
      {showRejectReason && (
        <div className="px-4 pb-3 space-y-2">
          <label className="text-xs font-medium text-[#4c7273]">
            Rejection reason <span className="text-[#4c7273]/60">(optional)</span>
          </label>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this being rejected?"
            rows={2}
            className="font-mono text-xs bg-[#041421] border-rose-500/30 text-[#d0d6d6] resize-none"
            aria-label="Rejection reason"
            autoFocus
          />
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-4">
        {showRejectReason ? (
          <>
            <button
              onClick={() => { setShowRejectReason(false); setRejectReason(''); setError(''); }}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-[#041421] hover:bg-[#042630] text-[#4c7273] disabled:opacity-50 transition-all"
              aria-label="Cancel rejection"
            >
              Cancel
            </button>
            <button
              onClick={handleRejectConfirm}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-gradient-to-r from-rose-700 to-red-700 hover:from-rose-600 hover:to-red-600 text-white disabled:opacity-50 transition-all"
              aria-label="Confirm rejection"
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
              aria-label="Approve this task"
            >
              {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve
            </button>
            <button
              onClick={() => { setShowRejectReason(true); setError(''); }}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium bg-gradient-to-r from-rose-700 to-red-700 hover:from-rose-600 hover:to-red-600 text-white disabled:opacity-50 transition-all"
              aria-label="Reject this task"
            >
              {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
