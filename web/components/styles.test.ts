/** Rules whose failure is invisible to a DOM test.
 *
 *  jsdom applies no stylesheets, so every component test here can pass while
 *  the page renders unreadably. These read the stylesheet itself and pin the
 *  handful of declarations that carry a real risk of that. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = (name: string) =>
  readFileSync(resolve(import.meta.dirname, name), "utf8");

/** The declarations of one rule, by selector. */
function ruleFor(sheet: string, selector: string): string {
  const at = sheet.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return sheet.slice(at, sheet.indexOf("}", at));
}

describe("the suggestion list on the phone search screen", () => {
  const rule = ruleFor(css("planner/PlaceInput.module.css"), ".inPage");

  it("brings its own background", () => {
    /* The search screen's own ground is the dark olive. A list that drops its
       background to sit flat on a white panel puts dark text on dark green the
       moment it is used anywhere else - which is where it is used. */
    expect(rule).toMatch(/background:\s*var\(--paper\)/);
    expect(rule).not.toMatch(/background:\s*(none|transparent)/);
  });

  it("stays inside the box that scrolls it", () => {
    // a negative margin pushed the rows out through the clipping scroller,
    // slicing the icons down the middle and cutting the rows off on the right
    expect(rule).not.toMatch(/margin:[^;]*-\d/);
  });
});

describe("form controls", () => {
  it("are all at least 16px, or iOS zooms the page on focus", () => {
    // and never zooms back out; maximum-scale=1 would fix it by taking
    // pinch-zoom away from everyone, which is not a fix
    expect(css("../app/globals.css"))
      .toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px/);
    for (const file of ["planner/PlaceInput.module.css", "planner/Planner.module.css"]) {
      for (const [, size] of css(file).matchAll(/input[^{}]*\{[^}]*font-size:\s*(\d+)px/g))
        expect(Number(size), `${file} has an input under 16px`).toBeGreaterThanOrEqual(16);
    }
  });
});

describe("every animation a module asks for is one it can reach", () => {
  /* CSS modules scope keyframe names, and they rewrite the name inside an
     `animation` shorthand to match. A module that names a keyframe declared in
     the global stylesheet therefore animates nothing - silently, because the
     element simply stays in its resting state and looks fine. This has now bitten
     twice: once here, and once as :global(.searching), which named a hashed class
     the same way. Nothing about either failure is visible to a DOM test. */
  const modules = [
    "journey/JourneyList.module.css", "journey/JourneyDetail.module.css",
    "planner/PlaceInput.module.css", "planner/Planner.module.css",
    "timetable/Timetable.module.css",
  ];
  for (const file of modules) {
    it(file, () => {
      const sheet = css(file);
      const declared = new Set(
        [...sheet.matchAll(/@keyframes\s+([A-Za-z][\w-]*)/g)].map((m) => m[1]));
      const named = new Set<string>();
      for (const [, value] of sheet.matchAll(/animation(?:-name)?:\s*([^;}]+)/g)) {
        for (const word of value.split(/[\s,]+/)) {
          // skip durations, easings, keywords and var() references
          if (/^(none|both|forwards|backwards|infinite|alternate|reverse|running|paused|normal|ease[\w-]*|linear|step[\w-]*|cubic-bezier|\d|-|var|\.)/.test(word)
              || word === "" || word.includes("(") || word.endsWith(")")) continue;
          named.add(word);
        }
      }
      for (const name of named)
        expect(declared, `${file} animates "${name}", which it does not declare`)
          .toContain(name);
    });
  }
});

describe("global stylesheet", () => {
  it("declares no keyframes that only modules use", () => {
    // they would be unreachable from there, so their presence is a trap
    const global = css("../app/globals.css");
    const used = modulesUsing();
    for (const [, name] of global.matchAll(/@keyframes\s+([A-Za-z][\w-]*)/g))
      expect(used, `globals.css declares "${name}", which only modules animate`)
        .not.toContain(name);
  });
});

function modulesUsing(): string[] {
  const out = new Set<string>();
  for (const file of ["journey/JourneyList.module.css", "journey/JourneyDetail.module.css",
                      "planner/PlaceInput.module.css", "planner/Planner.module.css",
                      "timetable/Timetable.module.css"])
    for (const [, value] of css(file).matchAll(/animation(?:-name)?:\s*([^;}]+)/g))
      for (const word of value.split(/[\s,]+/))
        if (/^[A-Za-z][\w-]*$/.test(word) && !/^(none|both|ease|linear|infinite|forwards|normal|alternate|reverse|running|paused|backwards)$/.test(word))
          out.add(word);
  return [...out];
}

