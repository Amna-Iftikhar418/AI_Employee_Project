import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from './constants';

export async function readVaultFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(VAULT_ROOT, relativePath), 'utf-8');
}

export async function scanVaultFolder(folderPath: string): Promise<string[]> {
  const full = path.isAbsolute(folderPath) ? folderPath : path.join(VAULT_ROOT, folderPath);
  let entries;
  try {
    entries = await fs.readdir(full, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => path.join(full, e.name));
}

export async function listDomain(domain: string, stage: string): Promise<string[]> {
  return scanVaultFolder(path.join(VAULT_ROOT, stage, domain));
}

export interface StageCount {
  stage: string;
  count: number;
}

export async function countByStage(domain: string): Promise<StageCount[]> {
  const stages = ['Needs_Action', 'Plans', 'Pending_Approval', 'Approved', 'Done', 'Rejected'];
  return Promise.all(
    stages.map(async stage => ({
      stage,
      count: (await listDomain(domain, stage)).length,
    }))
  );
}
