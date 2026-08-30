import { describe, it, expect } from "vitest";
import { decodeTrip } from "@/lib/share";

/** The SEO pages hand off to the planner through the query string
 *  (`/?from=…&to=…`, `/?line=…`, `/?stop=…`). None of that code changed in the
 *  SEO work, but a regression there would silently break every CTA on every
 *  generated page - so lock the contract the pages depend on. */
describe("planner deep links the SEO pages rely on", () => {
  it("decodes a from/to journey link with names that contain spaces", () => {
    const t = decodeTrip(
      "?from=25.795250,45.871250,Csíki utca 2&to=25.780000,45.880000,Megyei Kórház&at=08:00",
    );
    expect(t.from?.name).toBe("Csíki utca 2");
    expect(t.from?.at).toEqual([25.79525, 45.87125]);
    expect(t.to?.name).toBe("Megyei Kórház");
    expect(t.time).toBe("08:00");
  });

  it("keeps a plain shared link working", () => {
    const t = decodeTrip("?from=25.795,45.871,Gara&to=25.79,45.88,Spital");
    expect(t.from?.name).toBe("Gara");
    expect(t.to?.name).toBe("Spital");
  });
});
