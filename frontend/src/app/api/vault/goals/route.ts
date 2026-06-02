import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';
import { parseFrontmatter } from '@/lib/parse';

const GOALS_PATH = path.join(VAULT_ROOT, 'Business_Goals.md');

export async function GET() {
  let raw: string;
  try {
    raw = await fs.readFile(GOALS_PATH, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'Business_Goals.md not found' }, { status: 404 });
  }

  const { data: frontmatter, content } = parseFrontmatter(raw);
  return NextResponse.json({ frontmatter, content });
}

function fmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function parseMoney(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, '')) || 0;
}

export async function POST(request: Request) {
  const body = await request.json() as {
    rows: Array<{ period: string; target: string; current: string }>;
  };

  let raw: string;
  try {
    raw = await fs.readFile(GOALS_PATH, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'Business_Goals.md not found' }, { status: 404 });
  }

  let updated = raw;

  for (const row of body.rows) {
    const target = parseMoney(row.target);
    const current = parseMoney(row.current);
    const gap = Math.max(0, target - current);
    const escaped = row.period.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(`^\\|\\s*${escaped}\\s*\\|[^|]+\\|[^|]+\\|[^|]+\\|$`, 'm');
    updated = updated.replace(rowRegex, `| ${row.period} | ${fmt(target)} | ${fmt(current)} | ${fmt(gap)} |`);
  }

  const today = new Date().toISOString().split('T')[0];
  updated = updated.replace(/^last_updated:.*$/m, `last_updated: ${today}`);

  await fs.writeFile(GOALS_PATH, updated, 'utf-8');
  return NextResponse.json({ success: true });
}
