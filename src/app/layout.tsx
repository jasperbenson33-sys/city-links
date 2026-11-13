import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Curbside Links — 5th & Mercer',
  description:
    'Hole 1: 5th & Mercer (Par 4 • 72m). Sunlit Walkabout-warm urban street golf — instant tee-off, zero menus.',
  applicationName: 'Curbside Links — 5th & Mercer',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Curbside Links',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#FFE7BA',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
