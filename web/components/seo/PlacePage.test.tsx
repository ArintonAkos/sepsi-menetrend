import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PlacePage from "./PlacePage";
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

/** `PlacePage` is an async server component - render its resolved tree the way
 *  the brief's tests do rather than as JSX. Sepsi Aréna is line 5's and line
 *  6's shared terminus, so it always has at least one printed board. */
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
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);

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
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/ro/linii/5/"]')).toBeTruthy();
    expect(childLinks(container, "/ro/statii/").length).toBeGreaterThan(0);
  });
});
