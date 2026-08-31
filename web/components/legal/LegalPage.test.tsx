import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LegalPage from "./LegalPage";

describe("LegalPage", () => {
  it("renders Hungarian by default when no lang prop is given", () => {
    render(<LegalPage type="terms" />);
    expect(
      screen.getByRole("heading", { name: /Felhasználási Feltételek és Jogi Nyilatkozat/ }),
    ).toBeInTheDocument();
  });

  it("server-renders the Romanian text when lang=\"ro\" is forced", () => {
    render(<LegalPage type="terms" lang="ro" />);
    expect(
      screen.getByRole("heading", { name: /Termeni și Condiții de Utilizare/ }),
    ).toBeInTheDocument();
  });

  it("keeps the forced Romanian text even when the stored preference is Hungarian", () => {
    localStorage.setItem("sepsi.lang", "hu");
    render(<LegalPage type="privacy" lang="ro" />);
    expect(
      screen.getByRole("heading", { name: /Politică de Confidențialitate/ }),
    ).toBeInTheDocument();
  });

  it("lets the visitor leave the forced language with the in-page switch", async () => {
    render(<LegalPage type="terms" lang="ro" />);
    await userEvent.click(screen.getByRole("button", { name: "Magyar" }));
    expect(
      screen.getByRole("heading", { name: /Felhasználási Feltételek és Jogi Nyilatkozat/ }),
    ).toBeInTheDocument();
  });

  it("offers an English toggle and renders English terms text", () => {
    render(<LegalPage type="terms" lang="en" />);
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/terms/i);
  });
});
