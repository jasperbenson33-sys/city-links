import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Curbside Links — 5th & Mercer',
    short_name: 'Curbside Links',
    description:
      'Hole 1: 5th & Mercer (Par 4 • 72m). Sunlit urban street golf with Walkabout warmth and Coffee Golf clarity.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFE7BA',
    theme_color: '#FFE7BA',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
