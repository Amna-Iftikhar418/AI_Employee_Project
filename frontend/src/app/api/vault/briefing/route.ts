import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

export async function GET(request: NextRequest) {
  const briefingsDir = path.join(VAULT_ROOT, 'Briefings');
  let entries;
  try {
    entries = await fs.readdir(briefingsDir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ error: 'No briefings found' }, { status: 404 });
  }

  const mdFiles = entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => e.name)
    .sort()
    .reverse();

  if (mdFiles.length === 0) {
    return NextResponse.json({ error: 'No briefings found' }, { status: 404 });
  }

  const dateParam = new URL(request.url).searchParams.get('date');
  let filename: string;
  if (dateParam) {
    const match = mdFiles.find(f => f.startsWith(dateParam));
    if (!match) {
      return NextResponse.json({ error: `No briefing for date: ${dateParam}` }, { status: 404 });
    }
    filename = match;
  } else {
    filename = mdFiles[0];
  }

  const content = await fs.readFile(path.join(briefingsDir, filename), 'utf-8');
  const date = filename.slice(0, 10);

  return NextResponse.json({ filename, date, content });
}
