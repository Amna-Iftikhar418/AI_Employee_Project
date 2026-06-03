import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { VAULT_ROOT } from '@/lib/constants';

const ACTION_MAP: Record<string, { domain: string; type: string }> = {
  linkedin: { domain: 'linkedin', type: 'linkedin_task' },
  briefing: { domain: 'scheduler', type: 'briefing_task' },
  social: { domain: 'social', type: 'social_task' },
  browser: { domain: 'browser', type: 'browser_task' },
  odoo: { domain: 'odoo', type: 'odoo_task' },
  cleanup: { domain: 'scheduler', type: 'cleanup_task' },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  const mapping = ACTION_MAP[action];
  if (!mapping) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  let payload: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) payload = JSON.parse(text);
  } catch {
    // empty body is fine
  }

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `TASK_${mapping.domain}_trigger_${ts}.md`;
  const destDir = path.join(VAULT_ROOT, 'Needs_Action', mapping.domain);
  try {
    await fs.mkdir(destDir, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to create task directory: ${msg}` }, { status: 500 });
  }

  const payloadBlock = Object.keys(payload).length > 0
    ? `\n## Payload\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`
    : '';

  // Surface a single-valued `platform` selector into frontmatter so watchers can
  // read it directly (e.g. social post drafts scoped to one network).
  const platform = typeof payload.platform === 'string' ? payload.platform : '';
  const platformLine = platform ? `\nplatform: "${platform}"` : '';

  // Surface `topic` so the skill knows what to write the post about.
  const topic = typeof payload.topic === 'string' ? payload.topic : '';
  const topicLine = topic ? `\ntopic: "${topic.replace(/"/g, '\\"')}"` : '';

  // For odoo invoice tasks, surface key fields into frontmatter using the exact
  // key names that odoo_executor.py reads (partner_name, partner_email, amount).
  let odooFrontmatter = '';
  let odooTableBlock = '';
  if (action === 'odoo' && payload.customer) {
    const qty = typeof payload.quantity === 'number' ? payload.quantity : 1;
    const unitPrice = typeof payload.unit_price === 'number' ? payload.unit_price : 0;
    const total = typeof payload.total === 'number' ? payload.total : qty * unitPrice;
    odooFrontmatter =
      `\npartner_name: "${payload.customer}"` +
      (payload.product ? `\nproduct: "${payload.product}"` : '') +
      (payload.email ? `\npartner_email: "${payload.email}"` : '') +
      (total ? `\namount: ${total}` : '') +
      (qty !== 1 ? `\nquantity: ${qty}` : '') +
      (unitPrice ? `\nunit_price: ${unitPrice}` : '');
    // Markdown table so odoo_executor._parse_table_field() can also find the values.
    const invoiceDate = now.toISOString().slice(0, 10);
    odooTableBlock = `\n## Invoice Details\n\n| Field | Value |\n|-------|-------|\n| Customer | ${payload.customer} |\n| Email | ${payload.email ?? ''} |\n| Product | ${payload.product ?? ''} |\n| Quantity | ${qty} |\n| Unit Price | ${unitPrice} |\n| Total | ${total} |\n| Invoice Date | ${invoiceDate} |\n`;
  }

  // odoo trigger files use action: create_invoice so odoo_executor recognises them.
  const actionField = action === 'odoo' ? 'create_invoice'
    : action === 'browser' && typeof payload.action === 'string' ? payload.action
    : action;

  // For browser tasks, surface url and the real action into frontmatter so the
  // card component can display them without parsing the body JSON.
  let browserFrontmatter = '';
  if (action === 'browser') {
    const bUrl = typeof payload.url === 'string' ? payload.url : '';
    const bDesc = typeof payload.description === 'string' ? payload.description : '';
    if (bUrl) browserFrontmatter += `\nurl: "${bUrl}"`;
    if (bDesc) browserFrontmatter += `\ndescription: "${bDesc.replace(/"/g, '\\"')}"`;
  }

  const content = `---
type: ${mapping.type}
source: dashboard
action: ${actionField}
triggered_by: dashboard
timestamp: ${now.toISOString()}${platformLine}${topicLine}${odooFrontmatter}${browserFrontmatter}
status: pending
---

# Trigger: ${action}

Triggered manually from the AI Employee Dashboard at ${now.toLocaleString()}.
${odooTableBlock}${payloadBlock}`;

  try {
    await fs.writeFile(path.join(destDir, filename), content, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to write task file: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, taskFile: filename });
}
