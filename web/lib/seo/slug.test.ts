import { describe, it, expect } from "vitest";
import { slugify, disambiguate } from "./slug";

describe("slugify", () => {
  it("folds Hungarian and Romanian diacritics to ASCII", () => {
    expect(slugify("Sepsi Aréna")).toBe("sepsi-arena");
    expect(slugify("Str. Ciucului 2")).toBe("str-ciucului-2");
    expect(slugify("Șugaș Băi")).toBe("sugas-bai");
    expect(slugify("N. Iorga sugárút 1")).toBe("n-iorga-sugarut-1");
    expect(slugify("Câmpul Frumos / Szépmező")).toBe("campul-frumos-szepmezo");
  });
  it("collapses separators and trims", () => {
    expect(slugify("  Domb   utca  ")).toBe("domb-utca");
  });
});

describe("disambiguate", () => {
  it("suffixes repeats in stable order", () => {
    const items = [{ n: "Debren" }, { n: "Debren" }, { n: "Sport utca" }];
    const m = disambiguate(items, (i) => i.n);
    expect([...m.values()]).toEqual(["debren", "debren-2", "sport-utca"]);
  });
});
