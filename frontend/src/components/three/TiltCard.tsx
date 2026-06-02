'use client';

import { useRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}

export default function TiltCard({ children, className, glowColor = '#86b9b0' }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rx = -((y / rect.height) - 0.5) * 14;
    const ry = ((x / rect.width) - 0.5) * 14;
    const dist = Math.hypot(x / rect.width - 0.5, y / rect.height - 0.5);
    const glowAlpha = Math.max(0, 0.35 - dist * 0.4);
    el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02,1.02,1.02)`;
    el.style.boxShadow = `0 0 28px rgba(${hexToRgb(glowColor)}, ${glowAlpha})`;
  }

  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    el.style.boxShadow = '';
  }

  return (
    <div
      ref={ref}
      className={cn('transition-[transform,box-shadow] duration-150 ease-out', className)}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
    >
      {children}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
