import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StopList from "./StopList";

const stops = [
  { name: "Sepsiszentgyörgy, Vasútállomás", slug: "vasutallomas" },
  { name: "Sugás áruház", slug: "sugas-aruhaz" },
  { name: "Kórház", slug: "korhaz" },
];

describe("StopList", () => {
  it("renders an ordered list of stop links with Hungarian paths", () => {
    const { container } = render(<StopList lang="hu" stops={stops} />);
    expect(container.querySelector("ol")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/megallok/vasutallomas/");
    expect(links[0]).toHaveTextContent("Sepsiszentgyörgy, Vasútállomás");
  });

  it("uses the /ro/statii/ prefix for Romanian", () => {
    render(<StopList lang="ro" stops={stops} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/ro\/statii\/[^/]+\/$/);
    }
    expect(links[2]).toHaveAttribute("href", "/ro/statii/korhaz/");
  });

  it("uses the /en/stops/ prefix for English", () => {
    render(<StopList lang="en" stops={stops} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/en\/stops\/[^/]+\/$/);
    }
    expect(links[2]).toHaveAttribute("href", "/en/stops/korhaz/");
  });

  it("renders an empty list without crashing", () => {
    const { container } = render(<StopList lang="hu" stops={[]} />);
    expect(container.querySelector("ol")).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
