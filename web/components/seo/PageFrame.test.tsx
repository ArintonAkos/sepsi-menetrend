import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import PageFrame from "./PageFrame";

const crumbs = [
  { name: "Sepsi Menetrend", path: "/" },
  { name: "Vonalak", path: "/vonalak/" },
  { name: "1-es busz", path: "/vonalak/1/" },
];

const paths = { hu: "/vonalak/1/", ro: "/ro/linii/1/", en: "/en/lines/1/" };

describe("PageFrame chrome", () => {
  it("renders the brand header with a back link to the planner", () => {
    render(<PageFrame lang="hu" kind="line" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>);
    // scoped to the header landmark: "Sepsi Menetrend" is also the first crumb
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("Sepsi Menetrend")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /vissza/i });
    expect(back).toHaveAttribute("href", "/");
  });

  it("shows a per-kind badge in the page language", () => {
    const { rerender } = render(
      <PageFrame lang="hu" kind="line" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>,
    );
    expect(screen.getByText("VONAL")).toBeInTheDocument();
    rerender(<PageFrame lang="ro" kind="route" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>);
    expect(screen.getByText("TRASEU")).toBeInTheDocument();
  });

  it("wraps the children in the card", () => {
    render(<PageFrame lang="hu" kind="guide" paths={paths} crumbs={crumbs}><p>the body</p></PageFrame>);
    expect(screen.getByText("the body")).toBeInTheDocument();
  });

  it("offers all three languages; the current one is current-page text, the others link out", () => {
    render(
      <PageFrame lang="ro" kind="line" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>,
    );
    expect(screen.getByRole("link", { name: "Magyar" })).toHaveAttribute("href", "/vonalak/1/");
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/lines/1/");
    const ro = screen.getByText("Română");
    expect(ro.closest("a")).toBeNull();
    expect(ro).toHaveAttribute("aria-current", "true");
  });

  it("keeps the breadcrumb: N-1 links, last crumb is current-page text", () => {
    render(<PageFrame lang="hu" kind="line" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>);
    const nav = screen.getByRole("navigation", { name: /morzs/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(crumbs.length - 1);
    const current = within(nav).getByText("1-es busz");
    expect(current.closest("a")).toBeNull();
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("keeps the disclaimer, the operator link and the footer hub links, per language", () => {
    const { rerender } = render(
      <PageFrame lang="hu" kind="line" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>,
    );
    expect(screen.getByText(/Nem a Multi-Trans SA hivatalos oldala/)).toBeInTheDocument();
    let footer = screen.getByRole("contentinfo");
    let hrefs = within(footer).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/buszmenetrend/");
    expect(hrefs).toContain("/");
    const op = within(footer).getByRole("link", { name: /multitrans\.ro/i });
    expect(op).toHaveAttribute("target", "_blank");
    expect(op).toHaveAttribute("rel", "noopener noreferrer");

    rerender(<PageFrame lang="ro" kind="line" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>);
    expect(screen.getByText(/Nu este site-ul oficial Multi-Trans SA/)).toBeInTheDocument();
    footer = screen.getByRole("contentinfo");
    hrefs = within(footer).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/ro/orar-autobuz/");
    expect(hrefs).toContain("/ro/");
  });

  it("emits BreadcrumbList JSON-LD with every crumb as an absolute-URL ListItem", () => {
    const { container } = render(
      <PageFrame lang="hu" kind="line" paths={paths} crumbs={crumbs}><p>x</p></PageFrame>,
    );
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[2]).toMatchObject({ position: 3, name: "1-es busz" });
    expect(ld.itemListElement[2].item).toMatch(/^https?:\/\/.+\/vonalak\/1\/$/);
  });

  it("stays a server component — no client boundary, no event handlers in the source", () => {
    // `resolve(import.meta.dirname, …)`, not `new URL("./…", import.meta.url)`:
    // Vite rewrites the `new URL(relative, import.meta.url)` pattern into its
    // asset-URL handling, so `readFileSync` no longer sees a `file:` URL. This
    // matches the repo's other source-reading tests (`components/styles.test.ts`).
    const src = readFileSync(resolve(import.meta.dirname, "PageFrame.tsx"), "utf8");
    expect(src).not.toMatch(/["']use client["']/);
    expect(src).not.toMatch(/\bon[A-Z]\w+=/);
    expect(src).not.toMatch(/useState|useEffect|useRef/);
  });
});
