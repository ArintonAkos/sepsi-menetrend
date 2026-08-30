import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { allPages } from "@/lib/seo/urls";

const SITE = "https://sepsimenetrend.ro";
const entries = sitemap();

describe("sitemap", () => {
  it("lists every inventory page with language alternates", () => {
    expect(entries.length).toBeGreaterThan(150);
    const line1 = entries.find((e) => e.url.endsWith("/vonalak/1/"))!;
    expect(line1.alternates?.languages?.ro).toBe(`${SITE}/ro/linii/1/`);
    expect(entries.find((e) => e.url === `${SITE}/`)).toBeTruthy();
    expect(entries.find((e) => e.url.endsWith("/terms/"))).toBeTruthy();
  });

  it("emits one <loc> per language per inventory page", () => {
    expect(entries.length).toBe(allPages().length * 2);
    expect(entries.length).toBe(358);
  });

  it("gives a page's HU and RO URL each its own entry", () => {
    expect(entries.some((e) => e.url === `${SITE}/vonalak/1/`)).toBe(true);
    expect(entries.some((e) => e.url === `${SITE}/ro/linii/1/`)).toBe(true);
  });

  it("repeats the same hu/ro/x-default set on both entries of a pair", () => {
    const languages = {
      hu: `${SITE}/vonalak/1/`,
      ro: `${SITE}/ro/linii/1/`,
      "x-default": `${SITE}/vonalak/1/`,
    };
    const hu = entries.find((e) => e.url === `${SITE}/vonalak/1/`)!;
    const ro = entries.find((e) => e.url === `${SITE}/ro/linii/1/`)!;
    expect(hu.alternates?.languages).toEqual(languages);
    expect(ro.alternates?.languages).toEqual(languages);
    expect(ro.alternates?.languages?.ro).toBe(`${SITE}/ro/linii/1/`);
    expect(ro.alternates?.languages?.["x-default"]).toBe(`${SITE}/vonalak/1/`);
  });

  it("marks only the two planner entries weekly, the rest monthly", () => {
    const weekly = entries
      .filter((e) => e.changeFrequency === "weekly")
      .map((e) => e.url)
      .sort();
    expect(weekly).toEqual([`${SITE}/`, `${SITE}/ro/`]);
    expect(
      entries.every(
        (e) => e.changeFrequency === "weekly" || e.changeFrequency === "monthly",
      ),
    ).toBe(true);
  });
});
