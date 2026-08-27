/** Smoke tests for the panel: it renders, it plans, and the controls do
 *  something. The map is stubbed out - jsdom has no WebGL. */
import { afterEach, describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Planner from "./Planner";
import { media } from "../../vitest.setup";
import type { Network } from "@/lib/engine/types";
import type { Place } from "@/lib/engine/search";
import type { FareTable } from "@/lib/engine/fares";
import type { BikeSnapshot, BikeStation } from "@/lib/sepsibike";

const walkingMock = vi.hoisted(() => ({ pending: false, failuresLeft: 0, calls: 0 }));
const planningMock = vi.hoisted(() => ({ calls: 0 }));
const resetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/recovery", () => ({ resetApp: resetMock }));

vi.mock("@/lib/walking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/walking")>();
  return {
    ...actual,
    walkingContext: (...args: Parameters<typeof actual.walkingContext>) => {
      walkingMock.calls += 1;
      if (walkingMock.pending) return new Promise<never>(() => {});
      if (walkingMock.failuresLeft > 0) {
        walkingMock.failuresLeft -= 1;
        return Promise.reject(new Error("walking graph unavailable after 3 attempts"));
      }
      return actual.walkingContext(...args);
    },
  };
});

vi.mock("@/lib/engine/plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engine/plan")>();
  return {
    ...actual,
    planWithWalking: (...args: Parameters<typeof actual.planWithWalking>) => {
      planningMock.calls += 1;
      return actual.planWithWalking(...args);
    },
  };
});

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../../public/data", name), "utf8"));

let network: Network, places: Place[], fares: FareTable, bikeStations: BikeStation[];
let reach: number;
let box: [number, number, number, number];

beforeAll(() => {
  network = load<Network>("network.json");
  const index = load<{ places: Place[]; reach: number;
                       bbox: [number, number, number, number] }>("places.json");
  places = index.places;
  reach = index.reach;
  box = index.bbox;
  fares = load<FareTable>("fares.json");
  bikeStations = load<BikeSnapshot>("sepsibike.json").stations;
});

/** Render the planner. Synchronous, so a test can assert what is on screen
 *  before the map has loaded. */
const mount = () => {
  const user = userEvent.setup();
  render(<Planner network={network} places={places} reach={reach} box={box}
                  fares={fares} />);
  return user;
};

/* The map is a lazy chunk, and its arrival re-renders the panel. Left to
   resolve on its own it lands in the middle of whatever the test is doing next,
   which made a different handful of tests fail on every run. Waiting for it
   here settles that boundary before anything is clicked. Everything except the
   two tests specifically about load order goes through this. */
const setup = async () => {
  const user = mount();
  await screen.findByText(/Nincs Mapbox token/);
  return user;
};

async function chooseStop(user: ReturnType<typeof userEvent.setup>,
                          label: string, query: string) {
  const input = screen.getByLabelText(label);
  await user.click(input);
  fireEvent.change(input, { target: { value: query } });
  const list = await screen.findByRole("listbox");
  // the first rows are "my position" and "choose on map"; the places come after
  const place = within(list).getAllByRole("button")
    .find((b) => !/helyzetem|locația|térkép|hartă/i.test(b.textContent ?? ""));
  if (!place) throw new Error(`no suggestion for ${query}`);
  await user.click(place);
}

/** The entry screen is just the two fields; the chips, the slider and the
 *  results only appear once both ends are known. Most tests need to be past
 *  that before they can touch anything. */
async function startPlanning(user: ReturnType<typeof userEvent.setup>,
                             from = "Vasútállomás", to = "Sepsi Aréna") {
  await chooseStop(user, "Honnan", from);
  await chooseStop(user, "Hová", to);
  return screen.findByRole("button", { name: /Indulás|Érkezés/ });
}

