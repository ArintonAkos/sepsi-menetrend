import { describe, it, expect } from "vitest";
import { serviceNoticeState } from "./service-notice";

describe("serviceNoticeState", () => {
  it("shows while routes are provisional and it has not been dismissed", () => {
    expect(serviceNoticeState(true, false)).toEqual({ show: true });
  });

  it("stays hidden once the feed's routes are no longer provisional", () => {
    expect(serviceNoticeState(false, false)).toEqual({ show: false });
    expect(serviceNoticeState(undefined, false)).toEqual({ show: false });
  });

  it("stays hidden once dismissed", () => {
    expect(serviceNoticeState(true, true)).toEqual({ show: false });
  });
});
