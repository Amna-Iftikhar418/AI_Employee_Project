import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';
import { parseFrontmatter } from '@/lib/parse';

export async function GET() {
  const pendingRoot = path.join(VAULT_ROOT, 'Pending_Approval');
  const results = [];

  let domains: string[];
  try {
    const entries = await fs.readdir(pendingRoot, { withFileTypes: true });
    domains = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return NextResponse.json([]);
  }

  for (const domain of domains) {
    const domainDir = path.join(pendingRoot, domain);
    let files: string[];
    try {
      const entries = await fs.readdir(domainDir, { withFileTypes: true });
      files = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name);
    } catch {
      continue;
    }

    for (const filename of files) {
      const filepath = path.join(domainDir, filename);
      try {
        const raw = await fs.readFile(filepath, 'utf-8');
        const { data: frontmatter, content: body } = parseFrontmatter(raw);
        const stat = await fs.stat(filepath);
        results.push({
          domain,
          filename,
          filepath,
          frontmatter,
          body,
          createdAt: stat.birthtime.toISOString(),
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  return NextResponse.json(results);
}
