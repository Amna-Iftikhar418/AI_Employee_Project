import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface BriefingRendererProps {
  content: string;
  className?: string;
}

const REVENUE_KW = /revenue|mtd|monthly|income|earned/i;
const BOTTLENECK_KW = /bottleneck|overdue|blocked|stale|open > 7/i;

function HighlightRow({ children, row }: { children: React.ReactNode; row: string }) {
  const isRevenue = REVENUE_KW.test(row);
  const isBottleneck = BOTTLENECK_KW.test(row);
  return (
    <tr
      className={cn(
        isRevenue && 'bg-emerald-500/10',
        isBottleneck && 'bg-amber-500/10'
      )}
    >
      {children}
    </tr>
  );
}

export default function BriefingRenderer({ content, className }: BriefingRendererProps) {
  return (
    <div className={cn('prose prose-invert prose-sm max-w-none', className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent mb-4">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="text-base font-semibold bg-gradient-to-r from-[#86b9b0] to-[#d0d6d6] bg-clip-text text-transparent mt-6 mb-3 border-b border-[#4c7273]/20 pb-2">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-sm font-semibold text-[#d0d6d6] mt-4 mb-2">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="text-sm text-[#4c7273] mb-3 leading-relaxed">{children}</p>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-[#4c7273]/30 my-4 bg-[#042630]">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#041421] border-b border-[#4c7273]/20">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-xs font-semibold text-[#4c7273] uppercase tracking-wide">
              {children}
            </th>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-[#4c7273]/20">{children}</tbody>,
          tr: ({ children }) => {
            const text = String(children);
            return <HighlightRow row={text}>{children}</HighlightRow>;
          },
          td: ({ children }) => (
            <td className="px-4 py-2.5 text-xs text-[#4c7273]">{children}</td>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 mb-3 text-sm text-[#4c7273]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 mb-3 text-sm text-[#4c7273]">{children}</ol>
          ),
          li: ({ children }) => <li className="text-[#4c7273]">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#86b9b0] pl-4 my-3 text-[#4c7273] italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-[#042630] px-1 py-0.5 rounded text-xs font-mono text-[#86b9b0]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-[#041421] rounded-lg p-4 overflow-x-auto text-xs text-[#4c7273] font-mono my-3">
              {children}
            </pre>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[#d0d6d6]">{children}</strong>
          ),
          hr: () => <hr className="border-[#4c7273]/20 my-6" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
