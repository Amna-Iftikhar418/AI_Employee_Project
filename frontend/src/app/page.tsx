import type { Metadata } from 'next';
import DashboardPage from './_dashboard';

export const metadata: Metadata = {
  title: 'AI Employee Dashboard',
  description:
    'Autonomous AI Employee — monitor Gmail, WhatsApp, LinkedIn, Odoo and browser automation from a single hub.',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AI Employee Dashboard',
  applicationCategory: 'BusinessApplication',
  description:
    'Autonomous AI Employee that monitors Gmail and WhatsApp, processes messages, manages LinkedIn posts, and integrates with Odoo accounting.',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0' },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DashboardPage />
    </>
  );
}
