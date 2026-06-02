import { NextRequest, NextResponse } from 'next/server';
import { odooCall, odooSearchRead } from '@/lib/odoo';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (isNaN(invoiceId)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    const records = await odooSearchRead(
      'account.move',
      [['id', '=', invoiceId]],
      ['state'],
      { limit: 1 }
    ) as Array<{ state: string }>;

    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const state = records[0].state;
    if (state !== 'draft') {
      return NextResponse.json(
        { error: `Only draft invoices can be deleted. This invoice is "${state}".` },
        { status: 422 }
      );
    }

    await odooCall('account.move', 'unlink', [[invoiceId]]);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
