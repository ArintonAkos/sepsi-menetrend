import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// see the note on testTimeout in vitest.config.mts
configure({ asyncUtilTimeout: 8_000 });

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import graph from "./public/data/walking-graph.json";
import { WalkingRouter, type FootPath, type WalkingGraph } from "./lib/walking-router";

// without globals enabled, Testing Library does not unmount between tests and
// every query then finds two of everything
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

/** jsdom has no Worker.  The production worker is deliberately a thin shell
 * over this pure router, so emulate its message protocol rather than making
 * the planner fall back to the old straight-line algorithm in tests. */
class FakeWalkingWorker {
  private listener: ((event: MessageEvent) => void) | null = null;
  private readonly router = new WalkingRouter(graph as WalkingGraph);

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === "message") this.listener = listener;
  }

  postMessage(request: { id: number; type: string; from?: [number, number]; to?: [number, number];
                         destinations?: [number, number][]; destination?: [number, number];
                         origins?: [number, number][] }) {
    let routes: Array<FootPath | null> = [];
    if (request.type === "route" && request.from && request.to)
      routes = [this.router.route(request.from, request.to)];
    if (request.type === "from" && request.from && request.destinations)
      routes = this.router.routesFrom(request.from, request.destinations);
    if (request.type === "to" && request.destination && request.origins)
      routes = this.router.routesTo(request.destination, request.origins);
    queueMicrotask(() => this.listener?.({ data: { id: request.id, routes } } as MessageEvent));
  }
}

Object.defineProperty(globalThis, "Worker", { writable: true, value: FakeWalkingWorker });

/** jsdom has no WebGL, so Mapbox cannot start. The map is not what these tests
 *  are checking - the panel around it is. */
vi.mock("mapbox-gl", () => {
  class FakeMap {
    on() { return this; }
    once() { return this; }
    addControl() { return this; }
    remove() {}
    resize() {}
    getStyle() { return { layers: [] }; }
    getSource() { return undefined; }
    getLayer() { return undefined; }
    addSource() {}
    addLayer() {}
    setFilter() {}
    setStyle() {}
    fitBounds() {}
    getCenter() { return { toArray: () => [25.7876, 45.8636] }; }
  }
  class FakeBounds {
    extend() { return this; }
  }
  return {
    default: { Map: FakeMap, NavigationControl: class {}, GeolocateControl: class {},
               AttributionControl: class {}, LngLatBounds: FakeBounds, accessToken: "" },
    Map: FakeMap, NavigationControl: class {}, GeolocateControl: class {},
    AttributionControl: class {}, LngLatBounds: FakeBounds,
  };
});

/** jsdom has no layout, so media queries never match. Tests that care about the
 *  phone layout set this; everything else gets the desktop answer. */
export const media = { narrow: false, dark: false };

const listeners = new Set<() => void>();

window.matchMedia = ((query: string) => ({
  get matches() {
    if (query.includes("max-width")) return media.narrow;
    if (query.includes("prefers-color-scheme: dark")) return media.dark;
    return false;
  },
  media: query, onchange: null,
  addEventListener: (_: string, fn: () => void) => listeners.add(fn),
  removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  addListener: (fn: () => void) => listeners.add(fn),
  removeListener: (fn: () => void) => listeners.delete(fn),
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

afterEach(() => { media.narrow = false; media.dark = false; });
