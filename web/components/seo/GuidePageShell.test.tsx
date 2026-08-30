import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import GuidePageShell, { guideMetadata } from "./GuidePageShell";

describe("GuidePageShell", () => {
  it("renders the guide title as the page h1 and offers the language twin", () => {
    render(<GuidePageShell guideKey="fares" lang="hu" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/jegy/i);
    expect(screen.getByRole("link", { name: "Română" })).toHaveAttribute("href", "/ro/tarife/");
  });

  it("shows the FAQ visibly and emits a FAQPage script for the faq guide", () => {
    const { container } = render(<GuidePageShell guideKey="faq" lang="hu" />);
    expect(screen.getAllByRole("term").length).toBeGreaterThan(4);
    const scripts = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent!.replace(/\\u003c/g, "<"))["@type"]);
    expect(scripts).toContain("FAQPage");
  });

  it("omits the FAQ script for a guide without one", () => {
    const { container } = render(<GuidePageShell guideKey="bike" lang="ro" />);
    const types = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent!.replace(/\\u003c/g, "<"))["@type"]);
    expect(types).not.toContain("FAQPage");
  });

  it("lists every city line on the pillar page, each linking to its line page", () => {
    render(<GuidePageShell guideKey="pillar" lang="hu" />);
    const list = screen.getByRole("navigation", { name: "Vonalak" });
    const hrefs = within(list).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/vonalak/1/", "/vonalak/1D/", "/vonalak/10/", "/megallok/", "/dijszabas/"]),
    );
  });

  it("points the pillar list at the Romanian route tree on the /ro/ twin", () => {
    render(<GuidePageShell guideKey="pillar" lang="ro" />);
    const list = screen.getByRole("navigation", { name: "Linii" });
    const hrefs = within(list).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/ro/linii/1/");
    expect(hrefs).toContain("/ro/statii/");
    expect(hrefs).toContain("/ro/tarife/");
  });

  it("canonicalises each guide to its own language URL", () => {
    expect(guideMetadata("faq", "hu").alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/gyik/",
    );
    expect(guideMetadata("faq", "ro").alternates?.canonical).toBe(
      "https://sepsimenetrend.ro/ro/intrebari-frecvente/",
    );
  });

  it("renders the English pillar page with the /en/ twin and English index links", () => {
    render(<GuidePageShell guideKey="pillar" lang="en" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/bus schedule/i);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/en/lines/1/");
    expect(links).toContain("/en/stops/");
  });

  it("canonicalises the English fares guide to /en/fares/", () => {
    const m = guideMetadata("fares", "en");
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/fares/");
    expect(m.alternates?.languages?.en).toBe("https://sepsimenetrend.ro/en/fares/");
  });
});
