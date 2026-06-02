import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

const DOMAINS = ['email', 'whatsapp', 'linkedin', 'social', 'odoo', 'browser', 'scheduler'];
const STAGES = ['Needs_Action', 'Plans', 'Pending_Approval', 'Approved', 'Done', 'Rejected'];

async function stageInfo(domain: string, stage: string) {
  const dir = path.join(VAULT_ROOT, stage, domain);
  let files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    files = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => path.join(dir, e.name));
  } catch {
    return { count: 0, lastModified: null };
  }

  if (files.length === 0) return { count: 0, lastModified: null };

  const stats = await Promise.all(files.map(f => fs.stat(f).catch(() => null)));
  const mtimes = stats.filter(Boolean).map(s => s!.mtime.getTime());
  return {
    count: files.length,
    lastModified: mtimes.length > 0 ? new Date(Math.max(...mtimes)).toISOString() : null,
  };
}

export async function GET() {
  const matrix = await Promise.all(
    DOMAINS.map(async domain => {
      const stagesData = await Promise.all(
        STAGES.map(async stage => ({ stage, ...(await stageInfo(domain, stage)) }))
      );
      const stages = Object.fromEntries(stagesData.map(({ stage, count, lastModified }) => [stage, { count, lastModified }]));
      return { domain, stages };
    })
  );

  return NextResponse.json(matrix);
}
