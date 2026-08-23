import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// see the note on testTimeout in vitest.config.mts
configure({ asyncUtilTimeout: 8_000 });

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// without globals enabled, Testing Library does not unmount between tests and
// every query then finds two of everything
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

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
