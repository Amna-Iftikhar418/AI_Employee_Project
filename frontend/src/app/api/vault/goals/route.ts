import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';
import { parseFrontmatter } from '@/lib/parse';

export async function GET() {
  const goalsPath = path.join(VAULT_ROOT, 'Business_Goals.md');
  let raw: string;
  try {
    raw = await fs.readFile(goalsPath, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'Business_Goals.md not found' }, { status: 404 });
  }

  const { data: frontmatter, content } = parseFrontmatter(raw);
  return NextResponse.json({ frontmatter, content });
}