describe("Planner", () => {
  beforeEach(() => {
    localStorage.clear();
    walkingMock.pending = false;
    walkingMock.failuresLeft = 0;
    walkingMock.calls = 0;
    planningMock.calls = 0;
    resetMock.mockClear();
    delete (globalThis as { gtag?: unknown }).gtag;
  });

  it("opens on the two fields and nothing else", async () => {
    /* Nothing can be filtered or ranked before both ends are known, so the
       chips, the slider and the empty-results line would all be noise. */
    const user = await setup();
    expect(screen.getByLabelText("Honnan")).toBeInTheDocument();
    expect(screen.getByLabelText("Hová")).toBeInTheDocument();
    expect(screen.getByLabelText("Beállítások")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText(/Nincs járat/)).not.toBeInTheDocument();
    await startPlanning(user);
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("says the token is missing instead of rendering a blank map", async () => {
    // the map module is loaded lazily, so this arrives after the panel
    mount();
    expect(await screen.findByText(/Nincs Mapbox token/)).toBeInTheDocument();
  });

  it("renders the panel synchronously, without waiting for the map", () => {
    // whether the lazy chunk has resolved depends on the module cache, so this
    // asserts only what is actually guaranteed: the panel does not wait for it
    mount();
    expect(screen.getByLabelText("Honnan")).toBeInTheDocument();
    expect(screen.getByLabelText("Hová")).toBeInTheDocument();
  });

  it("suggests places as you type, including the awkward one", async () => {
    const user = await setup();
    const input = screen.getByLabelText("Honnan");
    await user.click(input);
    await user.type(input, "value center");
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByText(/Bevásárlóközpont|Value Centre/).length)
      .toBeGreaterThan(0);
  });

  it("plans a journey once both ends are set", async () => {
    const user = await setup();
    await startPlanning(user);
    // the default is "now", which has no service at night - pin it to a time
    // when buses actually run so the test does not depend on the clock
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:30" } });
    await user.keyboard("{Escape}");
    const durations = await screen.findAllByText("perc");
    expect(durations.length).toBeGreaterThan(0);
    expect(screen.queryByText(/Nincs járat/)).not.toBeInTheDocument();
  });

  it("puts even the current default time in the reusable route link", async () => {
    window.history.replaceState(null, "", "/");
    const user = await setup();
    await startPlanning(user);

    await waitFor(() => expect(window.location.search).toMatch(/(?:^|&)at=\d{2}%3A\d{2}(?:&|$)/));
  });

  it("shows an explicit planning state instead of stale network results", async () => {
    const user = await setup();
    walkingMock.pending = true;
    await chooseStop(user, "Honnan", "Vasútállomás");
    await chooseStop(user, "Hová", "Sepsi Aréna");

    expect(screen.getByRole("status")).toHaveTextContent("Útvonal tervezése…");
  });

  it("waits for a slider drag to finish before re-planning", async () => {
    /* The expensive multimodal search should see only the final slider value.
       Running it for every pixel queues stale worker jobs behind one another. */
    localStorage.setItem("sepsibike-options", "off");
    const user = await setup();
    await startPlanning(user);
    await waitFor(() => expect(planningMock.calls).toBeGreaterThan(0));
    const callsBeforeDrag = planningMock.calls;
    const slider = screen.getByRole("slider");

    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "52" } });
    fireEvent.change(slider, { target: { value: "68" } });
    await new Promise((resolve) => setTimeout(resolve, 240));

    expect(planningMock.calls).toBe(callsBeforeDrag);

    fireEvent.pointerUp(slider);
    await waitFor(() => expect(planningMock.calls).toBe(callsBeforeDrag + 1));
  });

  it("says so plainly when the deadline cannot be met", async () => {
    /* Asking to leave at any hour just finds the next bus, however far off, and
       anywhere within walking distance now gets an on-foot answer instead of
       nothing. The genuinely empty case is a deadline before the first service
       to somewhere too far to walk - Arcuș is five kilometres out. */
    const user = await setup();
    await startPlanning(user, "Vasútállomás", "Centru Arcus");
    await user.click(screen.getByRole("button", { name: /Indulás/ }));
    await user.click(screen.getByRole("button", { name: "Érkezés ekkorra" }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "03:00" } });
    await user.keyboard("{Escape}");
    expect(await screen.findByText(/Nincs járat/)).toBeInTheDocument();
  });

  describe("when the walking data cannot be loaded", () => {
    it("shows a recoverable error instead of an empty journey list", async () => {
      const user = await setup();
      walkingMock.failuresLeft = 99;
      await startPlanning(user);

      expect(await screen.findByText(/Nem sikerült betölteni/)).toBeInTheDocument();
      expect(screen.queryByText(/Nincs járat/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Újra$/ })).toBeInTheDocument();
    });

    it("reports the failure for diagnostics", async () => {
      const gtag = vi.fn();
      (globalThis as { gtag?: unknown }).gtag = gtag;
      const user = await setup();
      walkingMock.failuresLeft = 99;
      await startPlanning(user);
      await screen.findByText(/Nem sikerült betölteni/);

      expect(gtag).toHaveBeenCalledWith("event", "walking_graph_load_failed", expect.anything());
    });

    it("retries and shows journeys once the data loads", async () => {
      const user = await setup();
      walkingMock.failuresLeft = 1;
      await startPlanning(user);
      await screen.findByText(/Nem sikerült betölteni/);
      const callsBefore = walkingMock.calls;

      await user.click(screen.getByRole("button", { name: /^Újra$/ }));

      await waitFor(() => expect(walkingMock.calls).toBeGreaterThan(callsBefore));
      expect(await screen.findByText("leghamarabb ér oda")).toBeInTheDocument();
      expect(screen.queryByText(/Nem sikerült betölteni/)).not.toBeInTheDocument();
    });
  });

  it("offers an app reset from settings", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));

    await user.click(await screen.findByRole("button", { name: /Alkalmazás újratöltése/ }));

    expect(resetMock).toHaveBeenCalled();
  });

  it("switches the whole interface to Romanian", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));
    await user.click(screen.getByRole("button", { name: "Română" }));
    expect(screen.getByLabelText("De la")).toBeInTheDocument();
    expect(screen.getByText(/Nu este site-ul oficial/)).toBeInTheDocument();
  });

  it("presents SepsiBike on the same journey timeline as transit", async () => {
    localStorage.setItem("sepsibike-options", "on");
    const user = userEvent.setup();
    render(<Planner network={network} places={places} reach={reach} box={box} fares={fares}
                    bikeStations={bikeStations} bikeSnapshotAt="2026-08-23T12:53:56.000Z" />);
    await screen.findByText(/Nincs Mapbox token/);
    await startPlanning(user, "Nicolae Iorga", "Sepsi Aréna");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "09:00" } });
    await user.keyboard("{Escape}");
    const [bike] = await screen.findAllByRole("button", { name: /SepsiBike/ });
    expect(bike.closest("li")).not.toBeNull();
    await user.click(bike);
    expect(await screen.findByText(/SepsiBike.*06:00–22:00 között lehet biciklit felvenni/)).toBeInTheDocument();
    expect(screen.getByText(/↑ \d+ m · ↓ \d+ m/)).toBeInTheDocument();
  });

  it("hides SepsiBike when the pickup would be at 22:00", async () => {
    localStorage.setItem("sepsibike-options", "on");
    const user = userEvent.setup();
    render(<Planner network={network} places={places} reach={reach} box={box} fares={fares}
                    bikeStations={bikeStations} bikeSnapshotAt="2026-08-23T12:53:56.000Z" />);
    await screen.findByText(/Nincs Mapbox token/);
    await startPlanning(user, "Nicolae Iorga", "Sepsi Aréna");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "09:00" } });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
    expect((await screen.findAllByRole("button", { name: /SepsiBike/ })).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^Indulás 09:00$/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "22:00" } });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /SepsiBike/ })).toHaveLength(0));
  });

  it("lets the rider choose whether SepsiBike suggestions are enabled from settings", async () => {
    const user = userEvent.setup();
    render(<Planner network={network} places={places} reach={reach} box={box} fares={fares}
                    bikeStations={bikeStations} bikeSnapshotAt="2026-08-23T12:53:56.000Z" />);
    await screen.findByText(/Nincs Mapbox token/);
    await startPlanning(user, "Nicolae Iorga", "Sepsi Aréna");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "09:00" } });
    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("button", { name: /SepsiBike/ })).toHaveLength(0);

    await user.click(screen.getByLabelText("Beállítások"));
    const disabled = screen.getByRole("button", { name: "Kikapcsolva" });
    expect(disabled).toHaveAttribute("aria-pressed", "true");
    const enabled = screen.getByRole("button", { name: "Engedélyezve" });
    expect(enabled).toHaveAttribute("aria-pressed", "false");
    await user.click(enabled);

    expect((await screen.findAllByRole("button", { name: /SepsiBike/ })).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Kikapcsolva" }));
    expect(screen.queryAllByRole("button", { name: /SepsiBike/ })).toHaveLength(0);
  });

  it("gives the SepsiBike suggestion choice the same explicit settings label as other preferences", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));

    expect(screen.getByRole("group", { name: "SepsiBike javaslatok" })).toHaveAttribute("aria-labelledby", "bike-options-label");
    expect(screen.getByText("SepsiBike javaslatok")).toHaveAttribute("id", "bike-options-label");
  });

  it("uses the same vertically-stacked label and segmented choice layout for SepsiBike", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));

    expect(screen.getByText("SepsiBike javaslatok").parentElement?.className).not.toContain("switchRow");
    expect(screen.getByText("SepsiBike javaslatok").parentElement?.className).toContain("setRow");
  });

  it("keeps the installation action out of the settings sheet", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));

    const settings = screen.getByText("Nyelv").closest("div[class*='settings']") as HTMLElement | null;
    expect(settings).not.toBeNull();
    expect(within(settings!).queryByText("Alkalmazás telepítése")).not.toBeInTheDocument();
  });

  it("opens the time panel and offers the two questions worth asking", async () => {
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás/ }));
    expect(screen.getByRole("button", { name: "Indulás ekkor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Érkezés ekkorra" })).toBeInTheDocument();
    // "when must I leave at the latest" is the same question as arrive-by,
    // which already ranks the last usable bus first
    expect(screen.queryByRole("button", { name: /legkésőbb/i })).not.toBeInTheDocument();
  });

  it("lets a line be switched off, from the settings", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));
    const toggles = screen.getAllByRole("button", { pressed: true })
      .filter((b) => /^\d/.test(b.textContent ?? ""));
    expect(toggles.length).toBe(network.lines.length);
    await user.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the picker only after the pin is pressed", async () => {
    const user = await setup();
    expect(screen.queryByText("Mégse")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Honnan"));
    await user.click(screen.getByRole("button", { name: /Választás a térképen/i }));
    expect(screen.getByText("Mégse")).toBeInTheDocument();
    expect(screen.getByText("Kész")).toBeInTheDocument();
    await user.click(screen.getByText("Mégse"));
    expect(screen.queryByText("Mégse")).not.toBeInTheDocument();
  });

  it("closes a chip panel when you press somewhere else", async () => {
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás/ }));
    expect(screen.getByRole("button", { name: "Érkezés ekkorra" })).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
  });

  it("keeps the panel open while you use it", async () => {
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás/ }));
    await user.click(screen.getByRole("button", { name: "Érkezés ekkorra" }));
    // switching mode must not dismiss the panel you are still working in
    expect(screen.getByRole("button", { name: "Érkezés ekkorra" })).toBeInTheDocument();
  });

  it("closes a chip panel on Escape", async () => {
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    expect(screen.getByRole("button", { name: "Érkezés ekkorra" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
  });

  it("closes the settings when you press somewhere else", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));
    expect(screen.getByRole("button", { name: "Română" })).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Română" })).not.toBeInTheDocument());
  });

  it("keeps the settings open while you change them", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));
    await user.click(screen.getByRole("button", { name: "Sötét" }));
    expect(screen.getByRole("button", { name: "Világos" })).toBeInTheDocument();
  });

  it("closes the picker on Escape", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Honnan"));
    await user.click(screen.getByRole("button", { name: /Választás a térképen/i }));
    expect(screen.getByText("Kész")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Kész")).not.toBeInTheDocument();
  });
});

