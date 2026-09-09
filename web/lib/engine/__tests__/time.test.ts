import { describe, it, expect } from "vitest";
import { parseHHMM, formatHHMM, serviceForDate, isSchoolDay, forwardDelta } from "../time";

describe("parseHHMM", () => {
  it("reads normal times", () => {
    expect(parseHHMM("07:25")).toBe(445);
    expect(parseHHMM("00:00")).toBe(0);
  });
  it("reads GTFS times past midnight", () => {
    expect(parseHHMM("25:10")).toBe(1510);
  });
  it("tolerates seconds, which GTFS always writes", () => {
    expect(parseHHMM("07:25:00")).toBe(445);
  });
  it("rejects nonsense rather than returning NaN", () => {
    expect(() => parseHHMM("half past seven")).toThrow();
  });
});

describe("formatHHMM", () => {
  it("pads", () => expect(formatHHMM(445)).toBe("07:25"));
  it("wraps a trip that runs past midnight", () => expect(formatHHMM(1510)).toBe("01:10"));
  it("wraps negative values instead of printing a minus", () =>
    expect(formatHHMM(-30)).toBe("23:30"));
});

describe("serviceForDate", () => {
  it("splits the week the way the operator publishes it", () => {
    expect(serviceForDate(new Date(2026, 7, 19))).toBe("weekday");  // Wednesday
    expect(serviceForDate(new Date(2026, 7, 22))).toBe("weekend");  // Saturday
    expect(serviceForDate(new Date(2026, 7, 23))).toBe("weekend");  // Sunday
  });
});

describe("isSchoolDay", () => {
  const terms: [string, string][] = [["20260907", "20261023"]];
  it("true on a teaching weekday", () =>
    expect(isSchoolDay(new Date(2026, 8, 9), terms, ["20261005"])).toBe(true));   // Wed Sep 9
  it("false on the Oct 5 exception", () =>
    expect(isSchoolDay(new Date(2026, 9, 5), terms, ["20261005"])).toBe(false));
  it("false in the summer", () =>
    expect(isSchoolDay(new Date(2026, 7, 15), terms, ["20261005"])).toBe(false));
  it("false on a term weekend", () =>
    expect(isSchoolDay(new Date(2026, 8, 12), terms, [])).toBe(false));           // Sat
});

describe("serviceForDate with a calendar", () => {
  const cal = {
    schoolTerms: [["20260907", "20261023"]] as [string, string][],
    schoolExceptions: [] as string[],
  };
  it("school on a teaching weekday", () =>
    expect(serviceForDate(new Date(2026, 8, 9), cal)).toBe("school"));
  it("weekend stays weekend", () =>
    expect(serviceForDate(new Date(2026, 8, 12), cal)).toBe("weekend"));
  it("weekday out of term", () =>
    expect(serviceForDate(new Date(2026, 10, 16), cal)).toBe("weekday"));   // Mon Nov 16, past the single term
});

describe("forwardDelta", () => {
  it("measures forward in time", () => expect(forwardDelta(600, 660)).toBe(60));
  it("crosses midnight instead of going negative", () =>
    expect(forwardDelta(1430, 20)).toBe(30));
});
