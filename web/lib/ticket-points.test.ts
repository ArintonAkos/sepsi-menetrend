import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  openStateAt,
  isOpenAt,
  isRoHoliday,
  localIsoDate,
  rankTicketPoints,
  ticketPointsNear,
  ticketPointsToPlaces,
  formatHours,
  type TicketPointsFile,
  type RoHolidaysFile,
} from "./ticket-points";

const data: TicketPointsFile = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/ticket-points.json"), "utf8"),
);
const holidays: RoHolidaysFile = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/ro-holidays.json"), "utf8"),
);
const points = data.points;
const HOL = holidays.dates;
const byId = (id: string) => points.find((p) => p.id === id)!;

/** local-time constructor, so getDay()/holidays are not shifted by UTC */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("ticket-points.json integrity", () => {
  it("has the full published network with unique ids", () => {
    expect(points).toHaveLength(22);
    expect(new Set(points.map((p) => p.id)).size).toBe(22);
    expect(points.filter((p) => p.kind === "kiosk")).toHaveLength(3);
    expect(points.filter((p) => p.kind === "machine")).toHaveLength(1);
    expect(points.filter((p) => p.kind === "shop")).toHaveLength(18);
  });

  it("has plausible coordinates and well-formed hours", () => {
    const hhmm = /^([01]\d|2[0-4]):[0-5]\d$/;
    for (const p of points) {
      expect(p.lat).toBeGreaterThan(45.78);
      expect(p.lat).toBeLessThan(45.90);
      expect(p.lng).toBeGreaterThan(25.75);
      expect(p.lng).toBeLessThan(25.86);
      expect(p.sells.length).toBeGreaterThan(0);
      for (const day of [p.hours.mf, p.hours.sat, p.hours.sun]) {
        for (const [from, to] of day) {
          expect(from).toMatch(hhmm);
          expect(to).toMatch(hhmm);
          expect(from < to).toBe(true);
        }
      }
    }
  });

  it("only kiosks sell passes", () => {
    for (const p of points) {
      if (p.sells.includes("pass")) expect(p.kind).toBe("kiosk");
    }
  });
});

describe("localIsoDate / isRoHoliday", () => {
  it("formats the local calendar day, not UTC", () => {
    expect(localIsoDate(at(2026, 12, 1, 23, 30))).toBe("2026-12-01");
    expect(localIsoDate(at(2026, 1, 2, 0, 15))).toBe("2026-01-02");
  });
  it("knows the Romanian public holidays", () => {
    expect(isRoHoliday(at(2026, 12, 1), HOL)).toBe(true); // National Day
    expect(isRoHoliday(at(2026, 4, 13), HOL)).toBe(true); // Orthodox Easter Monday
    expect(isRoHoliday(at(2026, 9, 1), HOL)).toBe(false);
  });
  it("covers this year and next", () => {
    expect(HOL.some((d) => d.startsWith("2026-"))).toBe(true);
    expect(HOL.some((d) => d.startsWith("2027-"))).toBe(true);
  });
});

