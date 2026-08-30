import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BoardTable from "./BoardTable";

describe("BoardTable", () => {
  it("formats minutes as clock times under weekday/weekend headings", () => {
    render(<BoardTable lang="hu" weekday={[365, 395]} weekend={[420]} />);
    expect(screen.getByText("6:05")).toBeInTheDocument();
    expect(screen.getByText("7:00")).toBeInTheDocument();
  });

  it("labels both sections in the reader's language", () => {
    const { rerender } = render(<BoardTable lang="hu" weekday={[365]} weekend={[420]} />);
    expect(screen.getByText("Hétköznap")).toBeInTheDocument();
    expect(screen.getByText("Hétvége")).toBeInTheDocument();

    rerender(<BoardTable lang="ro" weekday={[365]} weekend={[420]} />);
    expect(screen.getByText("Zi lucrătoare")).toBeInTheDocument();
    expect(screen.getByText("Weekend")).toBeInTheDocument();
  });

  it("shows a no-service note for an empty weekend array without crashing", () => {
    render(<BoardTable lang="hu" weekday={[365, 395]} weekend={[]} />);
    expect(screen.getByText("6:05")).toBeInTheDocument();
    expect(screen.getByText(/nincs járat/)).toBeInTheDocument();
  });

  it("uses the Romanian no-service wording", () => {
    render(<BoardTable lang="ro" weekday={[]} weekend={[420]} />);
    expect(screen.getByText(/fără curse/)).toBeInTheDocument();
    expect(screen.getByText("7:00")).toBeInTheDocument();
  });

  it("labels both sections and the empty state in English", () => {
    render(<BoardTable lang="en" weekday={[365, 395]} weekend={[]} />);
    expect(screen.getByText("Weekday")).toBeInTheDocument();
    expect(screen.getByText("Weekend")).toBeInTheDocument();
    expect(screen.getByText("6:05")).toBeInTheDocument();
    expect(screen.getByText(/no service/)).toBeInTheDocument();
  });

  it("wraps a past-midnight departure back onto the clock", () => {
    // 1490 = 24:50 -> 0:50
    render(<BoardTable lang="hu" weekday={[1490]} weekend={[]} />);
    expect(screen.getByText("0:50")).toBeInTheDocument();
  });
});
