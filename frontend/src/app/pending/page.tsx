import type { Metadata } from 'next';
import PendingPage from './_pending';

export const metadata: Metadata = {
  title: 'Pending Approvals | AI Employee',
  description: 'Review and approve AI-generated tasks before they are executed.',
};

export default function Page() {
  return <PendingPage />;
}
