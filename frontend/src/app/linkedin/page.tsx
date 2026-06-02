import type { Metadata } from 'next';
import LinkedInPage from './_linkedin';

export const metadata: Metadata = {
  title: 'LinkedIn — Post Management | AI Employee',
  description: 'Manage AI-generated LinkedIn posts — create, review, approve, and track published history.',
};

export default function Page() {
  return <LinkedInPage />;
}
