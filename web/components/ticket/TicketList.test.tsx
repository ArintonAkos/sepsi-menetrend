import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STRINGS } from "@/lib/i18n";
import type { TicketPointsFile, RoHolidaysFile } from "@/lib/ticket-points";
import TicketList from "./TicketList";

const points = (JSON.parse(
  readFileSync(join(process.cwd(), "public/data/ticket-points.json"), "utf8"),
) as TicketPointsFile).points;
const holidays = (JSON.parse(
  readFileSync(join(process.cwd(), "public/data/ro-holidays.json"), "utf8"),
) as RoHolidaysFile).dates;

const base = {
  points, holidays, lang: "hu" as const, t: STRINGS.hu,
  onRouteTo: () => {}, onClose: () => {},
};

describe("TicketList", () => {
  it("lists every sales point with its localized title", () => {
    render(<TicketList {...base} origin={null} />);
    expect(screen.getByRole("heading", { name: "Jegyárusítás" })).toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((b) => b.querySelector("span"))).toHaveLength(22);
    expect(screen.getByText("Vasútállomás")).toBeInTheDocument();
  });

  it("orders open points before shut ones", () => {
    render(<TicketList {...base} origin={null} />);
    const badges = [...document.querySelectorAll("[class*='open'], [class*='shut']")]
      .map((el) => (el.className.includes("shut") ? "shut" : "open"));
    const firstShut = badges.indexOf("shut");
    const lastOpen = badges.lastIndexOf("open");
    if (firstShut !== -1 && lastOpen !== -1) expect(lastOpen).toBeLessThan(firstShut);
  });

  it("shows a walk estimate only when an origin is given", () => {
    const { rerender } = render(<TicketList {...base} origin={null} />);
    expect(screen.queryByText(/perc gyalog/)).toBeNull();
    rerender(<TicketList {...base} origin={[25.81019, 45.86323]} />);
    expect(screen.getAllByText(/perc gyalog/).length).toBeGreaterThan(0);
  });

  it("routes to the point when its row is tapped", () => {
    const onRouteTo = vi.fn();
    render(<TicketList {...base} origin={null} onRouteTo={onRouteTo} />);
    screen.getByText("Vasútállomás").closest("button")!.click();
    expect(onRouteTo).toHaveBeenCalledWith(expect.objectContaining({ id: "kiosk-gara" }));
  });

  it("localizes the heading", () => {
    render(<TicketList {...base} lang="en" t={STRINGS.en} origin={null} />);
    expect(screen.getByRole("heading", { name: "Ticket sellers" })).toBeInTheDocument();
  });
});