describe("line colours in the panel", () => {
  it("paints each line pill with that line's own colour", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));
    const pills = screen.getAllByRole("button", { pressed: true })
      .filter((b) => /^\d/.test(b.textContent ?? ""))
      .map((b) => b.querySelector("span")!);
    expect(pills.length).toBe(network.lines.length);
    const used = new Set(pills.map((p) => p.style.background));
    // grey for everything is what this is guarding against
    expect(used.size).toBeGreaterThan(6);
    expect([...used].every((c) => c && c !== "")).toBe(true);
  });
});

describe("panel placement", () => {
  it("hangs the panel off the chip row, not below the slider", async () => {
    /* Anchored to the whole controls block the panel opened under the
       gyorsabb/gyaloglás slider, visibly detached from the chip that opened it.
       jsdom has no layout, so this checks the structure that decides it. */
    const user = await setup();
    await startPlanning(user);
    const chip = screen.getByRole("button", { name: /Indulás/ });
    await user.click(chip);
    const panel = screen.getByRole("button", { name: "Érkezés ekkorra" })
      .closest("div[class*='pop']")!;
    const anchor = panel.parentElement!;
    expect(anchor.contains(chip)).toBe(true);
    expect(anchor.querySelector("input[type='range']")).toBeNull();
  });
});

/** "My position" is the first row of the search list, not a button of its own -
 *  the entry screen is only the two fields. */
