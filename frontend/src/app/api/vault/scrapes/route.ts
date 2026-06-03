import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

export async function GET() {
  const plansDir = path.join(VAULT_ROOT, 'Plans', 'browser');
  let entries;
  try {
    entries = await fs.readdir(plansDir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ scrapes: [] });
  }

  const files = entries
    .filter(e => e.isFile() && e.name.startsWith('SCRAPE_') && e.name.endsWith('.txt'))
    .map(e => e.name)
    .sort()
    .reverse();

  const scrapes = await Promise.all(
    files.map(async (name) => {
      const filePath = path.join(plansDir, name);
      let content = '';
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        content = raw.trim();
      } catch {
        content = '(could not read file)';
      }
      const stat = await fs.stat(filePath).catch(() => null);
      return {
        name,
        content,
        size: stat?.size ?? 0,
        createdAt: stat?.mtime?.toISOString() ?? '',
      };
    })
  );

  return NextResponse.json({ scrapes });
}
