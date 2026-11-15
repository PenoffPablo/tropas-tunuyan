/** @type {import('next').NextConfig} */

/** Host del proyecto Supabase (para optimizar imágenes de Storage con next/image). */
function supabaseHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname || null;
  } catch {
    return null;
  }
}

const host = supabaseHostname();

const supabaseOrigen = host ? `https://${host}` : 'https://*.supabase.co';
const esDev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy. 'unsafe-inline' en scripts es necesario porque el
 * catálogo es estático (ISR) y Next inyecta scripts inline de hidratación (los
 * nonces exigen render dinámico). Igual bloquea scripts y conexiones de otros
 * orígenes, objetos embebidos, <base> ajenos y que el sitio se muestre en iframes.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigen}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigen} ${supabaseOrigen.replace('https://', 'wss://')}`,
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(esDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: host || '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async redirects() {
    // La raíz y /catalogo eran páginas duplicadas: el catálogo es la portada.
    return [{ source: '/', destination: '/catalogo', permanent: true }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

module.exports = nextConfig;