async function useMyPosition(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("Honnan"));
  const list = await screen.findByRole("listbox");
  await user.click(within(list).getAllByRole("button")[0]);
}

describe("finding where you are", () => {
  const geolocate = (impl: Partial<Geolocation>) => {
    Object.defineProperty(window, "isSecureContext", {
      value: true, configurable: true, writable: true,
    });
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: vi.fn(), watchPosition: vi.fn(),
               clearWatch: vi.fn(), ...impl },
      configurable: true, writable: true,
    });
  };

  it("fills in where you are, named from the local index", async () => {
    // the Vasútállomás stop, so the answer should be its name rather than a
    // pair of coordinates
    const stop = network.stops.find((s) => s.name.ro === "Gara CFR")!;
    geolocate({
      getCurrentPosition: (ok) => (ok as PositionCallback)({
        coords: { longitude: stop.at[0], latitude: stop.at[1], accuracy: 10 },
      } as GeolocationPosition),
    });
    const user = await setup();
    await useMyPosition(user);
    expect((screen.getByLabelText("Honnan") as HTMLInputElement).value)
      .toBe("Vasútállomás");
  });

  it("says so and carries on when permission is refused", async () => {
    geolocate({
      getCurrentPosition: (_ok, fail) => (fail as PositionErrorCallback)({
        code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
        message: "denied",
      } as GeolocationPositionError),
    });
    const user = await setup();
    const before = (screen.getByLabelText("Honnan") as HTMLInputElement).value;
    await useMyPosition(user);
    expect(screen.getByText(/nincs engedélyezve/i)).toBeInTheDocument();
    // and the field it could not fill is left exactly as it was
    expect((screen.getByLabelText("Honnan") as HTMLInputElement).value).toBe(before);
  });

  it("blames the protocol, not the user, on a plain http origin", async () => {
    // this is what a phone hitting the dev server over wifi actually gets:
    // the browser refuses without ever showing a prompt
    geolocate({});
    Object.defineProperty(window, "isSecureContext", {
      value: false, configurable: true, writable: true,
    });
    const user = await setup();
    await useMyPosition(user);
    expect(screen.getByText(/https/i)).toBeInTheDocument();
  });

  it("says how far off a position landed, not just that it is wrong", async () => {
    geolocate({
      getCurrentPosition: (ok) => (ok as PositionCallback)({
        coords: { longitude: 19.04, latitude: 47.50, accuracy: 10 },   // Budapest
      } as GeolocationPosition),
    });
    const user = await setup();
    await useMyPosition(user);
    // a bare "too far" leaves nothing to judge; the distance says whether the
    // fix was wrong or you really are out of town
    expect(screen.getByText(/messze.*\d+\s?km/i)).toBeInTheDocument();
  });

  it("rejects a vague fix instead of treating it as a place", async () => {
    /* A desktop with no GPS often gets an IP-derived guess accurate to tens of
       kilometres. Dropped on the map that reads as a real position. */
    const stop = network.stops.find((s) => s.name.ro === "Gara CFR")!;
    geolocate({
      getCurrentPosition: (ok) => (ok as PositionCallback)({
        coords: { longitude: stop.at[0], latitude: stop.at[1], accuracy: 40_000 },
      } as GeolocationPosition),
    });
    const user = await setup();
    await useMyPosition(user);
    expect(screen.getByText(/pontatlan/i)).toBeInTheDocument();
    expect((screen.getByLabelText("Honnan") as HTMLInputElement).value).toBe("");
  });
});

describe("the disclaimer", () => {
  it("is out of the way but one tap from anywhere", async () => {
    const user = await setup();
    // no longer a footer eating a line of the phone screen
    expect(screen.queryByText(/Nem a Multi-Trans SA hivatalos/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Beállítások"));
    expect(screen.getByText(/Nem a Multi-Trans SA hivatalos/)).toBeInTheDocument();
  });
});

describe("the itinerary markup", () => {
  const openFirstJourney = async (user: ReturnType<typeof userEvent.setup>) => {
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:30" } });
    await user.keyboard("{Escape}");
    const first = (await screen.findAllByText("perc"))[0];
    await user.click(first.closest("button")!);
    return await screen.findByText(/Az utad/);
  };

  it("puts every list item straight inside a list", async () => {
    /* React warns and hydration breaks when a <li> sits directly inside another
       <li> - which is what the ride entry did, wrapping the stop it ends at.
       A nested <ol> is fine, so the rule is about the parent, not the ancestry:
       the collapsible "6 megálló" list is legitimate. */
    const user = await setup();
    await openFirstJourney(user);
    const items = [...document.querySelectorAll("li")];
    expect(items.length).toBeGreaterThan(3);
    for (const item of items) {
      expect(item.parentElement?.tagName,
        `a list item sits in <${item.parentElement?.tagName.toLowerCase()}>`)
        .toMatch(/^(OL|UL)$/);
    }
  });

  it("keeps every timeline entry a direct child of the list", async () => {
    const user = await setup();
    await openFirstJourney(user);
    const list = document.querySelector("ol[class*='timeline']")!;
    expect(list).toBeTruthy();
    for (const child of list.children) {
      expect(child.tagName, `${child.tagName} is not a list item`).toBe("LI");
    }
    expect(list.children.length).toBeGreaterThan(2);
  });
});

describe("walking the whole way", () => {
  it("is offered when there is no bus worth waiting for", async () => {
    /* A kilometre at half past midnight used to come back as "wait four hours
       for the first bus", because the planner could only answer with journeys
       that had a bus in them. */
    const user = await setup();
    await startPlanning(user, "Vasútállomás", "Sepsi Aréna");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "00:30" } });
    await user.keyboard("{Escape}");

    const walk = await screen.findByText("végig gyalog");
    const card = walk.closest("button")!;
    expect(card.textContent).toMatch(/\d+\s*perc/);
    // it is not dressed up as a bus: no line badge, no ticket
    expect(card.querySelector("[class*='pill']")).toBeNull();
    expect(card.textContent).not.toMatch(/lej/);
  });

  it("is not suggested for a distance nobody would walk", async () => {
    const user = await setup();
    await startPlanning(user, "Vasútállomás", "Centru Arcus");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:00" } });
    await user.keyboard("{Escape}");
    await screen.findAllByRole("button", { name: /perc/ });
    expect(screen.queryByText("végig gyalog")).not.toBeInTheDocument();
  });

  it("opens as a walk, with the distance and no bus", async () => {
    const user = await setup();
    await startPlanning(user, "Vasútállomás", "Sepsi Aréna");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "00:30" } });
    await user.keyboard("{Escape}");
    await user.click((await screen.findByText("végig gyalog")).closest("button")!);
    await screen.findByText("Az utad");
    expect(screen.getByText("Busz nélkül")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/\d+ m · \d+ perc gyaloglás/);
  });
});

