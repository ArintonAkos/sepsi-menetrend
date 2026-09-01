import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import TicketPoints from "./TicketPoints";

const hasMap = existsSync(join(process.cwd(), "public/maps/ticket-points.png"));

describe("TicketPoints", () => {
  it("lists the whole sales network, grouped by kind", () => {
    const { container } = render(<TicketPoints lang="hu" />);
    const headings = [...container.querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings).toEqual([
      "Multi-Trans jegypénztárak",
      "Jegyautomata",
      "Boltok és hírlapárusok",
    ]);
    // 3 kiosks + 1 machine + 18 shops
    expect(container.querySelectorAll("li")).toHaveLength(22);
  });

  it("shows the pass-desk hours only for kiosks", () => {
    const { container } = render(<TicketPoints lang="hu" />);
    const withPass = [...container.querySelectorAll("li")].filter((li) =>
      li.textContent?.includes("Bérlet:"),
    );
    // Simeria's pass hours match its ticket hours, so it is omitted; Arcade + Gara differ.
    expect(withPass.length).toBe(2);
  });

  it("renders the localized section heading and a near-stop link", () => {
    for (const [lang, h2] of [
      ["hu", /Hol lehet jegyet venni/],
      ["ro", /De unde se cumpără biletul/],
      ["en", /Where to buy a ticket/],
    ] as const) {
      const { container } = render(<TicketPoints lang={lang} />);
      expect(container.querySelector("h2")?.textContent).toMatch(h2);
      const stopLinks = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
      const base = lang === "hu" ? "/megallok/" : lang === "ro" ? "/ro/statii/" : "/en/stops/";
      expect(stopLinks.some((h) => h?.startsWith(base))).toBe(true);
    }
  });

  it.skipIf(!hasMap)("embeds the baked overview map when it exists", () => {
    const { container } = render(<TicketPoints lang="hu" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/maps/ticket-points.png");
    expect(img?.getAttribute("alt")).toBeTruthy();
  });

  it("the vending machine row reports non-stop hours", () => {
    const { container } = render(<TicketPoints lang="en" />);
    const machineGroup = [...container.querySelectorAll("h3")].find(
      (h) => h.textContent === "Ticket machine",
    )!.nextElementSibling as HTMLElement;
    expect(within(machineGroup).getByText(/0–24/)).toBeInTheDocument();
  });
});
