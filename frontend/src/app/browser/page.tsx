import type { Metadata } from 'next';
import BrowserPage from './_browser';

export const metadata: Metadata = {
  title: 'Browser — Web Automation | AI Employee',
  description: 'Manage Playwright browser automation tasks — navigate, scrape, fill forms, and view screenshots.',
};

export default function Page() {
  return <BrowserPage />;
}
