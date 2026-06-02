import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

export async function DELETE(request: NextRequest) {
  let body: { filepath: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { filepath } = body;
  if (!filepath) return NextResponse.json({ error: 'filepath required' }, { status: 400 });

  const normalized = path.resolve(filepath);
  const vaultRoot = path.resolve(VAULT_ROOT);

  if (!normalized.startsWith(vaultRoot)) {
    return NextResponse.json({ error: 'Invalid filepath' }, { status: 403 });
  }

  try {
    await fs.unlink(normalized);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
