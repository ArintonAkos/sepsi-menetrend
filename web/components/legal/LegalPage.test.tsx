import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import LegalPage from "./LegalPage";

describe("LegalPage", () => {
  it("server-renders the language it is given", () => {
    const { rerender } = render(<LegalPage type="terms" lang="hu" />);
    expect(
      screen.getByRole("heading", { name: /Felhasználási Feltételek és Jogi Nyilatkozat/ }),
    ).toBeInTheDocument();
    rerender(<LegalPage type="terms" lang="ro" />);
    expect(
      screen.getByRole("heading", { name: /Termeni și Condiții de Utilizare/ }),
    ).toBeInTheDocument();
    rerender(<LegalPage type="privacy" lang="en" />);
    expect(
      screen.getByRole("heading", { name: /Privacy and Cookie Notice/i }),
    ).toBeInTheDocument();
  });

  it("the language switch links to the twin URLs; the current language is not a link", () => {
    render(<LegalPage type="terms" lang="hu" />);
    expect(screen.getByRole("link", { name: "Română" })).toHaveAttribute("href", "/ro/termeni/");
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/terms/");
    const hu = screen.getByText("Magyar");
    expect(hu.closest("a")).toBeNull();
    expect(hu).toHaveAttribute("aria-current", "true");
  });

  it("switches the twin targets for the privacy page", () => {
    render(<LegalPage type="privacy" lang="ro" />);
    expect(screen.getByRole("link", { name: "Magyar" })).toHaveAttribute("href", "/adatvedelem/");
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/privacy/");
  });

  it("the terms<->privacy cross-link stays in the current language", () => {
    render(<LegalPage type="terms" lang="ro" />);
    const cross = screen.getByRole("link", { name: /Politica de confidențialitate/i });
    expect(cross).toHaveAttribute("href", "/ro/confidentialitate/");
    render(<LegalPage type="privacy" lang="en" />);
    expect(screen.getByRole("link", { name: /Terms of use/i })).toHaveAttribute("href", "/en/terms/");
  });

  it("is a server component — no client boundary in the source", () => {
    const src = readFileSync(resolve(import.meta.dirname, "LegalPage.tsx"), "utf8");
    expect(src).not.toMatch(/["']use client["']/);
    expect(src).not.toMatch(/useState|useEffect|useSyncExternalStore/);
  });
});
