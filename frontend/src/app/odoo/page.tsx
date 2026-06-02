import type { Metadata } from 'next';
import OdooPage from './_odoo';

export const metadata: Metadata = {
  title: 'Odoo — Accounting & Invoices | AI Employee',
  description: 'Live Odoo invoice data, revenue summary, and draft invoice workflow.',
};

export default function Page() {
  return <OdooPage />;
}
