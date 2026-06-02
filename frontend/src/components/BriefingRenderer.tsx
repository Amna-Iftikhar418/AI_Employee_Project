'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface BriefingRendererProps {
  content: string;
  className?: string;
}

const REVENUE_KW = /revenue|mtd|monthly|income|earned/i;
const BOTTLENECK_KW = /bottleneck|overdue|blocked|stale|open > 7/i;

function sanitize(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !/^\s*\|[\s\-:|]+\|\s*$/.test(line))
    .join('\n');
}

function HighlightRow({ children, row }: { children: React.ReactNode; row: string }) {
  const isRevenue = REVENUE_KW.test(row);
  const isBottleneck = BOTTLENECK_KW.test(row);
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-[#041421]/60',
        isRevenue && 'bg-emerald-500/8',
        isBottleneck && 'bg-amber-500/8'
      )}
    >
      {children}
    </tr>
  );
}

export default function BriefingRenderer({ content, className }: BriefingRendererProps) {
  return (
    <div className={cn('max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-300 via-indigo-200 to-[#86b9b0] bg-clip-text text-transparent mb-6 mt-2 leading-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-[#d0d6d6] mt-8 mb-3 pb-2.5 border-b border-[#4c7273]/25 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-[#86b9b0] mt-5 mb-2 uppercase tracking-widest">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-[#a8b8b8] mb-4 leading-7">{children}</p>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border border-[#4c7273]/25 my-5 shadow-sm">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#041421]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-5 py-3 text-left text-[11px] font-bold text-[#4c7273] uppercase tracking-widest border-b border-[#4c7273]/25 whitespace-nowrap">
              {children}
            </th>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#4c7273]/15 bg-[#042630]">{children}</tbody>
          ),
          tr: ({ children }) => {
            const text = String(children);
            return <HighlightRow row={text}>{children}</HighlightRow>;
          },
          td: ({ children }) => (
            <td className="px-5 py-3 text-sm text-[#a8b8b8] align-top">{children}</td>
          ),
          ul: ({ children }) => (
            <ul className="space-y-2 mb-4 pl-1 list-none">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-2 mb-4 pl-5 list-decimal text-sm text-[#a8b8b8] leading-6">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="flex items-start gap-2.5 text-sm text-[#a8b8b8] leading-6">
              <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-[#4c7273] shrink-0" />
              <span>{children}</span>
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3px] border-violet-500/50 pl-4 my-4 text-[#a8b8b8] italic bg-violet-500/5 py-3 pr-4 rounded-r-lg">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-[#041421] px-1.5 py-0.5 rounded text-xs font-mono text-[#86b9b0] border border-[#4c7273]/20">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-[#041421] rounded-xl border border-[#4c7273]/20 p-4 overflow-x-auto text-xs text-[#a8b8b8] font-mono my-4">
              {children}
            </pre>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[#d0d6d6]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#86b9b0]">{children}</em>
          ),
          hr: () => (
            <div className="my-8 flex items-center gap-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#4c7273]/40 to-transparent" />
            </div>
          ),
        }}
      >
        {sanitize(content)}
      </ReactMarkdown>
    </div>
  );
}
