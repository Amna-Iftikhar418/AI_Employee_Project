'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { triggerAction } from '@/lib/api';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'loading' | 'success' | 'error';

interface TriggerButtonProps {
  action: string;
  label: string;
  icon?: React.ReactNode;
  payload?: Record<string, unknown>;
  className?: string;
}

export default function TriggerButton({ action, label, icon, payload, className }: TriggerButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleClick = async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      await triggerAction(action, payload);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        aria-label={label}
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50',
          status === 'success'
            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
            : status === 'error'
            ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
            : 'bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-600/50',
          className
        )}
      >
        {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === 'success' && <CheckCircle2 className="w-4 h-4" />}
        {status === 'error' && <AlertCircle className="w-4 h-4" />}
        {status === 'idle' && icon}
        <span>
          {status === 'success' ? 'Task queued!' : status === 'error' ? 'Failed' : label}
        </span>
      </button>
      {status === 'error' && errorMsg && (
        <p className="text-xs text-rose-400 pl-1">{errorMsg}</p>
      )}
    </div>
  );
}
