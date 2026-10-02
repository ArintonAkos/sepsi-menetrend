import { describe, it, expect } from "vitest";
import { reviveGeolocate, reviveOnPermissionChange } from "./geolocate";

/** A map container holding Mapbox's geolocate button, disabled the way the
 *  control leaves it after a "denied" permission snapshot. */
function container(disabled = true): HTMLElement {
  const host = document.createElement("div");
  const button = document.createElement("button");
  button.className = "mapboxgl-ctrl-geolocate";
  button.disabled = disabled;
  button.title = "Location not available";
  host.appendChild(button);
  return host;
}
const button = (host: HTMLElement) => host.querySelector("button")!;

/** A PermissionStatus whose state can be flipped, firing "change" like a browser. */
function fakeStatus(state: PermissionState) {
  const target = new EventTarget() as PermissionStatus & { state: PermissionState };
  Object.defineProperty(target, "state", { value: state, writable: true });
  return {
    status: target,
    set(next: PermissionState) {
      target.state = next;
      target.dispatchEvent(new Event("change"));
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("reviveGeolocate", () => {
  it("re-enables a disabled button and gives it the working label", () => {
    const host = container();
    expect(reviveGeolocate(host, "Find my location")).toBe(true);
    expect(button(host).disabled).toBe(false);
    expect(button(host).title).toBe("Find my location");
    expect(button(host).getAttribute("aria-label")).toBe("Find my location");
  });

  it("leaves an enabled button alone", () => {
    const host = container(false);
    expect(reviveGeolocate(host, "Find my location")).toBe(false);
    expect(button(host).title).toBe("Location not available");
  });
});

describe("reviveOnPermissionChange", () => {
  it("revives the button when the permission leaves denied", async () => {
    const host = container();
    const p = fakeStatus("denied");
    reviveOnPermissionChange(host, "Find my location", { query: async () => p.status });
    await tick();
    expect(button(host).disabled).toBe(true);
    p.set("granted");
    expect(button(host).disabled).toBe(false);
  });

  it("revives at once if the state already moved on before the query answered", async () => {
    const host = container();
    reviveOnPermissionChange(host, "Find my location", {
      query: async () => fakeStatus("prompt").status,
    });
    await tick();
    expect(button(host).disabled).toBe(false);
  });

  it("stops listening once unsubscribed", async () => {
    const host = container();
    const p = fakeStatus("denied");
    const stop = reviveOnPermissionChange(host, "Find my location", { query: async () => p.status });
    await tick();
    stop();
    p.set("granted");
    expect(button(host).disabled).toBe(true);
  });

  it("is quiet when the Permissions API rejects", async () => {
    const host = container();
    reviveOnPermissionChange(host, "Find my location", {
      query: () => Promise.reject(new Error("unsupported")),
    });
    await tick();
    expect(button(host).disabled).toBe(true);
  });
});
