import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';
import { parseLogFile } from '@/lib/parse';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }
  const date = rawDate;

  const logPath = path.join(VAULT_ROOT, 'Logs', `log_${date}.md`);
  let content: string;
  try {
    content = await fs.readFile(logPath, 'utf-8');
  } catch {
    return NextResponse.json([]);
  }

  return NextResponse.json(parseLogFile(content));
}