describe("openStateAt", () => {
  it("the vending machine is always open", () => {
    const m = byId("machine-sala-sporturilor");
    expect(openStateAt(m, at(2026, 9, 1, 3, 0), HOL)).toEqual({ open: true });
    expect(isOpenAt(m, at(2026, 9, 6, 23, 59), HOL)).toBe(true);
  });

  it("a weekday kiosk reports its closing time", () => {
    const s = openStateAt(byId("kiosk-gara"), at(2026, 9, 1, 10, 0), HOL); // Tue
    expect(s.open).toBe(true);
    expect(s.until).toBe("21:30");
  });

  it("after hours it reports the next opening", () => {
    const s = openStateAt(byId("kiosk-gara"), at(2026, 9, 1, 22, 0), HOL); // Tue night
    expect(s.open).toBe(false);
    expect(s.opensAt).toEqual(at(2026, 9, 2, 5, 30)); // Wed 05:30
  });

  it("a weekend-closed kiosk points at Monday", () => {
    const s = openStateAt(byId("kiosk-gara"), at(2026, 9, 5, 10, 0), HOL); // Sat
    expect(s.open).toBe(false);
    expect(s.opensAt).toEqual(at(2026, 9, 7, 5, 30)); // Mon 05:30
  });

  it("handles a mid-day break", () => {
    const k = byId("kiosk-simeria"); // Mon–Fri 07–12, 16–21
    expect(openStateAt(k, at(2026, 9, 1, 9, 0), HOL).open).toBe(true);
    const gap = openStateAt(k, at(2026, 9, 1, 13, 0), HOL);
    expect(gap.open).toBe(false);
    expect(gap.opensAt).toEqual(at(2026, 9, 1, 16, 0)); // same day, 2nd interval
    const s = openStateAt(k, at(2026, 9, 1, 17, 0), HOL);
    expect(s.open).toBe(true);
    expect(s.until).toBe("21:00");
  });

  it("treats a public holiday as Sunday", () => {
    // 2026-12-01 is a Tuesday but a national holiday -> kiosk uses Sunday (closed)
    expect(isOpenAt(byId("kiosk-gara"), at(2026, 12, 1, 10, 0), HOL)).toBe(false);
    // a shop open on Sundays stays open on the holiday
    expect(isOpenAt(byId("shop-jutti-dealului"), at(2026, 12, 1, 12, 0), HOL)).toBe(true);
  });
});

describe("rankTicketPoints", () => {
  it("puts open points first, then orders by distance", () => {
    const origin: [number, number] = [25.786, 45.863]; // town centre-ish
    const ranked = rankTicketPoints(points, origin, at(2026, 9, 6, 12, 0), HOL); // Sunday noon
    const firstClosedIdx = ranked.findIndex((r) => !r.state.open);
    const lastOpenIdx = ranked.map((r) => r.state.open).lastIndexOf(true);
    expect(lastOpenIdx).toBeLessThan(firstClosedIdx === -1 ? Infinity : firstClosedIdx);
    // within the open group, distance is non-decreasing
    const open = ranked.filter((r) => r.state.open);
    for (let i = 1; i < open.length; i++) {
      expect(open[i].metres).toBeGreaterThanOrEqual(open[i - 1].metres);
    }
  });
});

describe("ticketPointsNear", () => {
  it("returns only points within the radius, nearest first", () => {
    const gara: [number, number] = [25.81019, 45.86323];
    const near = ticketPointsNear(points, gara, 150);
    expect(near.length).toBeGreaterThanOrEqual(1);
    expect(near[0].id).toBe("kiosk-gara");
    for (const p of near) {
      expect(Math.hypot((p.lng - gara[0]) * 78000, (p.lat - gara[1]) * 111320)).toBeLessThan(200);
    }
  });
});

describe("ticketPointsToPlaces", () => {
  it("maps every point to a searchable ticketPoint place", () => {
    const places = ticketPointsToPlaces(points);
    expect(places).toHaveLength(22);
    expect(places.every((pl) => pl.kind === "ticketPoint")).toBe(true);
    expect(places[0].at).toEqual([points[0].lng, points[0].lat]);
  });
});

describe("formatHours", () => {
  it("renders closed days and non-stop", () => {
    expect(formatHours(byId("kiosk-gara").hours, "hu")).toBe("H–P 05:30–21:30 · Szo zárva · V zárva");
    expect(formatHours(byId("machine-sala-sporturilor").hours, "en")).toBe(
      "Mon–Fri 0–24 · Sat 0–24 · Sun 0–24",
    );
    expect(formatHours(byId("kiosk-simeria").hours, "ro")).toBe(
      "L–V 07:00–12:00, 16:00–21:00 · S închis · D închis",
    );
  });
});