describe("press feedback", () => {
  it("dims rather than scales", () => {
    /* `transform` is a single property. A control centred with
       translateY(-50%) - the pin inside a field, the swap button between the
       two - loses that centring the instant a global :active rule sets a scale,
       and jumps half its height down the page while your finger is on it. */
    const global = css("../app/globals.css");
    const press = /:active[^{]*\{([^}]*)\}/.exec(global.slice(global.indexOf("button:active")));
    expect(press?.[1]).toMatch(/opacity/);
    expect(press?.[1], "a global press transform will displace positioned buttons")
      .not.toMatch(/transform/);
  });

  it("keeps a control's own transform whole where one is used", () => {
    // the swap button rotates on press, and has to restate its centring
    const rule = /\.swap:active\s*\{([^}]*)\}/.exec(css("planner/Planner.module.css"));
    expect(rule?.[1]).toMatch(/translateY\(-50%\)/);
  });
});

describe("what gets deployed", () => {
  const publicDir = (name: string) =>
    readFileSync(resolve(import.meta.dirname, "../public", name));

  it("ships no local development certificate", () => {
    /* mkcert's root CA lived in public/ and was copied into every build.
       It is not a secret - it is the public half - but serving a CA from your
       own domain is an invitation to install it, and nothing about this site
       needs one. */
    expect(() => publicDir("rootCA.pem")).toThrow();
  });

  it("ships no leftovers from the project template", () => {
    for (const junk of ["next.svg", "vercel.svg", "globe.svg", "window.svg", "file.svg"])
      expect(() => publicDir(junk), `${junk} is still in public/`).toThrow();
  });

  it("has a preview image at the size every crawler expects", () => {
    // 1200x630, read out of the PNG header rather than trusted
    const png = publicDir("og.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("points Open Graph at an absolute URL", () => {
    // a relative image path shows nothing at all when the link is shared
    const layout = readFileSync(
      resolve(import.meta.dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toMatch(/metadataBase/);
    expect(layout).toMatch(/openGraph/);
    expect(layout).toMatch(/summary_large_image/);
  });

  it("never lets the service worker be cached", () => {
    /* It decides when every other file is replaced. Held even briefly, a stale
       one keeps serving the old app long after a deploy. */
    const netlify = readFileSync(
      resolve(import.meta.dirname, "../../netlify.toml"), "utf8");
    const rule = /for = "\/sw\.js"[\s\S]*?Cache-Control = "([^"]+)"/.exec(netlify);
    expect(rule?.[1]).toMatch(/max-age=0/);
    expect(netlify).toMatch(/publish = "out"/);
  });

  it("puts a favicon on the page at all", () => {
    /* Naming `icons` in metadata overrides the app/icon file convention, so an
       icon file sitting in app/ next to an icons block is simply ignored - and
       the page shipped with no favicon link of any kind, which looks exactly
       like everything working. */
    const layout = readFileSync(
      resolve(import.meta.dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toMatch(/icons\.svg|icon\.svg/);
    expect(() => publicDir("icons/icon.svg")).not.toThrow();
    expect(() => publicDir("icons/icon-64.png")).not.toThrow();
  });

  it("wears the same mark in the tab as on the home screen", () => {
    // one logo, or the installed app and the browser tab look like two products
    const svg = publicDir("icons/icon.svg").toString();
    expect(svg).toContain("#2E3D14");   // the olive ground
    expect(svg).toContain("#EFC913");   // the signal yellow
  });
});

describe("the balloon around a stop board", () => {
  it("styles the frame and nothing inside it", () => {
    /* The popup used to be built from an HTML string, and its stylesheet set
       `display: block` on every b and span within. The string went; the rules
       stayed, and went on matching the React card that replaced it - which is
       why a line number sat in the corner of its own pill rather than the
       middle. Content styling belongs to whatever renders the content. */
    const sheet = css("map/TransitMap.module.css");
    const popup = sheet.slice(sheet.indexOf("stopPopup"));
    for (const reach of ["stopPopup b)", "stopPopup span)", "stopPopup .lines"])
      expect(popup, `TransitMap still reaches into the card with "${reach}"`)
        .not.toContain(reach);
  });
});
