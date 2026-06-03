import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

function yamlLiteral(s: string): string {
  return '|\n' + s.split('\n').map((l) => `  ${l}`).join('\n');
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const platform: string = typeof body.platform === 'string' ? body.platform : 'facebook';
  const topic: string = typeof body.topic === 'string' ? body.topic.trim() : '';
  const facebook: string = typeof body.facebook === 'string' ? body.facebook.trim() : '';
  const instagram: string = typeof body.instagram === 'string' ? body.instagram.trim() : '';

  if (!facebook && !instagram) {
    return NextResponse.json({ error: 'At least one of facebook or instagram content is required' }, { status: 400 });
  }

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `SOCIAL_POST_${ts}.md`;
  const destDir = path.join(VAULT_ROOT, 'Pending_Approval', 'social');

  try {
    await fs.mkdir(destDir, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to create directory: ${msg}` }, { status: 500 });
  }

  const platforms = platform === 'facebook' ? 'facebook'
    : platform === 'instagram' ? 'instagram'
    : 'facebook, instagram';

  const content = `---
type: social_post
platforms: ${platforms}
topic: "${topic.replace(/"/g, '\\"')}"
message: ${yamlLiteral(facebook)}
caption: ${yamlLiteral(instagram)}
created: ${now.toISOString()}
status: pending
---

## Facebook Post

${facebook}

---

## Instagram Caption

${instagram}
`;

  try {
    await fs.writeFile(path.join(destDir, filename), content, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to write file: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, taskFile: filename });
}
