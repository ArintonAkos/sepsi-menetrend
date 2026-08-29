import { describe, it, expect } from "vitest";
import { toRomanian } from "./localize";

describe("toRomanian", () => {
  it("switches the html lang and og locale once", () => {
    const src = '<!doctype html><html lang="hu"><head><meta property="og:locale" content="hu_HU"/>';
    const out = toRomanian(src);
    expect(out).toContain('<html lang="ro">');
    expect(out).toContain("ro_RO");
    expect(toRomanian(out)).toBe(out); // idempotent
  });

  it("is idempotent on a document that has no og:locale", () => {
    const src = '<!doctype html><html lang="hu"><head><title>x</title></head><body>szia</body></html>';
    const once = toRomanian(src);
    expect(once).toContain('<html lang="ro">');
    expect(once).not.toContain("hu_HU");
    expect(toRomanian(once)).toBe(once);
  });

  it('leaves lang="hu" inside body text alone - only the <html> tag is stamped', () => {
    const src =
      '<html lang="hu"><body><p>a <span lang="hu">magyar</span> mondat</p></body></html>';
    expect(toRomanian(src)).toBe(
      '<html lang="ro"><body><p>a <span lang="hu">magyar</span> mondat</p></body></html>',
    );
  });
});
