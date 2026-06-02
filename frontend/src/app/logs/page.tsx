import type { Metadata } from 'next';
import LogsPage from './_logs';

export const metadata: Metadata = {
  title: 'System Logs | AI Employee',
  description: 'Real-time and historical activity logs from all AI Employee domains.',
};

export default function Page() {
  return <LogsPage />;
}
