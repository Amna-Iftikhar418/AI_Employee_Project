import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { VAULT_ROOT } from '@/lib/constants';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safe = path.basename(decodeURIComponent(filename));
  const filepath = path.join(VAULT_ROOT, 'Screenshots', safe);

  if (!filepath.startsWith(path.resolve(path.join(VAULT_ROOT, 'Screenshots')))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await fs.unlink(filepath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safe = path.basename(decodeURIComponent(filename));
  const filepath = path.join(VAULT_ROOT, 'Screenshots', safe);

  // prevent path traversal
  if (!filepath.startsWith(path.resolve(path.join(VAULT_ROOT, 'Screenshots')))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(filepath);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(safe).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  return new Response(new Uint8Array(data), { headers: { 'Content-Type': contentType } });
}
