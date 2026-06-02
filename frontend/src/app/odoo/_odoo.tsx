'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  WifiOff,
  Loader2,
  Receipt,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import OdooInvoiceTable from '@/components/OdooInvoiceTable';
import DomainTaskTable from '@/components/DomainTaskTable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { fetchOdooInvoices, fetchDomain, triggerAction } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── draft invoice dialog ──────────────────────────────────────────────────────

interface FormState {
  customer: string;
  email: string;
  product: string;
  quantity: string;
  unit_price: string;
}

const EMPTY_FORM: FormState = {
  customer: '',
  email: '',
  product: '',
  quantity: '1',
  unit_price: '',
};

function DraftInvoiceDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await triggerAction('odoo', {
        customer: form.customer,
        email: form.email,
        product: form.product,
        quantity: Number(form.quantity),
        unit_price: Number(form.unit_price),
        total: Number(form.quantity) * Number(form.unit_price),
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-[#042630] border-[#4c7273]/30">
        <DialogHeader>
          <DialogTitle className="text-[#d0d6d6]">Draft Invoice</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-8 flex flex-col items-center gap-3 text-emerald-400">
            <CheckCircle2 className="w-10 h-10" />
            <p className="text-sm font-medium">Invoice task queued for approval</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <Field label="Customer Name" required>
              <input
                type="text"
                value={form.customer}
                onChange={set('customer')}
                required
                placeholder="e.g. Acme Corp"
                className={inputCls}
              />
            </Field>
            <Field label="Customer Email" required>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                required
                placeholder="customer@example.com"
                className={inputCls}
              />
            </Field>
            <Field label="Product / Service" required>
              <input
                type="text"
                value={form.product}
                onChange={set('product')}
                required
                placeholder="e.g. Consulting Services"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity" required>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={set('quantity')}
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Unit Price (PKR)" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_price}
                  onChange={set('unit_price')}
                  required
                  placeholder="0.00"
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Total preview */}
            {form.quantity && form.unit_price && (
              <div className="rounded-lg bg-[#041421] border border-[#4c7273]/30 px-4 py-2.5 flex justify-between text-sm">
                <span className="text-[#4c7273]">Total</span>
                <span className="font-semibold text-[#d0d6d6]">
                  PKR {(Number(form.quantity) * Number(form.unit_price)).toLocaleString('en-PK', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

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
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600/80 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Queue for Approval
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[#4c7273]">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── offline state ─────────────────────────────────────────────────────────────

function OdooOffline({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 flex flex-col items-center gap-3 text-center">
      <WifiOff className="w-10 h-10 text-[#4c7273]" />
      <p className="text-[#d0d6d6] font-medium">Odoo Offline</p>
      {error && <p className="text-xs text-[#4c7273] max-w-sm">{error}</p>}
      <p className="text-xs text-[#4c7273]">
        Check that Odoo is running and the MCP server is connected.
      </p>
      <button
        onClick={onRetry}
        className="mt-1 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#4c7273]/30 bg-[#041421] text-[#4c7273] hover:text-[#d0d6d6] hover:bg-[#042630] transition-all"
        aria-label="Retry Odoo connection"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry Connection
      </button>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function OdooPage() {
  const queryClient = useQueryClient();
  const [showDraftDialog, setShowDraftDialog] = useState(false);

  const handleDelete = () => {
    queryClient.invalidateQueries({ queryKey: ['domain', 'odoo'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['pending'] });
  };

  const { data: invoiceRes, isLoading: invoicesLoading, refetch: retryInvoices } = useQuery({
    queryKey: ['odoo', 'invoices'],
    queryFn: fetchOdooInvoices,
    refetchInterval: 60_000,
  });

  const { data: domainFiles = [], isLoading: filesLoading } = useQuery({
    queryKey: ['domain', 'odoo'],
    queryFn: () => fetchDomain('odoo'),
    refetchInterval: 8_000,
  });

  const invoices = invoiceRes?.invoices ?? [];
  const connected = invoiceRes?.connected ?? true;

  // Revenue summary
  const totalInvoiced = invoices.reduce((s, i) => s + i.amount_total, 0);
  const totalPaid = invoices
    .filter((i) => i.state === 'paid')
    .reduce((s, i) => s + i.amount_total, 0);
  const outstanding = totalInvoiced - totalPaid;

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `PKR ${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `PKR ${(n / 1_000).toFixed(0)}K`
      : `PKR ${n.toLocaleString('en-PK', { minimumFractionDigits: 0 })}`;

  const odooSubtitle = (file: (typeof domainFiles)[number]) => {
    const fm = file.frontmatter as Record<string, unknown>;
    if (fm.customer) {
      const total = fm.total ? ` · PKR ${Number(fm.total).toLocaleString('en-PK')}` : '';
      return `${fm.customer}${fm.product ? ` — ${fm.product}` : ''}${total}`;
    }
    // Fall back to parsing the JSON payload block from the body.
    try {
      const m = file.body.match(/```json\s*([\s\S]*?)```/);
      if (m) {
        const p = JSON.parse(m[1]) as Record<string, unknown>;
        if (p.customer) {
          const total = p.total ? ` · PKR ${Number(p.total).toLocaleString('en-PK')}` : '';
          return `${p.customer}${p.product ? ` — ${p.product}` : ''}${total}`;
        }
      }
    } catch { /* ignore */ }
    return null;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#041421]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#d0d6d6] flex items-center gap-3">
            <Building2 className="w-6 h-6 text-violet-400" />
            Odoo — Accounting &amp; Invoices
          </h1>
          <p className="text-sm text-[#4c7273] mt-0.5">
            Live invoice data via Odoo XML-RPC
          </p>
        </div>
        <button
          onClick={() => setShowDraftDialog(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600/30 border border-violet-500/40 text-violet-200 hover:bg-violet-600/50 transition-colors"
          aria-label="Open draft invoice form"
        >
          <Plus className="w-4 h-4" />
          Draft Invoice
        </button>
      </div>

      {/* Revenue summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          title="Total Invoiced"
          value={invoicesLoading ? '…' : fmt(totalInvoiced)}
          subtitle={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
          icon={<Receipt className="w-5 h-5" />}
          gradientFrom="#714b67"
          gradientTo="#a855f7"
        />
        <KpiCard
          title="Total Paid"
          value={invoicesLoading ? '…' : fmt(totalPaid)}
          subtitle={`${invoices.filter((i) => i.state === 'paid').length} paid`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          gradientFrom="#10b981"
          gradientTo="#059669"
        />
        <KpiCard
          title="Outstanding"
          value={invoicesLoading ? '…' : fmt(outstanding)}
          subtitle={`${invoices.filter((i) => i.state !== 'paid' && i.state !== 'draft' && i.state !== 'cancel').length} open`}
          icon={<AlertCircle className="w-5 h-5" />}
          gradientFrom="#f59e0b"
          gradientTo="#d97706"
        />
      </div>

      {/* Invoice table */}
      <section aria-label="Odoo invoices">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Live Invoices
          {!connected && (
            <span className="ml-2 text-rose-400 normal-case font-normal">— offline</span>
          )}
        </h2>
        {invoicesLoading ? (
          <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-12 flex items-center justify-center gap-3 text-[#4c7273] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting to Odoo…
          </div>
        ) : !connected ? (
          <OdooOffline error={invoiceRes?.error} onRetry={() => retryInvoices()} />
        ) : (
          <OdooInvoiceTable invoices={invoices} />
        )}
      </section>

      {/* Pending approval — always visible at top if any exist */}
      {(() => {
        const pending = domainFiles.filter((f) => f.stage === 'Pending_Approval');
        if (filesLoading || pending.length === 0) return null;
        return (
          <section aria-label="Odoo tasks pending approval">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="text-amber-400">Pending Approval</span>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                {pending.length}
              </span>
              <span className="text-slate-600 text-[10px] font-normal normal-case">auto-refreshing every 8s</span>
            </h2>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
              <DomainTaskTable files={pending} onDelete={handleDelete} approvable subtitle={odooSubtitle} />
            </div>
          </section>
        );
      })()}

      {/* All odoo tasks */}
      <section aria-label="Recent Odoo tasks">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          All Odoo Tasks
        </h2>
        {filesLoading ? (
          <div className="rounded-xl border border-[#4c7273]/30 bg-[#042630] p-8 text-center text-[#4c7273] text-sm">
            Loading tasks…
          </div>
        ) : (
          <DomainTaskTable
            files={domainFiles.filter((f) =>
              f.stage !== 'Needs_Action' &&
              f.stage !== 'Plans' &&
              f.stage !== 'Pending_Approval'
            )}
            onDelete={handleDelete}
            approvable
            subtitle={odooSubtitle}
          />
        )}
      </section>

      {/* Draft invoice dialog */}
      {showDraftDialog && (
        <DraftInvoiceDialog onClose={() => setShowDraftDialog(false)} />
      )}
    </div>
  );
}
