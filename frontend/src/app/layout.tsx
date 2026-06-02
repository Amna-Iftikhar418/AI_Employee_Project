import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import QueryProvider from '@/components/QueryProvider';
import Sidebar from '@/components/Sidebar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'AI Employee Dashboard',
    template: '%s | AI Employee',
  },
  description: 'Autonomous AI Employee — Gmail, WhatsApp, LinkedIn, Odoo automation hub',
  openGraph: {
    title: 'AI Employee Dashboard',
    description: 'Autonomous AI Employee — Gmail, WhatsApp, LinkedIn, Odoo and browser automation hub.',
    type: 'website',
    siteName: 'AI Employee Dashboard',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body className="h-full antialiased bg-[#041421] text-[#d0d6d6]">
        <QueryProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 overflow-y-auto relative">
              {children}
            </main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
