import { NextResponse } from 'next/server';
import { listInvoices } from '@/lib/odoo';

export async function GET() {
  try {
    const invoices = await listInvoices();
    return NextResponse.json({ invoices, connected: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message, connected: false });
  }
}
