import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

export async function GET() {
  const screenshotsDir = path.join(VAULT_ROOT, 'Screenshots');
  let entries;
  try {
    entries = await fs.readdir(screenshotsDir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ screenshots: [] });
  }

  const screenshots = entries
    .filter(e => e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name))
    .map(e => `/api/vault/screenshots/${encodeURIComponent(e.name)}`);

  return NextResponse.json({ screenshots });
}
