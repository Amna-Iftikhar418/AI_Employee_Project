import type { Metadata } from 'next';
import WhatsAppPage from './_whatsapp';

export const metadata: Metadata = {
  title: 'WhatsApp — Message Tasks | AI Employee',
  description: 'View and manage all WhatsApp message tasks processed by the AI Employee.',
};

export default function Page() {
  return <WhatsAppPage />;
}
