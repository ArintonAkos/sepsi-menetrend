import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PlacePage from "./PlacePage";
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

/** `PlacePage` is an async server component - render its resolved tree the way
 *  the brief's tests do rather than as JSX. Sepsi Aréna is line 5's and line
 *  6's shared terminus, so it always has a printed board for each. */
const arena = buildPlaces(loadNetwork()).find((p) => p.slug === "sepsi-arena")!;

const renderPlace = async (props: { lang: "hu" | "ro"; slug: string }) =>
  render(await PlacePage(props));

/** child links under `base`, dropping the `base` breadcrumb self-link. */
const childLinks = (root: HTMLElement, base: string): string[] =>
  [...root.querySelectorAll(`a[href^="${base}"]`)]
    .map((a) => a.getAttribute("href")!)
    .filter((h) => h !== base);

describe("PlacePage", () => {
  it("shows boards, line chips and nearby stops for Sepsi Aréna (hu)", async () => {
    const { container } = await renderPlace({ lang: "hu", slug: "sepsi-arena" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Aréna/);

    // lines 5 and 6 each print one column here: 2 boards × (weekday + weekend)
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(4);

    // the board comes before the templated prose
    const intro = screen.getByText(/Multi-Trans buszmegállóinak/);
    expect(
      tables[0].compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // line 5 serves Sepsi Aréna - its chip links to the HU line page
    const chip = screen.getByRole("link", { name: /5-ös busz|5-ös/ });
    expect(chip).toHaveAttribute("href", "/vonalak/5/");

    // CTA hands the kerb to the live planner
    expect(container.querySelector('a[href^="/?stop="]')).toBeTruthy();

    // nearby places link to their own stop pages
    expect(childLinks(container, "/megallok/").length).toBeGreaterThan(0);
  });

  it("renders the Romanian twin under its RO slug", async () => {
    const { container } = await renderPlace({ lang: "ro", slug: arena.slugRo });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Stația/);
    expect(screen.getAllByRole("table")).toHaveLength(4);
    expect(container.querySelector('a[href="/ro/linii/5/"]')).toBeTruthy();
    // the planner handoff carries the RO language through
    expect(container.querySelector('a[href^="/?stop="]')?.getAttribute("href"))
      .toMatch(/&lang=ro$/);
    expect(childLinks(container, "/ro/statii/").length).toBeGreaterThan(0);
  });

  it("renders a board for each direction the feed binds to one hub kerb", async () => {
    // Lábasház (P14) carries line 9 in both directions on one kerb
    const labas = buildPlaces(loadNetwork()).find((p) => p.slug === "labashaz")!;
    const { container } = await renderPlace({ lang: "hu", slug: labas.slug });

    const line9 = [...container.querySelectorAll("h2")].filter((h) =>
      /^9-es busz →/.test(h.textContent ?? ""),
    );
    expect(line9.length).toBe(2);
    expect(new Set(line9.map((h) => h.textContent)).size).toBe(2);
  });

  it("calls notFound() for an unknown slug", async () => {
    await expect(renderPlace({ lang: "hu", slug: "nincs-ilyen-megallo" })).rejects.toThrow();
  });
});
