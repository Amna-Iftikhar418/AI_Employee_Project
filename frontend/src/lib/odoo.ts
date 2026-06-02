import http from 'http';
import https from 'https';

const ODOO_URL = process.env.ODOO_URL ?? 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB ?? 'odoo';
const ODOO_USERNAME = process.env.ODOO_USERNAME ?? 'admin';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD ?? 'admin';

let _callId = 1;

function post(url: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = lib.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as { result?: unknown; error?: { message: string; data?: { message?: string } } };
          if (json.error) reject(new Error(json.error.data?.message || json.error.message));
          else resolve(json.result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('Odoo request timed out')); });
    req.write(payload);
    req.end();
  });
}

function rpc(service: string, method: string, args: unknown[]): Promise<unknown> {
  return post(`${ODOO_URL}/jsonrpc`, {
    jsonrpc: '2.0',
    method: 'call',
    id: _callId++,
    params: { service, method, args },
  });
}

export async function odooLogin(): Promise<number> {
  const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}]);
  if (typeof uid !== 'number' || uid === 0) throw new Error('Odoo authentication failed');
  return uid;
}

export async function odooCall(model: string, method: string, args: unknown[]): Promise<unknown> {
  const uid = await odooLogin();
  return rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, model, method, args]);
}

export async function odooSearchRead(
  model: string,
  domain: unknown[],
  fields: string[],
  opts: { limit?: number; order?: string } = {}
): Promise<unknown[]> {
  const uid = await odooLogin();
  return rpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_PASSWORD,
    model, 'search_read',
    [domain],
    { fields, ...opts },
  ]) as Promise<unknown[]>;
}

export interface OdooInvoice {
  id: number;
  name: string;
  partner_id: [number, string];
  amount_total: number;
  state: string;
  invoice_date: string | false;
}

export async function listInvoices(): Promise<OdooInvoice[]> {
  const uid = await odooLogin();
  const records = await rpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_PASSWORD,
    'account.move', 'search_read',
    [[['move_type', 'in', ['out_invoice', 'out_refund']]]],
    { fields: ['name', 'partner_id', 'amount_total', 'state', 'invoice_date'], limit: 100, order: 'invoice_date desc' },
  ]);
  return records as OdooInvoice[];
}
