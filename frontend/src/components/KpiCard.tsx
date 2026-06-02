import Link from 'next/link';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleHref?: string;
  icon?: React.ReactNode;
  gradientFrom?: string;
  gradientTo?: string;
  className?: string;
  href?: string;
  onClick?: () => void;
}

export default function KpiCard({
  title,
  value,
  subtitle,
  subtitleHref,
  icon,
  gradientFrom = '#86b9b0',
  gradientTo = '#4c7273',
  className,
  href,
  onClick,
}: KpiCardProps) {
  const baseClass = cn(
    'relative overflow-hidden rounded-2xl bg-[#042630] border border-[#4c7273]/30 backdrop-blur-xl p-5 flex gap-4 transition-all duration-200',
    (href || onClick) && 'hover:border-[#86b9b0]/55 hover:shadow-[0_0_25px_rgba(134,185,176,0.2)] cursor-pointer',
    className
  );

  const stripe = (
    <div
      className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-2xl"
      style={{ background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})` }}
    />
  );

  const iconEl = icon && (
    <div
      className="relative z-[1] shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-[#041421] border border-[#4c7273]/30"
    >
      <span style={{ color: gradientFrom }}>{icon}</span>
    </div>
  );

  const subtitleEl = subtitle && (
    subtitleHref ? (
      <Link
        href={subtitleHref}
        className="relative z-[2] text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1 block truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {subtitle}
      </Link>
    ) : (
      <p className="text-xs text-[#4c7273] mt-1 truncate">{subtitle}</p>
    )
  );

  const content = (
    <div className="relative z-[1] min-w-0">
      <p className="text-xs font-medium text-[#4c7273] uppercase tracking-wide truncate">{title}</p>
      <p className="text-3xl font-black text-[#d0d6d6] mt-1 leading-none">{value}</p>
      {subtitleEl}
    </div>
  );

  if (href) {
    return (
      <div className={baseClass}>
        <Link href={href} className="absolute inset-0 z-[0]" aria-label={`Go to ${title}`} />
        {stripe}
        {iconEl}
        {content}
      </div>
    );
  }

  if (onClick) {
    return (
      <button className={cn(baseClass, 'text-left w-full')} onClick={onClick} aria-label={`Filter by ${title}`}>
        {stripe}
        {iconEl}
        {content}
      </button>
    );
  }

  return (
    <div className={baseClass}>
      {stripe}
      {iconEl}
      {content}
    </div>
  );
}
