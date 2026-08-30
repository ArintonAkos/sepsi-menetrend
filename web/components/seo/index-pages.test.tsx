import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Metadata } from "next";
import type { ReactElement } from "react";

import Lines, { generateMetadata as linesMeta } from "@/app/vonalak/page";
import LinesRo, { generateMetadata as linesRoMeta } from "@/app/ro/linii/page";
import Stops, { generateMetadata as stopsMeta } from "@/app/megallok/page";
import StopsRo, { generateMetadata as stopsRoMeta } from "@/app/ro/statii/page";

/** The page default exports are server components with no props - render them
 *  the way the brief's test does (`render(await Page())`) rather than as JSX. */
type PageComponent = () => ReactElement | Promise<ReactElement>;
type MetaFn = () => Metadata | Promise<Metadata>;

const hrefs = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));

/** hrefs that are a single-segment child path under `base`, e.g. `/vonalak/1/`
 *  but not the `/vonalak/` breadcrumb self-link or the language-twin pill. */
const childLinks = (root: HTMLElement, base: string): string[] => {
  const re = new RegExp(`^${base}[^/]+/$`);
  return hrefs(root).filter((h): h is string => !!h && re.test(h));
};

describe("line index", () => {
  it("lists exactly the 12 lines, each linking to /vonalak/{id}/", async () => {
    const { container } = render(await (Lines as PageComponent)());
    expect(childLinks(container, "/vonalak/")).toHaveLength(12);
  });

  it("renders a colour swatch and the termini for each line row", async () => {
    const { container } = render(await (Lines as PageComponent)());
    // the operator's published colour, decorative (aria-hidden span)
    expect(container.querySelector('[class*="swatch"]')).toBeTruthy();
    // line 1 runs Szemerja Végállomás – Vasútállomás; the termini text is on the page
    expect(container.textContent).toContain("Szemerja Végállomás");
  });

  it("the RO twin links every line under /ro/linii/", async () => {
    const { container } = render(await (LinesRo as PageComponent)());
    expect(childLinks(container, "/ro/linii/")).toHaveLength(12);
    // every line link is RO-tree; the only HU path is the language-twin pill
    const twin = hrefs(container).filter((h) => h?.startsWith("/vonalak/"));
    expect(twin).toEqual(["/vonalak/"]);
  });
});

describe("stop index", () => {
  it("links exactly the 65 places, each under an A-Z letter heading", async () => {
    const { container } = render(await (Stops as PageComponent)());
    expect(childLinks(container, "/megallok/")).toHaveLength(65);
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(0);
  });

  it("buckets an accented terminus under its folded initial, not a trailing bucket", async () => {
    const { container } = render(await (Stops as PageComponent)());
    // "Árkos központ" (line 10 terminus) folds to "arkos-kozpont" -> letter "A".
    // A codepoint sort of the raw "Á" would drop it in a bucket after "Z".
    const aHeading = [...container.querySelectorAll("h2")].find(
      (h) => h.textContent?.trim() === "A",
    );
    expect(aHeading).toBeTruthy();
    const section = aHeading!.closest("section")!;
    const arkos = [...section.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Árkos"),
    );
    expect(arkos).toBeTruthy();
    expect(arkos!.getAttribute("href")).toMatch(/^\/megallok\/arkos-kozpont\/$/);
  });

  it("sorts accented names by their folded form within a group, not last", async () => {
    const { container } = render(await (Stops as PageComponent)());
    const gGroup = [...container.querySelectorAll("h2")]
      .find((h) => h.textContent?.trim() === "G")!
      .closest("section")!;
    const names = [...gGroup.querySelectorAll("a")].map((a) => a.textContent!.trim());
    // "Gábor Áron utca" folds to "gabor aron..." - it must come before "Gyár"
    // and "Gyöngyvirág", not after them on the codepoint of "á" (U+00E1 > "y").
    const gabor = names.findIndex((n) => n.startsWith("Gábor"));
    const gyar = names.findIndex((n) => n.startsWith("Gyár"));
    expect(gabor).toBeGreaterThanOrEqual(0);
    expect(gyar).toBeGreaterThan(gabor);
  });

  it("the RO twin links places by their own RO slug, not the HU one", async () => {
    const { container } = render(await (StopsRo as PageComponent)());
    const stopHrefs = childLinks(container, "/ro/statii/");
    expect(stopHrefs).toHaveLength(65);
    // "Bevásárlóközpont" (HU slug "bevasarlokozpont") is "Centru Comercial" /
    // "centru-comercial" in Romanian - the RO href must carry the RO slug.
    expect(stopHrefs).toContain("/ro/statii/centru-comercial/");
    expect(stopHrefs).not.toContain("/ro/statii/bevasarlokozpont/");
  });
});

describe("index page metadata", () => {
  it("canonicalises each page to its own absolute URL", async () => {
    expect((await (linesMeta as MetaFn)()).alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/vonalak/",
    );
    expect((await (linesRoMeta as MetaFn)()).alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/ro/linii/",
    );
    expect((await (stopsMeta as MetaFn)()).alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/megallok/",
    );
    expect((await (stopsRoMeta as MetaFn)()).alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/ro/statii/",
    );
  });
});
