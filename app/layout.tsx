import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeaseCheck — Free Flemish Residential & Student Lease Checker',
  description: 'Free tool to check supported Flemish residential and student leases against the Woninghuurdecreet 2019 — deposit limits, notice periods, required clauses, and more.',
  openGraph: {
    title: 'LeaseCheck — Free Flemish Residential & Student Lease Checker',
    description: 'Check supported Flemish residential and student leases against the Woninghuurdecreet 2019. Free, open source, nothing stored.',
    url: 'https://lease-check.vercel.app',
    siteName: 'LeaseCheck',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'LeaseCheck — Free Flemish Residential & Student Lease Checker',
    description: 'Check supported Flemish residential and student leases against the Woninghuurdecreet 2019. Free, open source, nothing stored.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-14JX2PV576"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('consent', 'default', {
              analytics_storage: 'granted'
            });
            gtag('config', 'G-14JX2PV576');
          `}
        </Script>
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
