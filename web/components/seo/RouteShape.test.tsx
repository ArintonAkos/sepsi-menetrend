import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RouteShape from "./RouteShape";

describe("RouteShape", () => {
  it("renders a single polyline with a fitted viewBox", () => {
    const { container } = render(
      <RouteShape shape={[[25.78, 45.86], [25.80, 45.88]]} colour="#136F29" />,
    );
    const poly = container.querySelector("polyline")!;
    expect(poly).toBeTruthy();
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toMatch(/^[\d.\- ]+$/);
  });

  it("paints the stroke in the line colour and never fills", () => {
    const { container } = render(
      <RouteShape shape={[[25.78, 45.86], [25.80, 45.88], [25.79, 45.90]]} colour="#136F29" />,
    );
    const poly = container.querySelector("polyline")!;
    expect(poly.getAttribute("stroke")).toBe("#136F29");
    expect(poly.getAttribute("fill")).toBe("none");
  });

  it("flips the Y axis so north sits at the top", () => {
    const { container } = render(
      <RouteShape shape={[[0, 0], [0, 10]]} colour="#000" />,
    );
    const pts = container
      .querySelector("polyline")!
      .getAttribute("points")!
      .trim()
      .split(/\s+/)
      .map((p) => p.split(",").map(Number));
    // the northern point (lat 10) must land at a smaller y than the southern one
    expect(pts[1][1]).toBeLessThan(pts[0][1]);
  });

  it("keeps the shape out of the accessibility tree", () => {
    const { container } = render(
      <RouteShape shape={[[25.78, 45.86], [25.80, 45.88]]} colour="#136F29" />,
    );
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing for a one-point shape", () => {
    const { container } = render(<RouteShape shape={[[25.78, 45.86]]} colour="#136F29" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty shape", () => {
    const { container } = render(<RouteShape shape={[]} colour="#136F29" />);
    expect(container).toBeEmptyDOMElement();
  });
});
