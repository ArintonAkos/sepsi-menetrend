import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";
import { buildPlaces } from "./places";
import { notablePairs } from "./routes";
import { allPages } from "./urls";

const net = loadNetwork();
const pages = allPages();

describe("allPages", () => {
  it("covers planner, guides, lines, places and routes with hu/ro twins", () => {
    expect(pages.find((p) => p.path === "/")?.ro).toBe("/ro/");
    expect(pages.some((p) => p.path === "/vonalak/1/")).toBe(true);
    expect(pages.some((p) => p.path.startsWith("/megallok/"))).toBe(true);
    expect(pages.some((p) => p.path.startsWith("/utvonal/"))).toBe(true);
    expect(
      pages.every((p) => p.hu && p.ro && p.lastModified.startsWith("20")),
    ).toBe(true);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
    expect(pages.length).toBeGreaterThan(150);
  });

  it("maps every ro path under /ro/", () => {
    expect(pages.every((p) => p.ro === "/ro/" || p.ro.startsWith("/ro/"))).toBe(
      true,
    );
  });

  it("keeps path identical to the canonical hu path and ends every path in /", () => {
    expect(pages.every((p) => p.path === p.hu)).toBe(true);
    expect(pages.every((p) => p.path.endsWith("/"))).toBe(true);
    expect(pages.every((p) => p.ro.endsWith("/"))).toBe(true);
  });

  it("pairs a line id with its /ro/linii/ twin, one page per feed line", () => {
    const line1 = pages.find((p) => p.path === "/vonalak/1/");
    expect(line1?.hu).toBe("/vonalak/1/");
    expect(line1?.ro).toBe("/ro/linii/1/");
    expect(line1?.priority).toBe(0.7);
    const linePages = pages.filter((p) => /^\/vonalak\/[^/]+\/$/.test(p.path));
    expect(linePages.length).toBe(net.lines.length);
  });

  it("uses the RO slug - not the HU one - for a place's ro path", () => {
    // a place whose two slugs genuinely differ, so the twin can't accidentally
    // match by reusing the HU slug
    const place = buildPlaces(net).find((p) => p.slug !== p.slugRo)!;
    const page = pages.find((p) => p.path === `/megallok/${place.slug}/`);
    expect(page).toBeDefined();
    expect(page!.ro).toBe(`/ro/statii/${place.slugRo}/`);
    expect(page!.ro).not.toBe(`/ro/statii/${place.slug}/`);
    expect(page!.priority).toBe(0.6);
  });

  it("uses the RO slug for a route pair's ro path", () => {
    const pair = notablePairs(net).find((p) => p.slug !== p.slugRo)!;
    const page = pages.find((p) => p.path === `/utvonal/${pair.slug}/`);
    expect(page).toBeDefined();
    expect(page!.ro).toBe(`/ro/trasee/${pair.slugRo}/`);
    expect(page!.priority).toBe(0.5);
  });

  it("maps /felhasznalasi-feltetelek/ to its Romanian twin", () => {
    const terms = pages.find((p) => p.path === "/felhasznalasi-feltetelek/");
    expect(terms?.ro).toBe("/ro/termeni/");
    expect(terms?.priority).toBe(0.4);
  });

  it("derives lastModified from net.generated (YYYYMMDD -> ISO)", () => {
    expect(pages[0].lastModified).toBe("2026-08-07");
    expect(pages.every((p) => p.lastModified === "2026-08-07")).toBe(true);
  });

  it("orders static pages first, then lines, then places, then routes", () => {
    const rank = (path: string): number =>
      /^\/vonalak\/[^/]+\/$/.test(path) ? 1
      : /^\/megallok\/[^/]+\/$/.test(path) ? 2
      : /^\/utvonal\/[^/]+\/$/.test(path) ? 3
      : 0;
    const ranks = pages.map((p) => rank(p.path));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(pages[0].path).toBe("/");
  });

  it("counts static + lines + places + routes and nothing else", () => {
    const STATIC = 11; // planner + 5 guides + 3 indexes + terms + privacy
    const expected =
      STATIC + net.lines.length + buildPlaces(net).length + notablePairs(net).length;
    expect(pages.length).toBe(expected);
    expect(pages.length).toBeGreaterThan(150);
  });

  it("lists only real HTML pages", () => {
    expect(
      pages.some((p) => /manifest|robots|sitemap|opengraph/.test(p.path)),
    ).toBe(false);
  });

  it("gives every page a non-empty English URL under /en/", () => {
    for (const e of allPages()) {
      expect(e.en.startsWith("/en/") || e.en === "/en/").toBe(true);
    }
  });

  it("uses the Hungarian slug for English place and route URLs", () => {
    const pages = allPages();
    const aPlace = pages.find((e) => e.hu.startsWith("/megallok/"))!;
    expect(aPlace.en).toBe(`/en/stops/${aPlace.hu.slice("/megallok/".length)}`);
    const aRoute = pages.find((e) => e.hu.startsWith("/utvonal/"))!;
    expect(aRoute.en).toBe(`/en/routes/${aRoute.hu.slice("/utvonal/".length)}`);
  });

  it("maps the static pages to their English category slugs", () => {
    const by = (hu: string) => allPages().find((e) => e.hu === hu)!;
    expect(by("/").en).toBe("/en/");
    expect(by("/buszmenetrend/").en).toBe("/en/bus-schedule/");
    expect(by("/vonalak/").en).toBe("/en/lines/");
    expect(by("/megallok/").en).toBe("/en/stops/");
    expect(by("/utvonal/").en).toBe("/en/routes/");
    expect(by("/dijszabas/").en).toBe("/en/fares/");
    expect(by("/gyik/").en).toBe("/en/faq/");
    expect(by("/felhasznalasi-feltetelek/").en).toBe("/en/terms/");
    expect(by("/adatvedelem/").en).toBe("/en/privacy/");
  });
});
