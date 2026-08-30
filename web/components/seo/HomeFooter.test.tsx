import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomeFooter from "./HomeFooter";

describe("HomeFooter", () => {
  it("links the Hungarian content pages", () => {
    render(<HomeFooter lang="hu" />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const p of ["/buszmenetrend/", "/vonalak/", "/megallok/", "/utvonal/",
                     "/dijszabas/", "/multi-trans/", "/gyik/", "/terms/", "/privacy/"]) {
      expect(hrefs).toContain(p);
    }
    expect(hrefs).toContain("/ro/");                 // language switch
    expect(hrefs.some((h) => h?.startsWith("/ro/orar"))).toBe(false);
    expect(screen.getByText(/Nem a Multi-Trans SA hivatalos/)).toBeInTheDocument();
  });

  it("links the Romanian content pages on the /ro/ homepage", () => {
    render(<HomeFooter lang="ro" />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const p of ["/ro/orar-autobuz/", "/ro/linii/", "/ro/statii/", "/ro/trasee/",
                     "/ro/tarife/", "/ro/termeni/", "/ro/confidentialitate/"]) {
      expect(hrefs).toContain(p);
    }
    expect(hrefs).toContain("/");                    // language switch back to HU
    expect(hrefs).not.toContain("/vonalak/");
    expect(screen.getByText(/Nu este site-ul oficial Multi-Trans/)).toBeInTheDocument();
  });
});
