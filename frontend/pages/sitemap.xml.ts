import type { GetServerSideProps } from 'next';

const STATIC_LAST_MOD = '2026-02-26T00:00:00.000Z';

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

function getConfiguredSiteUrl(): string | null {
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return envSiteUrl ? normalizeSiteUrl(envSiteUrl) : null;
}

function getBaseUrl(headers: RequestHeaders): string {
  const configuredSiteUrl = getConfiguredSiteUrl();
  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  const protocolHeader = headers['x-forwarded-proto'];
  const hostHeader = headers['x-forwarded-host'] || headers.host;
  const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader || 'http';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || 'localhost:3001';
  return normalizeSiteUrl(`${protocol}://${host}`);
}

type RequestHeaders = {
  [key: string]: string | string[] | undefined;
};

interface SitemapEntry {
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}

const SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.4' },
  { path: '/terms', changefreq: 'monthly', priority: '0.4' },
];

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const baseUrl = getBaseUrl(req.headers as RequestHeaders);
  const lastmod = STATIC_LAST_MOD;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_ENTRIES.map(
  ({ path, changefreq, priority }) => `  <url>
    <loc>${baseUrl}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.write(xml);
  res.end();

  return { props: {} };
};

export default function SitemapXml() {
  return null;
}
