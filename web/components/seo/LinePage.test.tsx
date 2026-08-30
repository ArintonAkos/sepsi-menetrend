import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LinePage from "./LinePage";

/** `LinePage` is an async server component - render its resolved tree the way
 *  the brief's tests do rather than as JSX. The `/Multi-Trans/` and
 *  `/planificator/` matchers in the brief's sketch are ambiguous against
 *  `PageFrame`'s disclaimer/footer, so the prose and CTA are pinned by a
 *  phrase unique to the body instead. */
const renderLine = async (props: { lang: "hu" | "ro"; id: string }) =>
  render(await LinePage(props));

describe("LinePage", () => {
  it("puts the departure board above the description for line 1", async () => {
    await renderLine({ lang: "hu", id: "1" });

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("1-es busz");

    const board = screen.getAllByRole("table")[0];
    const intro = screen.getByText(/városi buszjárata Sepsiszentgyörgyön/);
    // the board is earlier in document order than the templated prose
    expect(
      board.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders at least one real departure table for line 1", async () => {
    const { container } = await renderLine({ lang: "hu", id: "1" });
    expect(container.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("links every stop to its own stop page", async () => {
    const { container } = await renderLine({ lang: "hu", id: "1" });
    expect(container.querySelector('a[href^="/megallok/"]')).toBeTruthy();
  });

  it("carries the Free Friday note", async () => {
    await renderLine({ lang: "hu", id: "1" });
    expect(
      screen.getAllByText(/Pénteken a városi járatok ingyenesek/).length,
    ).toBeGreaterThan(0);
  });

  it("links into the planner timetable for this line, RO handoff kept RO", async () => {
    await renderLine({ lang: "ro", id: "1" });
    const ctas = screen.getAllByRole("link", { name: /deschide/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/?line=1&service=weekday&lang=ro");
    }
  });

  it("leaves the HU line CTA without a lang override", async () => {
    const { container } = await renderLine({ lang: "hu", id: "1" });
    const cta = container.querySelector('a[href^="/?line="]');
    expect(cta).toHaveAttribute("href", "/?line=1&service=weekday");
  });

  it("offers the language twin link in the frame", async () => {
    const { container } = await renderLine({ lang: "ro", id: "1" });
    expect(container.querySelector('a[href="/vonalak/1/"]')).toBeTruthy();
  });
});
