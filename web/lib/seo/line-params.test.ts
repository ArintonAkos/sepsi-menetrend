import { describe, it, expect } from "vitest";
import { generateStaticParams as huParams } from "@/app/vonalak/[id]/page";
import { generateStaticParams as roParams } from "@/app/ro/linii/[id]/page";
import { generateStaticParams as enParams } from "@/app/en/lines/[id]/page";

/** Every dynamic line route prerenders one page per `Line.id`, under the
 *  lowercased id (`lineSlug`) in every language, so all routes enumerate the
 *  same set. */
describe("line page static params", () => {
  it("generates a param for every one of the 13 lines (HU route)", async () => {
    const params = await huParams();
    expect(params).toHaveLength(13);
    const ids = params.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["1", "1d", "10", "10b"]));
    // Netlify 301s any mixed-case path to lowercase; an uppercase segment here
    // would put the canonical on the redirect, not the page
    expect(ids.every((id) => id === id.toLowerCase())).toBe(true);
  });

  it("enumerates the identical id set on the RO route", async () => {
    const ro = (await roParams()).map((p) => p.id);
    const hu = (await huParams()).map((p) => p.id);
    expect(ro).toEqual(hu);
    expect(ro).toHaveLength(13);
  });

  it("enumerates the identical id set on the EN route", async () => {
    const en = (await enParams()).map((p) => p.id);
    const hu = (await huParams()).map((p) => p.id);
    expect(en).toEqual(hu);
    expect(en).toHaveLength(13);
  });
});
