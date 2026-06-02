import type { Metadata } from 'next';
import GmailPage from './_gmail';

export const metadata: Metadata = {
  title: 'Gmail — Email Tasks | AI Employee',
  description: 'View and manage all Gmail email tasks processed by the AI Employee.',
};

export default function Page() {
  return <GmailPage />;
}
