import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PageFrame from "./PageFrame";

describe("PageFrame", () => {
  it("shows a Romanian disclaimer and a link to the operator", () => {
    render(
      <PageFrame lang="ro" twinPath="/vonalak/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/ro/" }, { name: "Linia 1", path: "/ro/linii/1/" }]}>
        <p>content</p>
      </PageFrame>,
    );
    expect(screen.getByText(/Nu este site-ul oficial Multi-Trans/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /multitrans\.ro/i })).toHaveAttribute("href", expect.stringContaining("multitrans.ro"));
    expect(screen.getByRole("link", { name: "Magyar" })).toHaveAttribute("href", "/vonalak/1/");
  });

  it("emits BreadcrumbList JSON-LD", () => {
    const { container } = render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }, { name: "1-es busz", path: "/vonalak/1/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    const ld = container.querySelector('script[type="application/ld+json"]')!;
    expect(JSON.parse(ld.textContent!)["@type"]).toBe("BreadcrumbList");
  });

  it("offers the Romanian twin from a Hungarian page", () => {
    render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }, { name: "1-es busz", path: "/vonalak/1/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    expect(screen.getByRole("link", { name: "Română" })).toHaveAttribute("href", "/ro/linii/1/");
    expect(screen.queryByRole("link", { name: "Magyar" })).not.toBeInTheDocument();
  });

  it("renders N-1 crumb links and the last crumb as current-page text", () => {
    const crumbs = [
      { name: "Sepsi Menetrend", path: "/" },
      { name: "Vonalak", path: "/vonalak/" },
      { name: "1-es busz", path: "/vonalak/1/" },
    ];
    render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/" crumbs={crumbs}>
        <p>x</p>
      </PageFrame>,
    );
    const nav = screen.getByRole("navigation");
    expect(within(nav).getAllByRole("link")).toHaveLength(crumbs.length - 1);
    const current = within(nav).getByText("1-es busz");
    expect(current).toBeInTheDocument();
    expect(current.closest("a")).toBeNull();
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("switches the disclaimer text by language", () => {
    const { rerender } = render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    expect(screen.getByText(/Nem a Multi-Trans SA hivatalos oldala/)).toBeInTheDocument();
    expect(screen.queryByText(/Nu este site-ul oficial/)).not.toBeInTheDocument();

    rerender(
      <PageFrame lang="ro" twinPath="/vonalak/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/ro/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    expect(screen.getByText(/Nu este site-ul oficial Multi-Trans SA/)).toBeInTheDocument();
    expect(screen.queryByText(/Nem a Multi-Trans SA/)).not.toBeInTheDocument();
  });

  it("points the footer pillar and planner links at the Hungarian paths", () => {
    render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    const footer = screen.getByRole("contentinfo");
    const hrefs = within(footer).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/buszmenetrend/");
    expect(hrefs).toContain("/");
    expect(hrefs).not.toContain("/ro/orar-autobuz/");
    expect(hrefs).not.toContain("/ro/");
  });

  it("points the footer pillar and planner links at the Romanian paths", () => {
    render(
      <PageFrame lang="ro" twinPath="/vonalak/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/ro/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    const footer = screen.getByRole("contentinfo");
    const hrefs = within(footer).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/ro/orar-autobuz/");
    expect(hrefs).toContain("/ro/");
    expect(hrefs).not.toContain("/buszmenetrend/");
  });

  it("opens the operator link in a new tab safely", () => {
    render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    const operator = screen.getByRole("link", { name: /multitrans\.ro/i });
    expect(operator).toHaveAttribute("href", "https://multitrans.ro/index.html");
    expect(operator).toHaveAttribute("target", "_blank");
    expect(operator).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders its children", () => {
    render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }]}>
        <p>the page body</p>
      </PageFrame>,
    );
    expect(screen.getByText("the page body")).toBeInTheDocument();
  });

  it("puts every crumb into the JSON-LD as an absolute-URL ListItem", () => {
    const { container } = render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }, { name: "1-es busz", path: "/vonalak/1/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    const ld = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')!.textContent!,
    );
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[1]).toMatchObject({ position: 2, name: "1-es busz" });
    expect(ld.itemListElement[1].item).toMatch(/^https?:\/\/.+\/vonalak\/1\/$/);
  });
});
