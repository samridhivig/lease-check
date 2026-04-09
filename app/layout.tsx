import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeaseCheck — Rental Contract Analyzer',
  description: 'Upload a rental contract and get a plain-English breakdown of potential issues.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
