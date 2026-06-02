import type { Metadata } from 'next';
import SocialPage from './_social';

export const metadata: Metadata = {
  title: 'Social Media — Facebook & Instagram | AI Employee',
  description: 'Manage AI-generated Facebook and Instagram posts — create, review, and track published history.',
};

export default function Page() {
  return <SocialPage />;
}
