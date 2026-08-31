import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import Routes, { generateMetadata as routesMeta } from "@/app/utvonal/page";
import RoutesRo, { generateMetadata as routesRoMeta } from "@/app/ro/trasee/page";
import { RouteIndex, indexMetadata } from "@/components/seo/IndexShell";
import { loadNetwork } from "@/lib/seo/network";
import { notablePairs } from "@/lib/seo/routes";

type PageComponent = () => ReactElement | Promise<ReactElement>;

const hrefs = (root: HTMLElement): string[] =>
  [...root.querySelectorAll("a")]
    .map((a) => a.getAttribute("href"))
    .filter((h): h is string => !!h);

const pairs = notablePairs(loadNetwork());

describe("route index", () => {
  it("groups routes by origin and links every route page in both directions", async () => {
    const { container } = render(await (Routes as PageComponent)());

    const routeLinks = hrefs(container).filter((h) => /^\/utvonal\/[^/]+\/$/.test(h));
    // each unordered pair is listed once under each endpoint
    expect(routeLinks.length).toBe(pairs.length * 2);
    expect(routeLinks.length).toBeGreaterThanOrEqual(30);
    // one <h2> per origin place
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(1);
  });

  it("makes every route page reachable at least once", async () => {
    const { container } = render(await (Routes as PageComponent)());
    const linked = new Set(hrefs(container));
    for (const p of pairs) {
      expect(linked.has(`/utvonal/${p.slug}/`)).toBe(true);
    }
  });

  it("the RO twin links every route under /ro/trasee/ by its RO slug", async () => {
    const { container } = render(await (RoutesRo as PageComponent)());
    const all = hrefs(container);
    const linked = new Set(all);

    for (const p of pairs) {
      expect(linked.has(`/ro/trasee/${p.slugRo}/`)).toBe(true);
    }
    // a pair whose two slugs genuinely differ must use slugRo, never the HU slug
    const drift = pairs.find((p) => p.slug !== p.slugRo)!;
    expect(linked.has(`/ro/trasee/${drift.slugRo}/`)).toBe(true);
    expect(linked.has(`/ro/trasee/${drift.slug}/`)).toBe(false);
    // the only HU-tree link on the RO page is the language-twin pill
    expect(all.filter((h) => h.startsWith("/utvonal/"))).toEqual(["/utvonal/"]);
  });

  it("canonicalises each index to its own language URL", async () => {
    expect((await routesMeta()).alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/utvonal/",
    );
    expect((await routesRoMeta()).alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/ro/trasee/",
    );
  });

  it("the English twin links every route under /en/routes/ by its HU slug", () => {
    const { container } = render(<RouteIndex lang="en" />);
    const routeLinks = hrefs(container).filter((h) => /^\/en\/routes\/[^/]+\/$/.test(h));
    expect(routeLinks.length).toBe(pairs.length * 2);
    const linked = new Set(routeLinks);
    for (const p of pairs) {
      expect(linked.has(`/en/routes/${p.slug}/`)).toBe(true);
    }
    expect(container.querySelector("h1")?.textContent).toMatch(/bus routes/i);
  });

  it("canonicalises the English route index to /en/routes/", () => {
    const m = indexMetadata("routes", "en");
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/routes/");
  });
});
