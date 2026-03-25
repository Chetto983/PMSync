/**
 * Custom Next.js Document
 *
 * Sets the lang attribute on the <html> element for WCAG 2.1 compliance.
 * The lang attribute is required by WCAG 3.1.1 (Level A).
 */

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  // Default to 'en' for language - next-themes handles the class attribute
  // In the future, this could be dynamically set based on user preferences
  return (
    <Html lang="en">
      <Head>
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#55cae5" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="PMSync" />
          <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
