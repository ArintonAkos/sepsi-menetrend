import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";
import { enrichLine, lineDirections, boardFor, firstLast, headway } from "./lines";

const net = loadNetwork();

describe("enrichLine", () => {
  it("builds a language-specific label", () => {
    expect(enrichLine(net, "1", "hu").label).toBe("1-es busz");
    expect(enrichLine(net, "1", "ro").label).toBe("linia 1");
    expect(enrichLine(net, "1D", "hu").label).toBe("1D-s busz");
    // 1B takes "-s" like the D lines ("egybé-s").
    expect(enrichLine(net, "1B", "hu").label).toBe("1B-s busz");
    expect(enrichLine(net, "1B", "ro").label).toBe("linia 1B");
    expect(enrichLine(net, "1B", "en").label).toBe("line 1B");
  });

  it("labels a line in English as 'line {id}', id case kept", () => {
    expect(enrichLine(net, "1", "en").label).toBe("line 1");
    const d = net.lines.find((l) => l.id.endsWith("D"));
    if (d) expect(enrichLine(net, d.id, "en").label).toBe(`line ${d.id}`);
  });

  it("titles the line with its primary-direction termini in the asked language", () => {
    const hu = enrichLine(net, "1", "hu");
    expect(hu.id).toBe("1");
    expect(hu.termini).toEqual(["Szemerja (Gólya utca)", "Vasútállomás"]);
    expect(hu.title).toBe("1-es busz · Szemerja (Gólya utca) – Vasútállomás");
    expect(hu.colour).toBe("#136F29");
    expect(hu.textColour).toBe("#ffffff");

    const ro = enrichLine(net, "1", "ro");
    expect(ro.termini).toEqual(["Simeria (Str. Berzei)", "Gara CFR"]);
    // label stays lowercase, title is sentence-cased for the <h1>/<title>
    expect(ro.label).toBe("linia 1");
    expect(ro.title).toBe("Linia 1 · Simeria (Str. Berzei) – Gara CFR");
  });

  it("keeps the id's own case in the RO label - '1D', never '1d'", () => {
    expect(enrichLine(net, "1D", "ro").label).toBe("linia 1D");
    expect(enrichLine(net, "1D", "ro").title.startsWith("Linia 1D · ")).toBe(true);
  });
});

describe("lineDirections", () => {
  it("collapses patterns that share a stop sequence, longest first", () => {
    // multitrans.ro's Sept 15 jaratok/ pages give 1D a 15-stop outbound leg
    // and a 14-stop return leg, so outbound sorts first.
    const dirs = lineDirections(net, "1D");
    expect(dirs.map((d) => d.patternId)).toEqual(["P8", "P15"]);
    expect(Object.keys(dirs[0])).toEqual(["patternId", "headsign", "stopIds"]);
    expect(dirs[0].headsign).toEqual({
      hu: "Simeria (Str. Berzei) → Câmpul Frumos",
      ro: "Simeria (Str. Berzei) → Câmpul Frumos",
    });
    expect(dirs[0].stopIds.length).toBe(15);
  });

  it("orders the distinct sequences by length, descending", () => {
    const dirs = lineDirections(net, "5");
    expect(dirs.length).toBe(2);
    expect(dirs[0].stopIds.length).toBe(17);
    expect(dirs[1].stopIds.length).toBe(12);
  });
});

describe("boardFor", () => {
  it("returns published departure minutes for a served stop", () => {
    // P20 Arena Sepsi is served by line 5 (see officialBoards)
    const b = boardFor(net, "5", "P20");
    expect(b).not.toBeNull();
    expect(b!.weekday[0]).toBeGreaterThan(240);
    expect(b!.weekday).toEqual([...b!.weekday].sort((a, z) => a - z));
  });

  it("folds the marked D-extension departures into the sorted list without duplicating", () => {
    const b = boardFor(net, "5", "P23")!;
    expect(b.weekday).toContain(1371); // a departure the operator marks as a D extension
    expect(b.weekday).toEqual([...b.weekday].sort((a, z) => a - z));
    expect(new Set(b.weekday).size).toBe(b.weekday.length);
  });

  it("returns null when the line has no column at that stop", () => {
    expect(boardFor(net, "1", "P20")).toBeNull(); // line 1 never calls at Arena Sepsi
    expect(boardFor(net, "5", "P999")).toBeNull(); // no such stop
  });
});

describe("firstLast", () => {
  it("reports the first and last departure per service", () => {
    const fl = firstLast(boardFor(net, "5", "P20")!);
    expect(fl.weekday).toEqual({ first: 420, last: 1330 });
    expect(fl.weekend).toEqual({ first: 480, last: 1200 });
  });

  it("returns null for a service with no departures", () => {
    expect(firstLast({ weekday: [], weekend: [480] })).toEqual({
      weekday: null,
      weekend: { first: 480, last: 480 },
    });
  });
});

describe("headway", () => {
  it("detects a regular 30-minute cadence", () => {
    expect(headway([360, 390, 420, 450, 480])).toBe(30);
  });
  it("tolerates the odd stretched gap", () => {
    expect(headway([0, 20, 40, 60, 80, 200, 220, 240])).toBe(20);
  });
  it("returns null for irregular times", () => {
    expect(headway([360, 372, 500, 505, 900])).toBeNull();
  });
  it("returns null without at least one gap", () => {
    expect(headway([])).toBeNull();
    expect(headway([420])).toBeNull();
  });
});
