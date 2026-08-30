import { describe, it, expect } from "vitest";
import { renderOg, guideOg, OG_SIZE, OG_CONTENT_TYPE } from "./og";

describe("renderOg", () => {
  it("returns a 1200x630 PNG for a line card with diacritics", async () => {
    const res = await renderOg({
      kind: "line",
      lang: "ro",
      heading: "Linia 1 · Șugaș Băi",
      sub: "Șugaș Băi – Gara CFR · orar și trasee",
      badge: { text: "1", bg: "#136F29", fg: "#fff" },
    });

    expect(res.headers.get("content-type")).toBe("image/png");
    expect(OG_CONTENT_TYPE).toBe("image/png");
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });

    const buf = Buffer.from(await res.arrayBuffer());
    // PNG magic
    expect(buf.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.length).toBeLessThan(8 * 1024 * 1024);
  });
});

describe("guideOg - English", () => {
  it("renders an English guide card", async () => {
    const img = await guideOg("fares", "en");
    expect(img.status).toBe(200);
  });
});
