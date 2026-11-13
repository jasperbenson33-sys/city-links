import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Curbside Links',
  description:
    'Sunlit 3D urban mini-golf across a procedural city island. Sink all 5 flags in any order.',
  applicationName: 'Curbside Links',
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
  themeColor: '#FFD89C',
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
