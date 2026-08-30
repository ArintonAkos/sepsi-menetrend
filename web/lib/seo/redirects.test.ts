import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");

// Netlify's own splat/status keywords - the renamed-path map lives in the toml,
// not in code, so the only thing to check is that the file still carries it.
const rules = [
  { from: "/hu/*", to: "/:splat" },
  { from: "/lines/*", to: "/vonalak/:splat" },
  { from: "/stops/*", to: "/megallok/:splat" },
  { from: "/terms/*", to: "/felhasznalasi-feltetelek/:splat" },
  { from: "/privacy/*", to: "/adatvedelem/:splat" },
];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("netlify redirects", () => {
  it("301s /hu/* to the bare path", () => {
    expect(toml).toMatch(/from = "\/hu\/\*"[\s\S]*?status = 301/);
  });

  it.each(rules)("301s $from to $to", ({ from, to }) => {
    const block = new RegExp(
      `\\[\\[redirects\\]\\]\\s*\\n\\s*from = "${esc(from)}"\\s*\\n` +
        `\\s*to = "${esc(to)}"\\s*\\n\\s*status = 301`,
    );
    expect(toml).toMatch(block);
  });

  it("keeps the redirects above the headers blocks", () => {
    expect(toml.indexOf("[[redirects]]")).toBeGreaterThan(-1);
    expect(toml.indexOf("[[redirects]]")).toBeLessThan(toml.indexOf("[[headers]]"));
  });
});

// Only meaningful after `npm run build` has emitted the static export; skipped
// on a bare checkout so `npm test` stays green without a build.
const built = new URL("../../out/404.html", import.meta.url);

describe("built 404 page", () => {
  it.skipIf(!existsSync(built))(
    "ships the four homepage links and a bilingual heading",
    () => {
      const html = readFileSync(built, "utf8");
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/buszmenetrend/"');
      expect(html).toContain('href="/ro/"');
      expect(html).toContain('href="/ro/orar-autobuz/"');
      expect(html).toMatch(/nem található/);
      expect(html).toMatch(/nu a fost găsită/i);
    },
  );
});
