import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GuideBody from "./GuideBody";

describe("GuideBody", () => {
  it("renders headings, paragraphs and lists", () => {
    render(<GuideBody blocks={[{ h2: "Jegyek" }, { p: "2,5 lej." }, { ul: ["24pay"] }]} />);
    expect(screen.getByRole("heading", { name: "Jegyek" })).toBeInTheDocument();
    expect(screen.getByText("2,5 lej.")).toBeInTheDocument();
    expect(screen.getByText("24pay")).toBeInTheDocument();
  });

  it("renders every {ul} entry as its own <li>", () => {
    render(<GuideBody blocks={[{ ul: ["egy", "kettő", "három"] }]} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["egy", "kettő", "három"]);
  });

  it("preserves block order in the DOM", () => {
    const { container } = render(
      <GuideBody blocks={[{ p: "first" }, { h2: "second" }, { ul: ["third"] }]} />,
    );
    const tags = [...container.querySelectorAll("p, h2, ul")].map((el) => el.tagName);
    expect(tags).toEqual(["P", "H2", "UL"]);
  });
});
