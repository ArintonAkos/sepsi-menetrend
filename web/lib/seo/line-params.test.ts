import { describe, it, expect } from "vitest";
import { generateStaticParams as huParams } from "@/app/vonalak/[id]/page";
import { generateStaticParams as roParams } from "@/app/ro/linii/[id]/page";
import { generateStaticParams as enParams } from "@/app/en/lines/[id]/page";

/** Both dynamic line routes prerender one page per `Line.id`. The id is used
 *  verbatim in either language, so the two routes must enumerate the same set. */
describe("line page static params", () => {
  it("generates a param for every one of the 12 lines (HU route)", async () => {
    const params = await huParams();
    expect(params).toHaveLength(12);
    const ids = params.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["1", "1D", "10"]));
  });

  it("enumerates the identical id set on the RO route", async () => {
    const ro = (await roParams()).map((p) => p.id);
    const hu = (await huParams()).map((p) => p.id);
    expect(ro).toEqual(hu);
    expect(ro).toHaveLength(12);
  });

  it("enumerates the identical id set on the EN route", async () => {
    const en = (await enParams()).map((p) => p.id);
    const hu = (await huParams()).map((p) => p.id);
    expect(en).toEqual(hu);
    expect(en).toHaveLength(12);
  });
});