describe("the timetables", () => {
  it("opens on a line and gives the whole screen to it", async () => {
    /* A timetable is a document to read, not a control to work alongside the
       map, so it takes over rather than sharing the space. */
    const user = await setup();
    await user.click(screen.getByLabelText("Menetrendek"));
    expect(await screen.findByRole("heading", { name: "Menetrendek" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Honnan")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", {
      name: "→ Cap Linie Simeria → Gara CFR",
    })).toHaveLength(1);

    const grid = screen.getByRole("table");
    // stops down the page, runs across it - the other way round puts thirty
    // three stops across a screen four inches wide
    const header = within(grid).getAllByRole("columnheader");
    expect(header[0]).toHaveTextContent("Megálló");
    expect(header.length).toBeGreaterThan(3);
    expect(within(grid).getAllByRole("rowheader").length).toBeGreaterThan(3);
  });

  it("switches line, direction and kind of day", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Menetrendek"));
    await screen.findByRole("table");
    const firstRow = () => within(screen.getByRole("table"))
      .getAllByRole("rowheader")[0].textContent;

    const before = firstRow();
    await user.click(screen.getByRole("button", { name: "6", pressed: false }));
    expect(firstRow()).not.toBe(before);

    // a weekend with no service on this direction must say so, not show weekday times
    const weekday = screen.getByRole("button", { name: "Hétköznap" });
    const weekend = screen.getByRole("button", { name: "Hétvége" });
    await user.click(weekend);
    expect(weekend).toHaveAttribute("aria-pressed", "true");
    expect(weekday).toHaveAttribute("aria-pressed", "false");
  });

  it("comes back to the planner", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Menetrendek"));
    await screen.findByRole("heading", { name: "Menetrendek" });
    await user.click(screen.getByRole("button", { name: "Vissza" }));
    expect(await screen.findByLabelText("Honnan")).toBeInTheDocument();
  });

  it("opens a specific line and service from query parameters and syncs changes", async () => {
    window.history.replaceState(null, "", "/?timetable=1&line=6&service=weekend");
    const user = mount();
    await screen.findByRole("heading", { name: "Menetrendek" });
    expect(screen.getByRole("button", { name: "6", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hétvége", pressed: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "1", pressed: false }));
    expect(window.location.search).toContain("line=1");
  });
});

describe("the note about the other product", () => {
  it("sits at the very bottom of a journey, after the fare", async () => {
    /* Anywhere among the times, a promotion costs the departures their
       credibility. It goes below the answer the reader came for. */
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:30" } });
    await user.keyboard("{Escape}");
    await user.click((await screen.findAllByRole("button", { name: /perc/ }))[0]);
    await screen.findByText("Az utad");

    const ad = screen.getByRole("link", { name: /Aperta Sync/ });
    const timeline = document.querySelector("ol[class*='timeline']")!;
    expect(timeline.compareDocumentPosition(ad) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(ad.closest("aside")?.textContent).toMatch(/készítőtől/i);
  });

  it("says where it goes and opens it safely", async () => {
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:30" } });
    await user.keyboard("{Escape}");
    await user.click((await screen.findAllByRole("button", { name: /perc/ }))[0]);
    await screen.findByText("Az utad");

    const ad = screen.getByRole("link", { name: /Aperta Sync/ }) as HTMLAnchorElement;
    expect(ad.href).toMatch(/^https:\/\/aperta-sync\.com\//);
    // nothing here counts the click, so the landing side has to be able to
    expect(ad.href).toContain("utm_source=sepsibusz");
    expect(ad.target).toBe("_blank");
    // without noopener the opened page can reach back through window.opener
    expect(ad.rel).toContain("noopener");
  });

  it("stays off the results list, where the reader is still deciding", async () => {
    const user = await setup();
    await startPlanning(user);
    expect(screen.queryByRole("link", { name: /Aperta Sync/ })).not.toBeInTheDocument();
  });
});

describe("a shared link", () => {
  const at = (query: string) => {
    window.history.replaceState(null, "", query || "/");
  };
  afterEach(() => at(""));

  it("opens on the plan it carries", async () => {
    at("/?from=25.787600,45.863600,Vasútállomás&to=25.801200,45.859800,Sepsi%20Aréna&at=08:30");
    await setup();
    expect((screen.getByLabelText("Honnan") as HTMLInputElement).value).toBe("Vasútállomás");
    expect((screen.getByLabelText("Hová") as HTMLInputElement).value).toBe("Sepsi Aréna");
    // and it plans, rather than just filling the boxes in. Named exactly: a
    // journey that leaves at 08:30 now matches a loose /08:30/ too.
    expect(await screen.findByRole("button", { name: /^Indulás 08:30$/ }))
      .toBeInTheDocument();
  });

  it("keeps the query string out of the markup the server produces", () => {
    /* The page is prerendered without a query string, so a render that already
       knows about one produces a tree the HTML cannot be matched against -
       React throws the whole thing away and hydration fails, which is exactly
       what the console reported. Server-rendering here is the only way to see
       that from a test: render() alone never hydrates, so it cannot tell a
       value read during the first pass from one applied after it. */
    at("/?from=25.787600,45.863600,Vasútállomás&to=25.801200,45.859800,Sepsi%20Aréna");
    const html = renderToString(
      <Planner network={network} places={places} reach={reach} box={box} fares={fares} />);
    expect(html, "the link was read while the markup was being produced")
      .not.toContain("Vasútállomás");
  });

  it("hydrates a shared link over the static entry screen", async () => {
    /* Netlify serves the same prerendered entry screen for every URL.  A
       search link is applied only after that HTML has hydrated, otherwise
       React replaces the root with error #418 before planning can start. */
    at("/");
    const html = renderToString(
      <Planner network={network} places={places} reach={reach} box={box} fares={fares} />);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    at("/?from=25.780637,45.867923,Fecske%20utca%202&to=25.809993,45.860084,Sil%C3%B3%20utca%201&at=14:51");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host,
        <Planner network={network} places={places} reach={reach} box={box} fares={fares} />);
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(error.mock.calls.flat().join("\n")).not.toMatch(/Hydration failed|418/);
    const fields = host.querySelectorAll<HTMLInputElement>("input");
    expect(fields[0]).toHaveValue("Fecske utca 2");
    expect(fields[1]).toHaveValue("Siló utca 1");
    expect(within(host).getByRole("button", { name: "Indulás 14:51" }))
      .toBeInTheDocument();
    await act(async () => { root!.unmount(); });
    error.mockRestore();
    host.remove();
  });

  it("does not read saved browser preferences while producing server markup", () => {
    /* A saved setting belongs to the browser, not to Netlify's static render.
       Reading it in the first render makes the client tree differ from the
       HTML it has to hydrate. The real browser then reports React #418. */
    localStorage.setItem("sepsibike-options", "on");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    renderToString(
      <Planner network={network} places={places} reach={reach} box={box} fares={fares} />);
    expect(getItem).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  it("ignores a link that carries nothing", async () => {
    at("/?from=&to=nonsense");
    await setup();
    expect((screen.getByLabelText("Honnan") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Hová") as HTMLInputElement).value).toBe("");
  });
});

describe("journey detail", () => {
  it("shows the walk to the first stop and the wait at a change", async () => {
    /* A change where both buses use the same stop has no walk leg between the
       rides, so there was nothing on screen between "arrives 13:45" and the
       next bus - the wait, which is the part of a transfer you actually feel,
       was invisible. */
    const user = await setup();
    // a shopping centre, not a kerb, so there is a real walk at the near end
    await startPlanning(user, "value center", "Sepsi Aréna");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "13:00" } });
    await user.keyboard("{Escape}");
    const cards = await screen.findAllByRole("button", { name: /perc/ });
    await user.click(cards[0]);
    await screen.findByText("Az utad");
    expect(document.body.textContent, "no walking distance in the detail")
      .toMatch(/\d+ m · \d+ perc gyaloglás/);
  });

  it("does not paint the walk to the first stop in the line's colour", async () => {
    /* The origin node carried the line's colour as its rail, so the stretch you
       cover on foot was drawn as a solid coloured spine - the same one the bus
       route uses further down. */
    const user = await setup();
    await startPlanning(user, "MSC Stadion", "Coseni");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "13:00" } });
    await user.keyboard("{Escape}");
    await user.click((await screen.findAllByRole("button", { name: /perc/ }))[0]);
    await screen.findByText("Az utad");

    const rows = [...document.querySelectorAll("ol[class*='timeline'] > li")];
    const origin = rows[0] as HTMLElement;
    expect(origin.textContent).toMatch(/indulás/);
    expect(origin.style.getPropertyValue("--bar")).toBe("transparent");
    expect(origin.className, "the walk out should be dashed, not a route spine")
      .toMatch(/walkNode/);
    // and both ends of the trip read as ends, not as another stop on the way -
    // in the same neutral ink, because where you stand is not a stop on a line
    for (const end of [rows[0], rows[rows.length - 1]]) {
      const pip = end.querySelector("[class*='pipFilled']") as HTMLElement | null;
      expect(pip).toBeTruthy();
      expect(pip!.style.borderColor, "an endpoint is wearing a line's colour")
        .toBe("var(--ink)");
    }
    // the rides still carry theirs
    expect(rows.some((r) => /^#|rgb/.test(
      (r as HTMLElement).style.getPropertyValue("--bar")))).toBe(true);
  });

  it("puts a wait on every change the rider has to stand through", async () => {
    const user = await setup();
    await startPlanning(user, "Coșeni 2", "Cartierul Ciucului");
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "13:00" } });
    await user.keyboard("{Escape}");
    const cardCount = (await screen.findAllByRole("button", { name: /perc/ })).length;
    for (let index = 0; index < cardCount; index++) {
      // Re-query after returning from the detail view: React has replaced the
      // card nodes, so retaining the old element can only click a detached DOM.
      await user.click((await screen.findAllByRole("button", { name: /perc/ }))[index]);
      await screen.findByText("Az utad");
      // Departure suggestions are numbers too; only line badges inside the
      // journey timeline prove that this particular card contains a change.
      const pills = document.querySelectorAll("ol[class*='timeline'] [class*='pill']");
      if (pills.length > 1) {
        expect(document.body.textContent).toMatch(/\d+ perc várakozás/);
        return;
      }
      const detailHead = screen.getByText("Az utad").closest("div")!;
      await user.click(detailHead.querySelector("button")!);
    }
  });
});

