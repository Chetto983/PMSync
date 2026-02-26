# PROGRESS.md

## 2026-01-29
- Summary: Added advanced retrieval improvements to UnifiedRetriever (hybrid scoring, diversity, recency, keyword handling).
- Files: `backend/src/modules/ai/voltagent/rag/unified-retriever.ts`
- Tests: Not run (not requested).

## 2026-02-26
- Summary: Landing SEO hardening pass with production-safe metadata and OG preview reliability fixes.
- Files:
  - `frontend/components/seo/SeoHead.tsx`
  - `frontend/pages/index.tsx`
  - `frontend/pages/robots.txt.ts`
  - `frontend/pages/sitemap.xml.ts`
  - `frontend/public/og-image.svg`
  - `frontend/public/og-image.png`
- Changes:
  - Switched default OG asset from SVG to PNG for broader social crawler compatibility.
  - Added explicit Open Graph image metadata (`secure_url`, `type`, `width`, `height`, `alt`) and Twitter image alt.
  - Refined OG artwork layout and typography to prevent clipping in social previews.
  - Added env-aware canonical base URL resolution for `robots.txt` and `sitemap.xml`.
  - Stabilized sitemap `lastmod` to a fixed timestamp and added cache headers for crawl endpoints.
  - Removed localhost fallback in homepage JSON-LD URL generation.
- Verification:
  - `cd frontend && npm run type-check` ✅
  - `cd frontend && npm run build` ✅
