import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Curbside Links',
    short_name: 'Curbside Links',
    description:
      'Sunlit 3D urban mini-golf across a procedural city island. Sink all 5 flags in any order.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFE7BA',
    theme_color: '#FFD89C',
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
