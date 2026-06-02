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

  const pendingRoot = path.resolve(path.join(VAULT_ROOT, 'Pending_Approval'));
  const needsActionRoot = path.resolve(path.join(VAULT_ROOT, 'Needs_Action'));
  const normalized = path.resolve(filepath);

  if (!normalized.startsWith(pendingRoot) && !normalized.startsWith(needsActionRoot)) {
    return NextResponse.json({ error: 'Invalid filepath' }, { status: 400 });
  }

  try {
    const sourceRoot = normalized.startsWith(pendingRoot) ? pendingRoot : needsActionRoot;
    const relative = path.relative(sourceRoot, normalized);
    const dest = path.join(VAULT_ROOT, 'Rejected', relative);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(normalized, dest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `File operation failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
