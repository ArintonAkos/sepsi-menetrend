import { describe, it, expect, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Planner from "./Planner";
import { media } from "../../vitest.setup";
import type { Network } from "@/lib/engine/types";
import type { Place } from "@/lib/engine/search";
import type { FareTable } from "@/lib/engine/fares";

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../../public/data", name), "utf8"));
let network: Network, index: { places: Place[]; reach: number;
  bbox: [number, number, number, number] }, fares: FareTable;
beforeAll(() => {
  network = load<Network>("network.json");
  index = load("places.json");
  fares = load<FareTable>("fares.json");
});

describe("bottom sheets", () => {
  it("are rendered outside the panel so they can pin to the screen", async () => {
    /* `position: fixed` is measured against the nearest ancestor with a
       transform or filter, not the viewport. Inside the panel the sheet landed
       mid-page; in <body> nothing can move it. */
    media.narrow = true;
    const user = userEvent.setup();
    render(<Planner network={network} places={index.places} reach={index.reach}
                    box={index.bbox} fares={fares} />);
    await user.click(screen.getByLabelText("Beállítások"));
    const sheet = screen.getByRole("button", { name: "Română" }).closest("div[class*='settings']")!;
    const panel = document.querySelector("aside")!;
    expect(panel.contains(sheet)).toBe(false);
    expect(document.body.contains(sheet)).toBe(true);
  });

  it("stay inside the panel on a desktop, where they are dropdowns", async () => {
    const user = userEvent.setup();
    render(<Planner network={network} places={index.places} reach={index.reach}
                    box={index.bbox} fares={fares} />);
    await user.click(screen.getByLabelText("Beállítások"));
    const sheet = screen.getByRole("button", { name: "Română" }).closest("div[class*='settings']")!;
    expect(document.querySelector("main")!.contains(sheet)).toBe(true);
  });
});

describe("what the phone shows at each step", () => {
  const app = () => document.querySelector("div[class*='app']")!;
  const start = async () => {
    media.narrow = true;
    const user = userEvent.setup();
    render(<Planner network={network} places={index.places} reach={index.reach}
                    box={index.bbox} fares={fares} />);
    return user;
  };
  const pick = async (user: ReturnType<typeof userEvent.setup>,
                      label: string, query: string) => {
    const input = screen.getByLabelText(label);
    await user.click(input);
    await user.type(input, query);
    const list = await screen.findByRole("listbox");
    const place = [...list.querySelectorAll("button")]
      .find((b) => !/helyzetem|térkép|hartă/i.test(b.textContent ?? ""))!;
    await user.click(place);
  };

  it("opens on the map, lists without it, then brings it back", async () => {
    const user = await start();
    expect(app().className).toMatch(/idle/);        // map, two fields

    await pick(user, "Honnan", "Vasútállomás");
    await pick(user, "Hová", "Sepsi Aréna");
    expect(app().className).toMatch(/listing/);     // the list has the screen
    expect(app().className).not.toMatch(/idle/);

    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:30" } });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
    const first = (await screen.findAllByText("perc"))[0];
    await user.click(first.closest("button")!);
    expect(app().className).toMatch(/reading/);     // map again, with the route

    // the search header has a back button too, so aim at the itinerary's own
    const head = screen.getByText("Az utad").closest("div")!;
    await user.click(head.querySelector("button")!);
    expect(app().className).toMatch(/listing/);
  });
});

describe("reading a journey on a phone", () => {
  it("drops the fields and the filters, and keeps the map", async () => {
    /* Once a journey is chosen the question is no longer "where to" - the
       inputs and the chips are answering something already answered. */
    media.narrow = true;
    const user = userEvent.setup();
    render(<Planner network={network} places={index.places} reach={index.reach}
                    box={index.bbox} fares={fares} />);
    const pick = async (label: string, query: string) => {
      const input = screen.getByLabelText(label);
      await user.click(input);
      await user.type(input, query);
      const list = await screen.findByRole("listbox");
      await user.click([...list.querySelectorAll("button")]
        .find((b) => !/helyzetem|térkép|hartă/i.test(b.textContent ?? ""))!);
    };
    await pick("Honnan", "Vasútállomás");
    await pick("Hová", "Sepsi Aréna");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:30" } });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
    await user.click((await screen.findAllByText("perc"))[0].closest("button")!);

    const app = document.querySelector("div[class*='app']")!;
    expect(app.className).toMatch(/reading/);
    // the drawer has a grip, and it is a strip rather than a hairline
    const grip = document.querySelector("[class*='grip']")!;
    expect(grip).toBeTruthy();
    expect(grip.getAttribute("role")).toBe("separator");
    // and the rail carries an explicit height, which is what the drag changes
    const rail = document.querySelector("aside")!;
    expect(rail.style.height).toMatch(/^\d+px$/);
  });
});

describe("the phone entry screen", () => {
  it("asks one question instead of showing an answer form", async () => {
    media.narrow = true;
    const user = userEvent.setup();
    render(<Planner network={network} places={index.places} reach={index.reach}
                    box={index.bbox} fares={fares} />);
    const app = document.querySelector("div[class*='app']")!;
    expect(app.className).toMatch(/idle/);
    expect(app.className).not.toMatch(/searching/);

    await user.click(screen.getByRole("button", { name: "Hová mész?" }));
    expect(app.className).toMatch(/searching/);
    expect(screen.getByRole("heading", { name: "Hová mész?" })).toBeInTheDocument();
  });

  it("stays on the search screen after the first place is chosen", async () => {
    /* Picking a starting point is half the job; dropping back to the map to
       tap again is a step nobody asked for. */
    media.narrow = true;
    const user = userEvent.setup();
    render(<Planner network={network} places={index.places} reach={index.reach}
                    box={index.bbox} fares={fares} />);
    await user.click(screen.getByRole("button", { name: "Hová mész?" }));
    const to = screen.getByLabelText("Hová");
    await user.type(to, "Sepsi Aréna");
    const list = await screen.findByRole("listbox");
    await user.click([...list.querySelectorAll("button")]
      .find((b) => !/helyzetem|térkép|hartă/i.test(b.textContent ?? ""))!);

    const app = document.querySelector("div[class*='app']")!;
    expect(app.className).toMatch(/searching/);          // still here
    expect((screen.getByLabelText("Hová") as HTMLInputElement).value).toBe("Sepsi Aréna");
  });
});

describe("a used-before row", () => {
  it("shows the name, not just its icons", async () => {
    /* The row was a flex line inheriting width:100% from the list, so the
       shrink landed entirely on the name and left an icon and a cross. */
    localStorage.setItem("sepsi.recent", JSON.stringify(
      [{ name: "Vasútállomás", at: [25.81, 45.863], used: 1 }]));
    media.narrow = true;
    const user = userEvent.setup();
    render(<Planner network={network} places={index.places} reach={index.reach}
                    box={index.bbox} fares={fares} />);
    await user.click(screen.getByRole("button", { name: "Hová mész?" }));
    const list = await screen.findByRole("listbox");
    const row = [...list.querySelectorAll("li")]
      .find((li) => /Korábban/.test(li.textContent ?? ""))!;
    expect(row).toBeTruthy();
    expect(row.textContent).toContain("Vasútállomás");
    // two explicit columns, so the name can never be squeezed to nothing
    expect(getComputedStyle(row).gridTemplateColumns).toBeTruthy();
    localStorage.clear();
  });
});
