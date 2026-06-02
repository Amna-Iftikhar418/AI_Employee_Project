import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

export async function GET() {
  const briefingsDir = path.join(VAULT_ROOT, 'Briefings');
  let entries;
  try {
    entries = await fs.readdir(briefingsDir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ dates: [] });
  }

  const dates = entries
    .filter(e => e.isFile() && e.name.endsWith('.md') && /^\d{4}-\d{2}-\d{2}/.test(e.name))
    .map(e => ({ filename: e.name, date: e.name.slice(0, 10) }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ dates });
}
