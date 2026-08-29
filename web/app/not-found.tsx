// A 404 stays static HTML - plain <a>, no `next/link` router, same call the
// SEO frame makes (components/seo/PageFrame.tsx).
/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";

/** Next renders this for any unmatched route and static-export emits it as
 *  `out/404.html`, which Netlify serves automatically. A 404 has no language
 *  context - the visitor could have come from either tree - so everything here
 *  is bilingual. Plain `<a>` and inline CSS keep it a single self-contained
 *  file: a safety net, not a page that needs the app shell or a router.
 *
 *  Next injects `<meta name="robots" content="noindex">` on 404s already, so
 *  only the title is worth setting. */
export const metadata: Metadata = { title: "404" };

export default function NotFound() {
  return (
    <main className="notfound">
      <style>{`
        .notfound {
          max-width: 34rem; margin: 0 auto; padding: 14vh 1.5rem 4rem;
          color: var(--ink, #232E10);
        }
        .notfound h1 { font-size: 1.4rem; line-height: 1.3; margin: 0 0 .75rem; }
        .notfound p { color: var(--muted, #6A6A5C); margin: 0 0 1.75rem; }
        .notfound ul {
          list-style: none; margin: 0; padding: 0;
          display: flex; flex-wrap: wrap; gap: .5rem;
        }
        .notfound a {
          display: inline-block; padding: .6rem 1rem; border-radius: 12px;
          text-decoration: none; color: var(--ink, #232E10);
          background: var(--surface, #F2F1EC);
          border: 1px solid var(--border, #E1DFD4);
        }
      `}</style>
      <h1>Az oldal nem található · Pagina nu a fost găsită</h1>
      <p>
        Ez az oldal nem létezik, vagy időközben áthelyeztük.{" "}
        Această pagină nu există sau a fost mutată între timp.
      </p>
      <ul>
        <li>
          <a href="/">Kezdőlap</a>
        </li>
        <li>
          <a href="/buszmenetrend/">Buszmenetrend</a>
        </li>
        <li>
          <a href="/ro/">Pagina principală</a>
        </li>
        <li>
          <a href="/ro/orar-autobuz/">Orar autobuz</a>
        </li>
      </ul>
    </main>
  );
}
