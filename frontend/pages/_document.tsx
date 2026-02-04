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
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
