import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

// VAULT_ROOT = <project>/vault/AI_Employee_Vault → project root is two levels up.
const PROJECT_ROOT = path.resolve(VAULT_ROOT, '..', '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const GRAPH_BASE = 'https://graph.facebook.com';

interface TokenStatus {
  configured: boolean;   // META_PAGE_ACCESS_TOKEN present in .env
  valid: boolean;        // Graph API accepts the token right now
  expired: boolean;      // failure is specifically an expiry/session error
  expiresAt: string | null; // ISO timestamp the token expires (null = unknown / never)
  message: string;       // human-readable summary (never contains the token)
  checkedAt: string;
}

/** Read a single key from the project-root .env without exposing the value. */
async function readEnvValue(key: string): Promise<string> {
  let text: string;
  try {
    text = await fs.readFile(ENV_FILE, 'utf-8');
  } catch {
    return '';
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes if present
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val;
  }
  return '';
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const apiVersion =
    (await readEnvValue('META_GRAPH_API_VERSION')) || 'v21.0';
  const token =
    process.env.META_PAGE_ACCESS_TOKEN ||
    (await readEnvValue('META_PAGE_ACCESS_TOKEN'));

  if (!token) {
    const status: TokenStatus = {
      configured: false,
      valid: false,
      expired: false,
      expiresAt: null,
      message: 'META_PAGE_ACCESS_TOKEN is not set in .env',
      checkedAt,
    };
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Primary check: does the Graph API accept the token? (mirrors the executor's _validate_token)
  try {
    const meUrl = `${GRAPH_BASE}/${apiVersion}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const meRes = await fetch(meUrl, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const meData = await meRes.json();

    if (meData?.error) {
      const errMsg: string = meData.error.message ?? 'invalid token';
      const expired = /expired|session has expired|code\s*190/i.test(errMsg) ||
        meData.error.code === 190;
      const status: TokenStatus = {
        configured: true,
        valid: false,
        expired,
        expiresAt: null,
        message: errMsg,
        checkedAt,
      };
      return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Token is valid. Best-effort: ask debug_token when the token expires.
    let expiresAt: string | null = null;
    try {
      const dbgUrl = `${GRAPH_BASE}/${apiVersion}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
      const dbgRes = await fetch(dbgUrl, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      const dbgData = await dbgRes.json();
      const expUnix = dbgData?.data?.expires_at;
      if (typeof expUnix === 'number' && expUnix > 0) {
        expiresAt = new Date(expUnix * 1000).toISOString();
      }
    } catch {
      // expiry is informational only — ignore failures
    }

    const status: TokenStatus = {
      configured: true,
      valid: true,
      expired: false,
      expiresAt,
      message: 'Token valid',
      checkedAt,
    };
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status: TokenStatus = {
      configured: true,
      valid: false,
      expired: false,
      expiresAt: null,
      message: `Could not reach Meta Graph API: ${err instanceof Error ? err.message : String(err)}`,
      checkedAt,
    };
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  }
}
