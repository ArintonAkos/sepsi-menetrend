import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RoutePage from "./RoutePage";

/** `RoutePage` is an async server component - render its resolved tree the way
 *  the other SEO page tests do. The slugs below are real canonical pair slugs
 *  from `notablePairs(loadNetwork())`: Árkos központ <-> Vasútállomás, a pair
 *  connected (with one transfer) in both directions. */
const HU_SLUG = "arkos-kozpont-vasutallomas";
const RO_SLUG = "centru-arcus-gara-cfr";

const renderRoute = async (props: { lang: "hu" | "ro"; pair: string }) =>
  render(await RoutePage(props));

describe("RoutePage", () => {
  it("leads with a 'by bus' h1 and offers a planner CTA (HU)", async () => {
    await renderRoute({ lang: "hu", pair: HU_SLUG });

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/busszal/);
    // the grammatical ablative/terminative forms, not the templated "-tól/-ig"
    expect(h1).toHaveTextContent("Árkos központtól Vasútállomásig busszal");
    expect(h1.textContent).not.toMatch(/-tól|-ig/);

    const ctas = screen.getAllByRole("link", { name: /tervező|nyisd/i });
    expect(ctas.length).toBeGreaterThan(0);
    expect(
      ctas.some((a) => /^\/\?from=[^&]+&to=[^&]+/.test(a.getAttribute("href") ?? "")),
    ).toBe(true);
  });

  it("emits a FAQPage JSON-LD block alongside the visible FAQ", async () => {
    const { container } = await renderRoute({ lang: "hu", pair: HU_SLUG });
    const types = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent!.replace(/\\u003c/g, "<"))["@type"]);
    expect(types).toContain("FAQPage");
  });

  it("renders the Romanian variant with a lang-stamped CTA", async () => {
    await renderRoute({ lang: "ro", pair: RO_SLUG });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/cu autobuzul/);

    const ctas = screen.getAllByRole("link", { name: /planificator|deschide/i });
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas.some((a) => (a.getAttribute("href") ?? "").includes("&lang=ro"))).toBe(true);
  });
});
