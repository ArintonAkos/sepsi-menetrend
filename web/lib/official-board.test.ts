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
    ], "Gara CFR", "weekday");

    expect(board).toEqual([{
      stopRo: "Gara CFR", lineId: "2D", destination: "Câmpul Frumos / Szépmező",
      weekday: [305, 380], weekend: [305],
    }]);
  });
});
