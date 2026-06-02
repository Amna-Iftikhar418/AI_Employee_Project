import type { Metadata } from 'next';
import BriefingPage from './_briefing';

export const metadata: Metadata = {
  title: 'CEO Briefing | AI Employee',
  description: 'Weekly Monday CEO briefing — revenue, completed tasks, bottlenecks, and proactive suggestions.',
};

export default function Page() {
  return <BriefingPage />;
}
