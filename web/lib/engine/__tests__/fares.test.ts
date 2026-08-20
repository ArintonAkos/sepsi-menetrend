import { describe, it, expect } from "vitest";
import { countTickets } from "../fares";

describe("countTickets", () => {
  it("charges nothing for no ride", () => expect(countTickets([], 50)).toBe(0));

  it("covers a transfer inside the window with one ticket", () => {
    expect(countTickets([480, 505], 50)).toBe(1);   // 08:00 then 08:25
  });

  it("needs a second ticket once the window has passed", () => {
    expect(countTickets([480, 535], 50)).toBe(2);   // 08:00 then 08:55
  });

  it("treats the boundary as still valid", () => {
    expect(countTickets([480, 530], 50)).toBe(1);   // exactly 50 minutes later
    expect(countTickets([480, 531], 50)).toBe(2);
  });

  it("restarts the clock from the new ticket, not the first", () => {
    // 08:00, 09:00, 09:40 -> ticket at 08:00, ticket at 09:00 covers 09:40
    expect(countTickets([480, 540, 580], 50)).toBe(2);
  });

  it("does not care what order the boardings arrive in", () => {
    expect(countTickets([535, 480], 50)).toBe(2);
  });

  it("is why the 45 -> 50 minute correction mattered", () => {
    const boardings = [480, 527];                   // 47 minutes apart
    expect(countTickets(boardings, 45)).toBe(2);
    expect(countTickets(boardings, 50)).toBe(1);
  });
});
