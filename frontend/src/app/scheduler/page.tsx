import type { Metadata } from 'next';
import SchedulerPage from './_scheduler';

export const metadata: Metadata = {
  title: 'Scheduler — Automated Jobs | AI Employee',
  description: 'View scheduled jobs, manually trigger tasks, and review automation history.',
};

export default function Page() {
  return <SchedulerPage />;
}
