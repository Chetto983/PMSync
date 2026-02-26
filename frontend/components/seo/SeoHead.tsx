import Head from 'next/head';

interface SeoHeadProps {
  title: string;
  description: string;
  canonicalPath: string;
  ogType?: 'website' | 'article';
  ogImagePath?: string;
  noindex?: boolean;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
}

const DEFAULT_SITE_URL = 'https://mail-agent-indol.vercel.app/';
const DEFAULT_OG_IMAGE_PATH = '/og-image.png?v=3';
const DEFAULT_OG_IMAGE_ALT = 'PMSync AI workspace for inbox teams';

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function getSiteUrl(): string {
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  return normalizeSiteUrl(envSiteUrl || DEFAULT_SITE_URL);
}

function toAbsoluteUrl(urlOrPath: string, siteUrl: string): string {
  if (/^https?:\/\//i.test(urlOrPath)) {
    return urlOrPath;
  }
  return `${siteUrl}${normalizePath(urlOrPath)}`;
}

export function SeoHead({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImagePath = DEFAULT_OG_IMAGE_PATH,
  noindex = false,
  structuredData,
}: SeoHeadProps) {
  const siteUrl = getSiteUrl();
  const canonicalUrl = toAbsoluteUrl(canonicalPath, siteUrl);
  const ogImageUrl = toAbsoluteUrl(ogImagePath, siteUrl);
  const robotsContent = noindex
    ? 'noindex,nofollow'
    : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
  const structuredDataEntries = Array.isArray(structuredData)
    ? structuredData
    : structuredData
      ? [structuredData]
      : [];

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robotsContent} />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content="PMSync" />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:image:secure_url" content={ogImageUrl} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={DEFAULT_OG_IMAGE_ALT} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImageUrl} />
      <meta name="twitter:image:alt" content={DEFAULT_OG_IMAGE_ALT} />

      {structuredDataEntries.map((entry, index) => (
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
          key={`seo-jsonld-${index}`}
          type="application/ld+json"
        />
      ))}
    </Head>
  );
}
