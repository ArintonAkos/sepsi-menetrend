import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  encodePolyline, lineMapName, lineMapHash, staticMapUrl, mapImage,
} from "./line-maps";
import { loadNetwork } from "./network";
import { lineDirections } from "./lines";

describe("encodePolyline", () => {
  it("matches the reference vector from the Google spec", () => {
    // (38.5,-120.2),(40.7,-120.95),(43.252,-126.453) -> "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    // our input is [lng,lat]; encoder emits lat,lng order internally
    expect(encodePolyline([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]))
      .toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });
  it("round-trips a real line shape without throwing and stays URL-safe-ish", () => {
    const net = loadNetwork();
    const p = net.patterns[0];
    const enc = encodePolyline(p.shape as [number, number][]);
    expect(enc.length).toBeGreaterThan(0);
    expect(enc.length).toBeLessThan(4000); // well under Mapbox's ~8k overlay limit
  });
});

describe("lineMapName", () => {
  it("names by line id and direction index", () => {
    expect(lineMapName("1", 0)).toBe("line-1-0");
    expect(lineMapName("1D", 1)).toBe("line-1D-1");
  });
});

describe("lineMapHash", () => {
  const base = {
    shape: [[25.77, 45.86], [25.78, 45.87]] as [number, number][],
    termini: [[25.77, 45.86], [25.78, 45.87]] as [[number, number], [number, number]],
    colour: "#123456",
  };
  it("is stable for the same input", () => {
    expect(lineMapHash(base)).toBe(lineMapHash({ ...base }));
  });
  it("changes when the shape changes", () => {
    expect(lineMapHash({ ...base, shape: [[25.77, 45.86], [25.79, 45.88]] }))
      .not.toBe(lineMapHash(base));
  });
  it("changes when the colour changes", () => {
    expect(lineMapHash({ ...base, colour: "#654321" })).not.toBe(lineMapHash(base));
  });
});

describe("staticMapUrl", () => {
  const net = loadNetwork();
  it("targets the Static Images API with the light style, 1x size and the token", () => {
    const p = net.patterns.find((x) => x.lineId === "1")!;
    const first = net.stops.find((s) => s.id === p.stopIds[0])!;
    const last = net.stops.find((s) => s.id === p.stopIds.at(-1))!;
    const url = staticMapUrl(
      { shape: p.shape as [number, number][], termini: [first.at, last.at], colour: "#E8A33D" },
      "pk.TESTTOKEN",
    );
    expect(url).toMatch(/^https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\/light-v11\/static\//);
    expect(url).toContain("path-4+e8a33d-0.9(");   // stroke width, colour (lowercased), opacity
    expect(url).toContain("pin-s+e8a33d(");
    expect(url).toContain("/auto/640x360");
    expect(url).toContain("access_token=pk.TESTTOKEN");
    expect(url).toContain("padding=28");
  });
});

describe("mapImage", () => {
  const net = loadNetwork();
  it("returns the public path when the baked file exists, else null", () => {
    const has = existsSync(join(process.cwd(), "public", "maps", "line-1-0.png"));
    expect(mapImage("1", 0)).toBe(has ? "/maps/line-1-0.png" : null);
  });
});

describe("manifest ↔ hash drift", () => {
  it("every committed manifest hash matches lineMapHash recomputed from the feed", () => {
    const manifestPath = join(process.cwd(), ".line-maps-manifest.json");
    if (!existsSync(manifestPath)) return; // the gen-maps script creates it
    const manifest = JSON.parse(require("node:fs").readFileSync(manifestPath, "utf8"));
    const net = loadNetwork();
    for (const line of net.lines) {
      lineDirections(net, line.id).forEach((dir, i) => {
        const name = lineMapName(line.id, i);
        if (!(name in manifest)) return;
        const pattern = net.patterns.find((p) => p.id === dir.patternId)!;
        const first = net.stops.find((s) => s.id === dir.stopIds[0])!;
        const last = net.stops.find((s) => s.id === dir.stopIds.at(-1))!;
        const line0 = net.lines.find((l) => l.id === line.id)!;
        expect(manifest[name]).toBe(lineMapHash({
          shape: pattern.shape, termini: [first.at, last.at],
          colour: line0.light ?? "#555555",
        }));
      });
    }
  });
});
