import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { VAULT_ROOT } from '@/lib/constants';

const SCRAPES_DIR = path.join(VAULT_ROOT, 'Plans', 'browser');

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safe = path.basename(decodeURIComponent(filename));
  const filepath = path.join(SCRAPES_DIR, safe);

  if (!filepath.startsWith(path.resolve(SCRAPES_DIR))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await fs.unlink(filepath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
