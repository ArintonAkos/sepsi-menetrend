import { describe, it, expect } from "vitest";
import { serviceNoticeState, localYmd, SERVICE_CHANGE_DATE } from "./service-notice";

const at = (y: number, mo: number, d: number) => new Date(y, mo - 1, d, 12, 0);

describe("serviceNoticeState", () => {
  it("shows the 'before' message on the old feed ahead of the change", () => {
    expect(serviceNoticeState("20260807", at(2026, 9, 3), null)).toEqual({ phase: "before" });
  });

  it("switches to 'after' from the change date", () => {
    expect(serviceNoticeState("20260807", at(2026, 9, 7), null)).toEqual({ phase: "after" });
    expect(serviceNoticeState("20260807", at(2026, 9, 12), null)).toEqual({ phase: "after" });
  });

  it("goes silent once the feed's validFrom reaches the new schedule", () => {
    expect(serviceNoticeState("20260907", at(2026, 9, 3), null)).toBeNull();
    expect(serviceNoticeState("20261001", at(2026, 10, 5), null)).toBeNull();
  });

  it("stays dismissed for the phase it was dismissed in", () => {
    expect(serviceNoticeState("20260807", at(2026, 9, 3), "before")).toBeNull();
  });

  it("reappears once when the phase rolls over", () => {
    // dismissed while "before", now it is "after" -> show again
    expect(serviceNoticeState("20260807", at(2026, 9, 8), "before")).toEqual({ phase: "after" });
    // and dismissible again as "after"
    expect(serviceNoticeState("20260807", at(2026, 9, 8), "after")).toBeNull();
  });
});

describe("localYmd", () => {
  it("uses the local calendar day, not UTC", () => {
    expect(localYmd(new Date(2026, 8, 7, 0, 30))).toBe("20260907");
    expect(localYmd(new Date(2026, 8, 6, 23, 30))).toBe("20260906");
  });
  it("matches the network.json format", () => {
    expect(SERVICE_CHANGE_DATE).toMatch(/^\d{8}$/);
  });
});
