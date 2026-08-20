import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeTrip, decodeTrip, shareLink } from "./share";

const gara = { name: "Vasútállomás", at: [25.7876, 45.8636] as [number, number] };
const arena = { name: "Sepsi Aréna", at: [25.8012, 45.8598] as [number, number] };

describe("a plan in a link", () => {
  it("comes back the way it went in", () => {
    const link = encodeTrip({ from: gara, to: arena, time: "08:30", mode: "arriveBy" });
    const back = decodeTrip(link);
    expect(back.from).toEqual(gara);
    expect(back.to).toEqual(arena);
    expect(back.time).toBe("08:30");
    expect(back.mode).toBe("arriveBy");
  });

  it("survives a name with a comma in it", () => {
    // the separator is a comma, and Romanian stop names use them
    const awkward = { name: "Coșeni, Strada 73", at: [25.798, 45.814] as [number, number] };
    expect(decodeTrip(encodeTrip({ from: awkward, to: null, time: null, mode: null })).from)
      .toEqual(awkward);
  });

  it("keeps the default out of the link", () => {
    // a share of the ordinary case should read as a plain pair of places
    const link = encodeTrip({ from: gara, to: arena, time: "08:30", mode: "departAt" });
    expect(link).not.toContain("mode");
  });

  it("plans from coordinates even when the name is gone", () => {
    const back = decodeTrip("?from=25.787600,45.863600");
    expect(back.from?.at).toEqual([25.7876, 45.8636]);
    expect(back.from?.name).toBeTruthy();
  });

  it("refuses nonsense rather than planning from NaN", () => {
    for (const bad of ["?from=", "?from=x,y,Sehol", "?from=,,"])
      expect(decodeTrip(bad).from, bad).toBeNull();
    expect(decodeTrip("?at=25:99").time).toBeNull();
    expect(decodeTrip("?mode=sideways").mode).toBeNull();
  });

  it("is a relative query, so it attaches to whatever host serves the app", () => {
    expect(encodeTrip({ from: gara, to: null, time: null, mode: null })).toMatch(/^\?/);
    expect(encodeTrip({ from: null, to: null, time: null, mode: null })).toBe("");
  });
});

describe("handing the link over", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("uses the share sheet when the device has one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    expect(await shareLink("https://x/y", "T", "A → B")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "T", text: "A → B", url: "https://x/y" });
  });

  it("treats a cancelled sheet as done, not as a reason to copy", async () => {
    /* Dismissing the share sheet is a decision. Falling through to the
       clipboard would overwrite whatever the reader had in it, silently. */
    const writeText = vi.fn();
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new DOMException("no", "AbortError")),
      clipboard: { writeText },
    });
    expect(await shareLink("https://x/y", "T", "A")).toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies when there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await shareLink("https://x/y", "T", "A")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://x/y");
  });

  it("says so when it can do neither", async () => {
    vi.stubGlobal("navigator", {});
    expect(await shareLink("https://x/y", "T", "A")).toBe("failed");
  });
});
