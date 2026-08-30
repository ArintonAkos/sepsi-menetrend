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

describe("line index", () => {
  it("lists all 12 lines, each linking to /vonalak/{id}/", async () => {
    const { container } = render(await (Lines as PageComponent)());
    const lineHrefs = hrefs(container).filter((h) => h?.startsWith("/vonalak/"));
    expect(lineHrefs.length).toBeGreaterThanOrEqual(12);
  });

  it("the RO twin links every line under /ro/linii/", async () => {
    const { container } = render(await (LinesRo as PageComponent)());
    const lineHrefs = hrefs(container).filter((h) => h?.startsWith("/ro/linii/"));
    expect(lineHrefs.length).toBeGreaterThanOrEqual(12);
    // every line link is RO-tree; the only HU path is the language-twin pill
    const twin = hrefs(container).filter((h) => h?.startsWith("/vonalak/"));
    expect(twin).toEqual(["/vonalak/"]);
  });
});

describe("stop index", () => {
  it("links every place under an A-Z letter heading", async () => {
    const { container } = render(await (Stops as PageComponent)());
    const stopHrefs = hrefs(container).filter((h) => h?.startsWith("/megallok/"));
    expect(stopHrefs.length).toBeGreaterThanOrEqual(60);
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(0);
  });

  it("the RO twin links places by their own RO slug, not the HU one", async () => {
    const { container } = render(await (StopsRo as PageComponent)());
    const stopHrefs = hrefs(container).filter((h) => h?.startsWith("/ro/statii/"));
    expect(stopHrefs.length).toBeGreaterThanOrEqual(60);
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
