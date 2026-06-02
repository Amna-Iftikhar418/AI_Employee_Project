import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Trash2, Loader2, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { OdooInvoice, deleteOdooInvoice } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATE_STYLE: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  posted: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  paid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  cancel: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

function stateStyle(state: string): string {
  return STATE_STYLE[state.toLowerCase()] ?? 'bg-slate-500/20 text-slate-300';
}

function isOverdue(inv: OdooInvoice): boolean {
  if (inv.state === 'paid' || inv.state === 'draft' || inv.state === 'cancel') return false;
  if (!inv.invoice_date) return false;
  return new Date(inv.invoice_date) < new Date();
}

function partnerName(partner_id: OdooInvoice['partner_id']): string {
  if (!partner_id) return '—';
  if (Array.isArray(partner_id)) return partner_id[1] || '—';
  return '—';
}

// ── per-row delete button (draft only) ────────────────────────────────────────

interface DeleteCellProps {
  inv: OdooInvoice;
  onDeleted: (id: number) => void;
}

function DeleteCell({ inv, onDeleted }: DeleteCellProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  // Non-draft invoices cannot be deleted
  if (inv.state !== 'draft') {
    return <td className="px-2 py-3 w-10" />;
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    setErr('');
    try {
      await deleteOdooInvoice(inv.id);
      onDeleted(inv.id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Delete failed');
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  if (deleting) {
    return (
      <td className="px-2 py-3 w-10">
        <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto" />
      </td>
    );
  }

  if (confirming) {
    return (
      <td className="px-2 py-3 w-20" onClick={(e) => e.stopPropagation()}>
        {err && <p className="text-[10px] text-rose-400 mb-1">{err}</p>}
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            className="w-6 h-6 flex items-center justify-center rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors"
            title="Confirm delete"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false); setErr(''); }}
            className="w-6 h-6 flex items-center justify-center rounded bg-[#041421] hover:bg-[#042630] text-[#4c7273] transition-colors"
            title="Cancel"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td className="px-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
        title="Delete invoice"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </td>
  );
}

// ── main table ────────────────────────────────────────────────────────────────

interface OdooInvoiceTableProps {
  invoices: OdooInvoice[];
}

export default function OdooInvoiceTable({ invoices: initialInvoices }: OdooInvoiceTableProps) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [showSummary, setShowSummary] = useState(true);

  // Keep local list in sync with parent refetches
  useEffect(() => {
    setInvoices(initialInvoices);
  }, [initialInvoices]);

  const handleDeleted = (id: number) => setInvoices((prev) => prev.filter((i) => i.id !== id));

  const totalInvoiced = invoices.reduce((s, i) => s + i.amount_total, 0);
  const totalPaid = invoices.filter((i) => i.state === 'paid').reduce((s, i) => s + i.amount_total, 0);
  const outstanding = totalInvoiced - totalPaid;

  const fmt = (n: number) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-xl border border-[#4c7273]/30 overflow-hidden bg-[#042630]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#4c7273]/20 bg-[#041421]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Customer</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#4c7273] uppercase tracking-wide">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">State</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide hidden sm:table-cell">Date</th>
              <th className="px-2 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#4c7273]/20">
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No invoices found.
                </td>
              </tr>
            )}
            {invoices.map((inv, idx) => (
              <tr
                key={inv.id}
                className={cn(
                  'hover:bg-[#041421] transition-colors',
                  isOverdue(inv) && 'bg-rose-500/10'
                )}
              >
                <td className="px-4 py-3 font-mono text-xs text-[#d0d6d6]">
                  {inv.name && inv.name !== '/' ? inv.name : String(idx + 1)}
                </td>
                <td className="px-4 py-3 text-xs text-[#d0d6d6]">
                  {partnerName(inv.partner_id)}
                </td>
                <td className="px-4 py-3 text-xs text-[#86b9b0] text-right font-medium">
                  {fmt(inv.amount_total)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn('text-[10px] border', stateStyle(inv.state))}>
                    {isOverdue(inv) ? 'overdue' : inv.state}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-[#4c7273] hidden sm:table-cell">
                  {inv.invoice_date ? (
                    <time dateTime={inv.invoice_date}>{inv.invoice_date}</time>
                  ) : (
                    '—'
                  )}
                </td>
                <DeleteCell inv={inv} onDeleted={handleDeleted} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#4c7273]/20 bg-[#041421]">
              <td colSpan={2} className="px-4 py-3">
                <button
                  onClick={() => setShowSummary((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  {showSummary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Summary
                </button>
              </td>
              <td className="px-4 py-3 text-right" />
              <td colSpan={3} className="px-4 py-3">
                {showSummary && (
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="text-slate-400">Invoiced: <strong className="text-slate-200">{fmt(totalInvoiced)}</strong></span>
                    <span className="text-emerald-400">Paid: <strong>{fmt(totalPaid)}</strong></span>
                    <span className="text-amber-400">Outstanding: <strong>{fmt(outstanding)}</strong></span>
                  </div>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
