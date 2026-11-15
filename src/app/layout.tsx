import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Curbside Links — Grand Crosstown Escapade',
  description:
    'Par 18 • 380m Continuous 7-Zone Rooftop-to-Subway Urban Golf Odyssey — instant tee-off, zero menus.',
  applicationName: 'Curbside Links — Grand Crosstown Escapade',
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