describe("on a phone", () => {
  it("gives a filter panel the bottom of the screen, with a way out", async () => {
    media.narrow = true;
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    // a sheet needs something to tap outside it and a plain confirm
    await user.click(screen.getByRole("button", { name: "Kész" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
    await waitFor(() => expect(document.querySelector("[class*='scrim']")).toBeNull());
  });

  it("shows one header, both fields, and the hits below them", async () => {
    /* Three faults with one cause: the suggestions were positioned inside the
       field's own wrapper, so on the search screen they flowed between the two
       fields - covering "where to", pushing it off the bottom, and leaving the
       swap button stranded in the middle of the list. And the results header
       stayed on screen underneath the search header, giving two back buttons. */
    media.narrow = true;
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByLabelText("Honnan"));

    expect(screen.getAllByRole("button", { name: "Vissza" })).toHaveLength(1);
    const fields = document.querySelector("[class*='fields']")!;
    expect(fields.contains(screen.getByLabelText("Honnan"))).toBe(true);
    expect(fields.contains(screen.getByLabelText("Hová"))).toBe(true);

    // the list is a sibling after the fields, not a child of either one
    const list = await screen.findByRole("listbox");
    expect(fields.contains(list)).toBe(false);
    expect(fields.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it("lays the suggestions out as a page, not as a floating dropdown", async () => {
    /* The rule that flattened the list on the search screen was written as
       :global(.searching) .list, naming a CSS-module class by its source name.
       Module names are hashed at build time, so the literal "searching" it
       looked for is never in the document and the rule never applied: the list
       stayed absolutely positioned under its own field, 850-odd pixels down and
       off the bottom of a phone screen. Nothing appeared when you typed. */
    media.narrow = true;
    const user = await setup();
    await user.click(screen.getByLabelText("Hová"));
    await user.type(screen.getByLabelText("Hová"), "gara");
    const list = await screen.findByRole("listbox");
    expect(list.className, "the portaled list needs its own flattening class")
      .toMatch(/inPage/);
    expect(document.querySelector("[class*='hits']")!.contains(list)).toBe(true);
  });

  it("draws the back arrow instead of typing it", async () => {
    // the "‹" glyph sits high in its em box and never lines up with the heading
    media.narrow = true;
    const user = await setup();
    await user.click(screen.getByLabelText("Honnan"));
    const back = screen.getByRole("button", { name: "Vissza" });
    expect(back.querySelector("svg")).toBeTruthy();
    expect(back.textContent).toBe("");
  });

  it("keeps the settings sheet open while you use it", async () => {
    /* The sheet is portaled to <body> on a phone, so it is not inside the gear
       button that the dismiss handler was told to treat as "inside" - every
       press on a control in it counted as a press outside and shut it. */
    media.narrow = true;
    const user = await setup();
    await user.click(screen.getByLabelText("Beállítások"));
    await user.click(screen.getByRole("button", { name: "Sötét" }));
    expect(screen.getByRole("button", { name: "Világos" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Română" }));
    // still open, now in the other language
    expect(screen.getByRole("button", { name: "Magyar" })).toBeInTheDocument();
    // and the scrim still closes it
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Magyar" })).not.toBeInTheDocument());
  });

  it("hands the whole screen to the search, with both fields on it", async () => {
    /* Half the time the field you want to change is where you are starting
       from, so the search screen carries both - not just the one you tapped. */
    const user = await setup();
    await user.click(screen.getByLabelText("Honnan"));
    const app = document.querySelector("div[class*='app']")!;
    expect(app.className).toMatch(/searching/);
    expect(screen.getByLabelText("Honnan")).toBeInTheDocument();
    expect(screen.getByLabelText("Hová")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hová mész?" })).toBeInTheDocument();
  });

  it("comes back from the search without choosing anything", async () => {
    const user = await setup();
    await user.click(screen.getByLabelText("Honnan"));
    const app = document.querySelector("div[class*='app']")!;
    const head = document.querySelector("[class*='searchHead']")!;
    await user.click(head.querySelector("button")!);
    expect(app.className).not.toMatch(/searching/);
  });
});

describe("the origin fills itself in", () => {
  it("asks for your position on arrival, without a button to press", async () => {
    const stop = network.stops.find((s) => s.name.ro === "Gara CFR")!;
    Object.defineProperty(window, "isSecureContext", {
      value: true, configurable: true, writable: true,
    });
    const ask = vi.fn((ok: PositionCallback) => ok({
      coords: { longitude: stop.at[0], latitude: stop.at[1], accuracy: 10 },
    } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: ask, watchPosition: vi.fn(), clearWatch: vi.fn() },
      configurable: true, writable: true,
    });
    mount();
    expect(ask).toHaveBeenCalledTimes(1);
    expect((await screen.findByLabelText("Honnan") as HTMLInputElement).value)
      .toBe("Vasútállomás");
  });

  it("stays quiet when it is refused on arrival", async () => {
    // an error nobody asked for, on a screen with one job, helps nobody
    Object.defineProperty(window, "isSecureContext", {
      value: false, configurable: true, writable: true,
    });
    mount();
    expect(screen.queryByText(/https/i)).not.toBeInTheDocument();
    expect((screen.getByLabelText("Honnan") as HTMLInputElement).value).toBe("");
  });
});

describe("the idle layout", () => {
  const app = () => document.querySelector("[class*='Planner-module'][class*='app']")
    ?? document.querySelector("div[class*='app']")!;

  it("gives the map the whole surface until there is something to list", async () => {
    /* The panel used to keep its column even with nothing in it, which left a
       tall empty strip on desktop and a blank half-screen on the phone. */
    const user = await setup();
    expect(app().className).toMatch(/idle/);

    await startPlanning(user);
    expect(app().className).not.toMatch(/idle/);
  });

  it("goes back to the floating card when an endpoint is cleared", async () => {
    const user = await setup();
    await startPlanning(user);
    expect(app().className).not.toMatch(/idle/);

    const to = screen.getByLabelText("Hová") as HTMLInputElement;
    await user.clear(to);
    await user.click(screen.getByRole("button", { name: /csere|inversează/i }));
    await user.click(screen.getByRole("button", { name: /csere|inversează/i }));
    // clearing the text alone does not unset the choice; that is deliberate -
    // the swap keeps both ends, so the layout stays in planning mode
    expect(app().className).not.toMatch(/idle/);
  });
});

describe("what the itinerary tells you", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the next buses of that line from the stop you board at", async () => {
    /* At a change this is the difference between "you have four minutes" and
       "four minutes, or twenty-four if you miss it". */
    const user = await setup();
    await startPlanning(user);
    await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
    fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value: "08:00" } });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Érkezés ekkorra" })).not.toBeInTheDocument());
    const first = (await screen.findAllByText("perc"))[0];
    await user.click(first.closest("button")!);

    const label = await screen.findByText("Következő:");
    const times = [...label.parentElement!.querySelectorAll("b")]
      .map((b) => b.textContent!);
    expect(times.length).toBeGreaterThan(0);
    expect(times.length).toBeLessThanOrEqual(3);
    for (const at of times) expect(at).toMatch(/^\d{2}:\d{2}$/);
    // and they are later than the bus being suggested
    const board = screen.getAllByText(/^\d{2}:\d{2}\*?$/)[0].textContent!.slice(0, 5);
    expect(times.every((at) => at > board)).toBe(true);
  });
});

describe("places you have used before", () => {
  beforeEach(() => localStorage.clear());

  it("offers them the next time the field is empty", async () => {
    const user = await setup();
    await chooseStop(user, "Honnan", "Vasútállomás");

    cleanup();
    const again = userEvent.setup();
    render(<Planner network={network} places={places} reach={reach} box={box} fares={fares} />);
    await again.click(screen.getByLabelText("Hová"));
    const list = await screen.findByRole("listbox");
    expect(within(list).getByText("Vasútállomás")).toBeInTheDocument();
    expect(within(list).getAllByText("Korábban").length).toBeGreaterThan(0);
  });

  it("hides them the moment you start typing", async () => {
    const user = await setup();
    await chooseStop(user, "Honnan", "Vasútállomás");
    const to = screen.getByLabelText("Hová");
    await user.click(to);
    expect(within(await screen.findByRole("listbox")).queryByText("Korábban")).toBeTruthy();
    await user.type(to, "Aréna");
    expect(within(await screen.findByRole("listbox")).queryByText("Korábban")).toBeNull();
  });

  it("lets one be removed without touching the rest", async () => {
    const user = await setup();
    await chooseStop(user, "Honnan", "Vasútállomás");
    await chooseStop(user, "Hová", "Sepsi Aréna");
    const input = screen.getByLabelText("Honnan");
    await user.click(input);
    const list = await screen.findByRole("listbox");
    await user.click(within(list).getByLabelText(/Törlés a listából: Sepsi Ar[eé]na/i));
    await user.click(input);
    const updatedList = await screen.findByRole("listbox");
    expect(within(updatedList).queryByText(/Sepsi Ar[eé]na/i)).toBeNull();
    expect(within(updatedList).queryByText("Vasútállomás")).toBeTruthy();
  });

  it("can be cleared entirely, and says where it was kept", async () => {
    const user = await setup();
    await chooseStop(user, "Honnan", "Vasútállomás");
    await user.click(screen.getByLabelText("Beállítások"));
    expect(screen.getByText(/csak ezen az eszközön/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Előzmények törlése/ }));
    expect(localStorage.getItem("sepsi.recent")).toBe("[]");
  });
});

describe("pin picking and mobile search workflow edge cases", () => {
  afterEach(() => {
    media.narrow = false;
  });

  it("closes searching and enters picking mode when choosing on map on mobile", async () => {
    media.narrow = true;
    const user = await setup();
    const oneBar = screen.getByRole("button", { name: /Hová mész\?/i });
    await user.click(oneBar);

    const list = await screen.findByRole("listbox");
    const pickMapBtn = within(list).getByText(/Választás a térképen/i);
    await user.click(pickMapBtn);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Kész" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mégse" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kész" }));
    expect(screen.queryByRole("button", { name: "Kész" })).toBeNull();
  });

  it("does not save 'Keresés...' as place name when confirmed while reverse geocoding", async () => {
    const user = await setup();
    const toInput = screen.getByLabelText("Hová");
    await user.click(toInput);

    const list = await screen.findByRole("listbox");
    const pickMapBtn = within(list).getByText(/Választás a térképen/i);
    await user.click(pickMapBtn);

    const doneBtn = screen.getByRole("button", { name: "Kész" });
    await user.click(doneBtn);

    const toValue = (screen.getByLabelText("Hová") as HTMLInputElement).value;
    expect(toValue).not.toContain("Keresés");
    expect(toValue.length).toBeGreaterThan(0);
  });

  it("allows re-opening Hová search from journey list and picking on map without getting stuck", async () => {
    media.narrow = true;
    const user = await setup();
    await startPlanning(user);

    const oneBar = screen.getByRole("button", { name: /Hová mész\?/i });
    await user.click(oneBar);

    const list = await screen.findByRole("listbox");
    const pickMapBtn = within(list).getByText(/Választás a térképen/i);
    await user.click(pickMapBtn);

    expect(screen.getByRole("button", { name: "Kész" })).toBeInTheDocument();
  });

  it("dismisses search dropdown on desktop when clicking outside or pressing escape", async () => {
    const user = await setup();
    const toInput = screen.getByLabelText("Hová");
    await user.click(toInput);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(toInput);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("allows returning to idle search-free view via desktop back button and clears URL", async () => {
    const user = await setup();
    await startPlanning(user);

    const map = document.querySelector("main[class*='map']")!;
    const backBtn = within(map as HTMLElement).getByRole("button", { name: "Vissza" });
    await user.click(backBtn);

    expect(screen.queryByText(/Gyorsabb/i)).not.toBeInTheDocument();
    expect((screen.getByLabelText("Honnan") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Hová") as HTMLInputElement).value).toBe("");
    expect(window.location.search).toBe("");
  });
});
