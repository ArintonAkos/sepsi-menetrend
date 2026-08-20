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
  const rule = ruleFor(css("PlaceInput.module.css"), ".inPage");

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
    for (const file of ["PlaceInput.module.css", "Planner.module.css"]) {
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
    "JourneyList.module.css", "JourneyDetail.module.css",
    "PlaceInput.module.css", "Planner.module.css",
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
  for (const file of ["JourneyList.module.css", "JourneyDetail.module.css",
                      "PlaceInput.module.css", "Planner.module.css"])
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
    const rule = /\.swap:active\s*\{([^}]*)\}/.exec(css("Planner.module.css"));
    expect(rule?.[1]).toMatch(/translateY\(-50%\)/);
  });
});
