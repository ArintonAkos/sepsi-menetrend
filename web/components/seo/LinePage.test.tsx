import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import LinePage, { lineMetadata } from "./LinePage";
import type { SeoLang } from "@/lib/seo/lang";

/** `LinePage` is an async server component - render its resolved tree the way
 *  the brief's tests do rather than as JSX. The `/Multi-Trans/` and
 *  `/planificator/` matchers in the brief's sketch are ambiguous against
 *  `PageFrame`'s disclaimer/footer, so the prose and CTA are pinned by a
 *  phrase unique to the body instead. */
const renderLine = async (props: { lang: SeoLang; id: string }) =>
  render(await LinePage(props));

describe("LinePage", () => {
  it("puts the departure board above the description for line 1", async () => {
    await renderLine({ lang: "hu", id: "1" });

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("1-es busz");

    const board = screen.getAllByRole("table")[0];
    const intro = screen.getByText(/városi buszjárata Sepsiszentgyörgyön/);
    // the board is earlier in document order than the templated prose
    expect(
      board.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders at least one real departure table for line 1", async () => {
    const { container } = await renderLine({ lang: "hu", id: "1" });
    expect(container.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("links every stop to its own stop page", async () => {
    const { container } = await renderLine({ lang: "hu", id: "1" });
    expect(container.querySelector('a[href^="/megallok/"]')).toBeTruthy();
  });

  it("carries the Free Friday note", async () => {
    await renderLine({ lang: "hu", id: "1" });
    expect(
      screen.getAllByText(/Pénteken a városi járatok ingyenesek/).length,
    ).toBeGreaterThan(0);
  });

  it("links into the planner timetable for this line, RO handoff kept RO", async () => {
    await renderLine({ lang: "ro", id: "1" });
    const ctas = screen.getAllByRole("link", { name: /deschide/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/?line=1&service=weekday&lang=ro");
    }
  });

  it("leaves the HU line CTA without a lang override", async () => {
    const { container } = await renderLine({ lang: "hu", id: "1" });
    const cta = container.querySelector('a[href^="/?line="]');
    expect(cta).toHaveAttribute("href", "/?line=1&service=weekday");
  });

  it("offers the language twin link in the frame", async () => {
    const { container } = await renderLine({ lang: "ro", id: "1" });
    expect(container.querySelector('a[href="/vonalak/1/"]')).toBeTruthy();
  });

  it("renders an English line page: English title, English board headings, /en/ hrefs", async () => {
    await renderLine({ lang: "en", id: "1" });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Line 1/);
    // one departure board per direction, so the English heading recurs
    expect(screen.getAllByText("Weekday").length).toBeGreaterThan(0);

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/en/stops/"))).toBe(true);
    expect(hrefs).toContain("/?line=1&service=weekday&lang=en");
  });

  it("canonicalises the English line page to /en/lines/1/", () => {
    const m = lineMetadata("1", "en");
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/lines/1/");
  });

  it("shows the baked route map image for a line that has one", async () => {
    await renderLine({ lang: "hu", id: "1" });
    const img = screen
      .queryAllByRole("img")
      .find((n) => n.getAttribute("src")?.startsWith("/maps/line-1-"));
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("loading", "lazy");
    const alt = img?.getAttribute("alt") ?? "";
    expect(alt.length).toBeGreaterThan(0);
    // the direction's headsign rides in the alt, so a screen reader can tell
    // the two per-page maps apart
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent ?? "");
    expect(headings.some((h) => h.length > 0 && alt.includes(h))).toBe(true);
  });

  it("gives the two per-page route maps distinct alt text", async () => {
    await renderLine({ lang: "hu", id: "1" });
    const alts = screen
      .queryAllByRole("img")
      .filter((n) => n.getAttribute("src")?.startsWith("/maps/line-1-"))
      .map((n) => n.getAttribute("alt") ?? "");
    expect(alts.length).toBeGreaterThan(1);
    expect(new Set(alts).size).toBe(alts.length);
  });

  it("keeps the EN baked route map too, with a non-empty English alt", async () => {
    await renderLine({ lang: "en", id: "1" });
    const img = screen
      .queryAllByRole("img")
      .find((n) => n.getAttribute("src")?.startsWith("/maps/line-1-"));
    expect(img).toBeTruthy();
    const alt = img?.getAttribute("alt") ?? "";
    expect(alt.length).toBeGreaterThan(0);
    expect(alt).toMatch(/Route of line 1 on the map:/);
  });

  it("falls back to the inline route SVG when there is no baked map", () => {
    // No feed line id is guaranteed to lack a baked PNG (all 24 exist), so the
    // fallback branch is pinned at source level: `mapImage` decides, and
    // `RouteShape` is still imported and rendered for the null case.
    const src = readFileSync(resolve(import.meta.dirname, "LinePage.tsx"), "utf8");
    expect(src).toMatch(/mapImage\(/);
    expect(src).toMatch(/import RouteShape from/);
    expect(src).toMatch(/<RouteShape\b/);
  });
});
