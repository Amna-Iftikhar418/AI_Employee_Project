import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

/**
 * Set (or insert) the `image_url` field inside the YAML frontmatter only,
 * leaving block-scalar message/caption bodies untouched.
 */
function setImageUrl(raw: string, imageUrl: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  const fm = raw.slice(0, end);
  const rest = raw.slice(end);
  const line = `image_url: "${imageUrl.replace(/"/g, '\\"')}"`;
  const patched = /^image_url:.*$/m.test(fm)
    ? fm.replace(/^image_url:.*$/m, line)
    : `${fm}\n${line}`;
  return patched + rest;
}

export async function POST(request: NextRequest) {
  let body: { filepath: string; content?: string; imageUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { filepath, content, imageUrl } = body;
  if (!filepath) return NextResponse.json({ error: 'filepath required' }, { status: 400 });

  const pendingRoot = path.resolve(path.join(VAULT_ROOT, 'Pending_Approval'));
  const needsActionRoot = path.resolve(path.join(VAULT_ROOT, 'Needs_Action'));
  const normalized = path.resolve(filepath);

  if (!normalized.startsWith(pendingRoot) && !normalized.startsWith(needsActionRoot)) {
    return NextResponse.json({ error: 'Invalid filepath' }, { status: 400 });
  }

  try {
    if (content !== undefined) {
      await fs.writeFile(normalized, content, 'utf-8');
    } else if (imageUrl !== undefined && imageUrl !== '') {
      const raw = await fs.readFile(normalized, 'utf-8');
      await fs.writeFile(normalized, setImageUrl(raw, imageUrl), 'utf-8');
    }

    const sourceRoot = normalized.startsWith(pendingRoot) ? pendingRoot : needsActionRoot;
    const relative = path.relative(sourceRoot, normalized);
    const dest = path.join(VAULT_ROOT, 'Approved', relative);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(normalized, dest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `File operation failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
