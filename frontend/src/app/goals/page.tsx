import type { Metadata } from 'next';
import GoalsPage from './_goals';

export const metadata: Metadata = {
  title: 'Business Goals & Metrics | AI Employee',
  description: 'Revenue targets, key metrics, active projects, subscriptions, and upcoming deadlines for Amna AI Solutions.',
};

export default function Page() {
  return <GoalsPage />;
}
