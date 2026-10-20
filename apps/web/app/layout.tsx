import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'FixFlow — Maintenance & field service management', template: '%s · FixFlow' },
  description:
    'FixFlow centralizes maintenance requests, technician work orders, SLAs and asset history for campuses, hospitals, residences and workplaces.',
  applicationName: 'FixFlow',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#F8FAFC',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
