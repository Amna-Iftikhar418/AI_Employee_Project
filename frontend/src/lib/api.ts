const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ── vault reads ───────────────────────────────────────────────────────────────

export interface PendingFile {
  domain: string;
  filename: string;
  filepath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  createdAt: string;
}

export function fetchPending(): Promise<PendingFile[]> {
  return get('/vault/pending');
}

export interface DomainMatrix {
  domain: string;
  stages: Record<string, { count: number; lastModified: string | null }>;
}

export function fetchTasks(): Promise<DomainMatrix[]> {
  return get('/vault/tasks');
}

export type LogStatus = 'success' | 'error' | 'warning' | 'info';

export interface LogEntry {
  time: string;
  domain: string;
  action: string;
  label: string;
  status: LogStatus;
  result: string;
  raw: string;
}

export function fetchLogs(date?: string): Promise<LogEntry[]> {
  const qs = date ? `?date=${date}` : '';
  return get(`/vault/logs${qs}`);
}

export interface BriefingFile {
  filename: string;
  date: string;
  content: string;
}

export function fetchBriefing(date?: string): Promise<BriefingFile> {
  return get(date ? `/vault/briefing?date=${date}` : '/vault/briefing');
}

export interface BriefingListItem {
  filename: string;
  date: string;
}

export function fetchBriefingList(): Promise<{ dates: BriefingListItem[] }> {
  return get('/vault/briefing/list');
}

export interface GoalsData {
  frontmatter: Record<string, unknown>;
  content: string;
}

export function fetchGoals(): Promise<GoalsData> {
  return get('/vault/goals');
}

export function saveGoalsRevenue(
  rows: Array<{ period: string; target: string; current: string }>,
): Promise<{ success: boolean }> {
  return post('/vault/goals', { rows });
}

export interface DomainFile {
  stage: string;
  filename: string;
  filepath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  createdAt: string;
  modifiedAt: string;
}

export function fetchDomain(domain: string): Promise<DomainFile[]> {
  return get(`/vault/domain/${domain}`);
}

export interface OdooInvoice {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  amount_total: number;
  state: string;
  invoice_date: string | false;
}

export interface OdooInvoicesResponse {
  invoices?: OdooInvoice[];
  error?: string;
  connected: boolean;
}

export function fetchOdooInvoices(): Promise<OdooInvoicesResponse> {
  return get('/odoo/invoices');
}

export async function deleteOdooInvoice(id: number): Promise<void> {
  const res = await fetch(`/api/odoo/invoices/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Delete failed (${res.status})`);
  }
}

export interface HealthResponse {
  mcp: 'ok' | 'down';
  timestamp: string;
}

export function fetchHealth(): Promise<HealthResponse> {
  return get('/health');
}

export interface ScreenshotsResponse {
  screenshots: string[];
}

export function fetchScreenshots(): Promise<ScreenshotsResponse> {
  return get('/vault/screenshots');
}

export interface SocialTokenStatus {
  configured: boolean;
  valid: boolean;
  expired: boolean;
  expiresAt: string | null;
  message: string;
  checkedAt: string;
}

export function fetchSocialTokenStatus(): Promise<SocialTokenStatus> {
  return get('/social/token-status');
}

// ── actions ───────────────────────────────────────────────────────────────────

export function approvePending(
  filepath: string,
  content?: string,
  imageUrl?: string,
): Promise<{ success: boolean }> {
  return post('/approve', { filepath, content, imageUrl });
}

export function rejectPending(filepath: string, reason?: string): Promise<{ success: boolean }> {
  return post('/reject', { filepath, reason });
}

export function markLinkedInPublished(filepath: string): Promise<{ success: boolean }> {
  return post('/linkedin/mark-published', { filepath });
}

export function triggerAction(action: string, payload?: Record<string, unknown>): Promise<{ success: boolean; taskFile?: string }> {
  return post(`/trigger/${action}`, payload);
}

export function deleteVaultFile(filepath: string): Promise<{ success: boolean }> {
  return fetch(`${BASE}/vault/file`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filepath }),
  }).then((r) => {
    if (!r.ok) throw new Error(`DELETE /vault/file failed: ${r.status}`);
    return r.json() as Promise<{ success: boolean }>;
  });
}
