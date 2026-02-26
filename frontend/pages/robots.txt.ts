import type { GetServerSideProps } from 'next';

function getBaseUrl(headers: GetServerSidePropsContextHeaders): string {
  const protocolHeader = headers['x-forwarded-proto'];
  const hostHeader = headers['x-forwarded-host'] || headers.host;
  const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader || 'http';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || 'localhost:3001';
  return `${protocol}://${host}`;
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
  res.write(robots);
  res.end();

  return { props: {} };
};

export default function RobotsTxt() {
  return null;
}

