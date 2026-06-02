import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

export async function POST(request: NextRequest) {
  let body: { filepath: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { filepath } = body;
  if (!filepath) return NextResponse.json({ error: 'filepath required' }, { status: 400 });

  const approvedRoot = path.resolve(path.join(VAULT_ROOT, 'Approved', 'linkedin'));
  const normalized = path.resolve(filepath);

  if (!normalized.startsWith(approvedRoot)) {
    return NextResponse.json({ error: 'File must be in Approved/linkedin/' }, { status: 400 });
  }

  try {
    // Update status to completed in frontmatter
    let content = await fs.readFile(normalized, 'utf-8');
    const publishedAt = new Date().toISOString();
    if (/^status:\s*.+/m.test(content)) {
      content = content.replace(/^status:\s*.+/m, 'status: completed');
    }
    if (!/^published_at:/m.test(content)) {
      content = content.replace(/^(---\n)/, `$1published_at: ${publishedAt}\n`);
    }
    await fs.writeFile(normalized, content, 'utf-8');

    // Move to Done/linkedin/
    const doneDir = path.join(VAULT_ROOT, 'Done', 'linkedin');
    await fs.mkdir(doneDir, { recursive: true });
    const dest = path.join(doneDir, path.basename(normalized));
    await fs.rename(normalized, dest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `File operation failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
