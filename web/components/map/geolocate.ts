/* Mapbox's GeolocateControl decides once whether location is available and
   never looks again. If `permissions.query` says "denied" when the map is
   built, or its own first fix is refused, the button is disabled for the life
   of the page - so a rider who then allows location (in the planner's own
   prompt, or in the browser's settings) still sees the struck-through icon
   until they reload, sometimes more than once. These two helpers put the
   button back as soon as there is evidence that location works. */

/** The control's button, inside the map's container. */
const BUTTON = "button.mapboxgl-ctrl-geolocate";

/** Re-enable a disabled geolocate button. `title` is the label Mapbox gives an
 *  enabled button ("Find my location"); it replaces "Location not available".
 *  Returns whether anything changed. */
export function reviveGeolocate(container: ParentNode, title: string): boolean {
  const button = container.querySelector<HTMLButtonElement>(BUTTON);
  if (!button || !button.disabled) return false;
  button.disabled = false;
  button.title = title;
  button.setAttribute("aria-label", title);
  return true;
}

/** Revive the button whenever the browser reports that the geolocation
 *  permission has left "denied". Returns an unsubscribe. Browsers without the
 *  Permissions API, or that reject the query, simply get no listener - the
 *  planner's own successful fix still revives the button. */
export function reviveOnPermissionChange(
  container: ParentNode,
  title: string,
  permissions: Pick<Permissions, "query"> | undefined =
    typeof navigator === "undefined" ? undefined : navigator.permissions,
): () => void {
  let status: PermissionStatus | null = null;
  let stopped = false;
  const onChange = () => {
    if (status && status.state !== "denied") reviveGeolocate(container, title);
  };
  permissions?.query({ name: "geolocation" })
    .then((s) => {
      if (stopped) return;
      status = s;
      s.addEventListener("change", onChange);
      // the state may already have moved on between map build and now
      onChange();
    })
    .catch(() => {});
  return () => {
    stopped = true;
    status?.removeEventListener("change", onChange);
  };
}
