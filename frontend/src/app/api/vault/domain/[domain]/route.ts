import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';
import { parseFrontmatter } from '@/lib/parse';

const STAGES = ['Needs_Action', 'Plans', 'Pending_Approval', 'Approved', 'Done', 'Rejected'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;
  const results = [];

  for (const stage of STAGES) {
    const dir = path.join(VAULT_ROOT, stage, domain);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const files = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name);
    for (const filename of files) {
      const filepath = path.join(dir, filename);
      try {
        const raw = await fs.readFile(filepath, 'utf-8');
        const { data: frontmatter, content: body } = parseFrontmatter(raw);
        const stat = await fs.stat(filepath);
        results.push({
          stage,
          filename,
          filepath,
          frontmatter,
          body,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        // skip
      }
    }
  }

  return NextResponse.json(results);
}
