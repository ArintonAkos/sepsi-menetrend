import { describe, it, expect } from "vitest";
import { serviceNoticeState } from "./service-notice";

describe("serviceNoticeState", () => {
  it("shows on a public holiday that has not been dismissed", () => {
    expect(serviceNoticeState(new Date(2026, 11, 1), ["20261201"], null))
      .toEqual({ show: true });
  });

  it("stays hidden on an ordinary weekday", () => {
    expect(serviceNoticeState(new Date(2026, 8, 21), ["20261201"], null))
      .toEqual({ show: false });
    expect(serviceNoticeState(new Date(2026, 8, 21), undefined, null))
      .toEqual({ show: false });
  });

  it("stays hidden once dismissed for that date", () => {
    expect(serviceNoticeState(new Date(2026, 11, 1), ["20261201"], "20261201"))
      .toEqual({ show: false });
  });

  it("comes back on a different holiday after being dismissed for an earlier one", () => {
    expect(serviceNoticeState(new Date(2027, 0, 1), ["20261201", "20270101"], "20261201"))
      .toEqual({ show: true });
  });
});
