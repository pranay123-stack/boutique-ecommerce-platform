import type { Metadata, Viewport } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import './globals.css';
import { Providers } from '@/providers';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Boutique';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'),
  title: {
    default: `${SITE_NAME} — Hand-finished pieces, made in small batches`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'A boutique of hand-finished clothing, accessories and homeware. Small-batch production, considered materials, shipped worldwide.',
  keywords: ['boutique', 'silk', 'linen', 'cashmere', 'handmade', 'small batch'],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Hand-finished pieces`,
    description: 'Hand-finished clothing, accessories and homeware, made in small batches.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfcfa' },
    { media: '(prefers-color-scheme: dark)', color: '#191614' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
