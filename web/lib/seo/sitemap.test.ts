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
    expect(line1.alternates?.languages?.en).toBe(`${SITE}/en/lines/1/`);
    expect(entries.find((e) => e.url === `${SITE}/`)).toBeTruthy();
    expect(entries.find((e) => e.url.endsWith("/felhasznalasi-feltetelek/"))).toBeTruthy();
  });

  it("emits one <loc> per language per inventory page", () => {
    expect(entries.length).toBe(allPages().length * 3);
    expect(entries.length).toBe(537);
  });

  it("gives a page's HU, RO and EN URL each its own entry", () => {
    expect(entries.some((e) => e.url === `${SITE}/vonalak/1/`)).toBe(true);
    expect(entries.some((e) => e.url === `${SITE}/ro/linii/1/`)).toBe(true);
    expect(entries.some((e) => e.url === `${SITE}/en/lines/1/`)).toBe(true);
  });

  it("repeats the same hu/ro/en/x-default set on all three entries of a triple", () => {
    const languages = {
      hu: `${SITE}/vonalak/1/`,
      ro: `${SITE}/ro/linii/1/`,
      en: `${SITE}/en/lines/1/`,
      "x-default": `${SITE}/vonalak/1/`,
    };
    const hu = entries.find((e) => e.url === `${SITE}/vonalak/1/`)!;
    const ro = entries.find((e) => e.url === `${SITE}/ro/linii/1/`)!;
    const en = entries.find((e) => e.url === `${SITE}/en/lines/1/`)!;
    expect(hu.alternates?.languages).toEqual(languages);
    expect(ro.alternates?.languages).toEqual(languages);
    expect(en.alternates?.languages).toEqual(languages);
    expect(Object.keys(en.alternates?.languages ?? {}).sort()).toEqual(
      ["en", "hu", "ro", "x-default"],
    );
    expect(en.alternates?.languages?.["x-default"]).toBe(`${SITE}/vonalak/1/`);
  });

  it("marks only the three planner entries weekly, the rest monthly", () => {
    const weekly = entries
      .filter((e) => e.changeFrequency === "weekly")
      .map((e) => e.url)
      .sort();
    expect(weekly).toEqual([`${SITE}/`, `${SITE}/en/`, `${SITE}/ro/`]);
    expect(
      entries.every(
        (e) => e.changeFrequency === "weekly" || e.changeFrequency === "monthly",
      ),
    ).toBe(true);
  });
});
