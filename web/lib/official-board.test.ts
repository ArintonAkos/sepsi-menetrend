import { describe, expect, it } from "vitest";
import { officialBoardAt } from "./official-board";

describe("the official stop-board data", () => {
  it("returns published times for the selected stop and service", () => {
    const board = officialBoardAt([
      {
        stopRo: "Gara CFR", lineId: "2D", destination: "Câmpul Frumos / Szépmező",
        weekday: [305, 380], weekend: [305],
      },
      {
        stopRo: "Arena Sepsi", lineId: "5", destination: "Str. József Attila / József Attila utca",
        weekday: [415], weekend: [400],
      },
    ], "P52", "Gara CFR", "weekday");

    expect(board).toEqual([{
      stopRo: "Gara CFR", lineId: "2D", destination: "Câmpul Frumos / Szépmező",
      weekday: [305, 380], weekend: [305],
    }]);
  });

  it("does not copy a circular line's opposite destination to this physical pass", () => {
    const boards = [
      { stopRo: "Str. Constructorilor 2", lineId: "4", destination: "Câmpul Frumos / Szépmező", weekday: [319], weekend: [] },
      { stopRo: "Str. Constructorilor 2", lineId: "4", destination: "Str. Fabricii / Gyár utca", weekday: [261], weekend: [] },
    ];

    expect(officialBoardAt(boards, "P76", "Str. Constructorilor 2", "weekday",
      new Map([["4", new Set(["Str. Fabricii / Gyár utca"])]]))).toEqual([boards[1]]);
  });

  it("uses the physical platform binding before the shared display name", () => {
    const boards = [
      { stopId: "P75", stopRo: "Str. Constructorilor 2", lineId: "4", destination: "Câmpul Frumos / Szépmező", weekday: [319], weekend: [] },
      { stopId: "P76", stopRo: "Str. Constructorilor 2", lineId: "4", destination: "Str. Fabricii / Gyár utca", weekday: [261], weekend: [] },
    ];

    expect(officialBoardAt(boards, "P76", "Str. Constructorilor 2", "weekday")).toEqual([boards[1]]);
  });
});
