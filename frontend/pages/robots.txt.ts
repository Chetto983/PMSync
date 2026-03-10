import type { GetServerSideProps } from 'next';

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

function getConfiguredSiteUrl(): string | null {
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return envSiteUrl ? normalizeSiteUrl(envSiteUrl) : null;
}

function getBaseUrl(headers: GetServerSidePropsContextHeaders): string {
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

type GetServerSidePropsContextHeaders = {
  [key: string]: string | string[] | undefined;
};

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const baseUrl = getBaseUrl(req.headers as GetServerSidePropsContextHeaders);

  const robots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /auth/',
    'Disallow: /dashboard/',
    'Disallow: /api/',
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.write(robots);
  res.end();

  return { props: {} };
};

export default function RobotsTxt() {
  return null;
}
