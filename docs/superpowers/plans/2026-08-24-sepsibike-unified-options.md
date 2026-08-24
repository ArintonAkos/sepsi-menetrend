# SepsiBike Unified Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Present direct SepsiBike journeys as time-aware, selectable planner options alongside bus journeys, with detailed routing, inventory, and fare information.

**Architecture:** RAPTOR bus planning and OSM direct-bike routing stay independent. A pure timing/pricing layer converts a viable BikeJourneyOption into a TimedBikeJourney; a pure adapter merges bike and transit records into a discriminated PlannerOption array for the UI. Planner owns selection, and Mapbox draws the selected option without changing transit inputs or URL semantics.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Mapbox GL, existing OSM workers.

**Spec:** docs/superpowers/specs/2026-08-24-sepsibike-unified-option-design.md

## Global Constraints

- Direct “bus or SepsiBike” choices only; no bus + bike transfer routing.
- Rental pickup is daily 06:00 inclusive to 22:00 exclusive; returns after 22:00 are valid.
- Do not hard-code winter closure; live Online inventory governs availability and snapshot data is visibly last-known.
- Fare uses bicycle rental time only: 0–30 = 0 lei, 31–90 = 2 lei, 91–150 = 4 lei, then 6 lei for each started hour after 150 minutes.
- Preserve RAPTOR inputs and the bus-only journey URL parameter.
- Translate all new text in HU, RO, and EN. Do not push commits.

---

## File Structure

- web/lib/sepsibike-timing.ts and .test.ts: pure rental window, timed route and tariff rules.
- web/lib/planner-options.ts and .test.ts: discriminated union and deterministic mixed-result order.
- web/components/journey/BikeJourneyDetail.tsx, .module.css, .test.tsx: direct-bike detail timeline.
- web/components/journey/JourneyList.tsx: mixed transit/bike list cards.
- web/components/planner/Planner.tsx and .test.tsx: timed option construction, common selection, correct map detail.
- web/lib/i18n.ts: localized journey-detail copy.

## Task 1: Encode SepsiBike operating time and price

**Files:**
- Create: web/lib/sepsibike-timing.ts
- Create: web/lib/sepsibike-timing.test.ts

**Interfaces:**
- Consumes: BikeJourneyOption, Minute, and PlanMode from web/lib/engine/types.ts.
- Produces: TimedBikeJourney, timeBikeJourney, estimatedBikeFare.

- [ ] **Step 1: Write failing boundary and tariff tests**

~~~ts
const station = (id: string) => ({ id, name: id, address: id, lat: 45.86, lng: 25.78,
  availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online" });
const bike: BikeJourneyOption = {
  start: station("01"), finish: station("02"), stale: false, isFreeEstimate: true,
  access: { path: [], metres: 100, minutes: 5 },
  ride: { path: [], metres: 2000, minutes: 10 },
  egress: { path: [], metres: 80, minutes: 1 },
};
it("allows a 21:55 pickup whose return is after 22:00", () => {
  const timed = timeBikeJourney(bike, 21 * 60 + 50, "departAt");
  expect(timed?.pickup).toBe(21 * 60 + 55);
  expect(timed?.returnAt).toBeGreaterThan(22 * 60);
});
it("rejects a pickup at 22:00", () => {
  expect(timeBikeJourney(bike, 21 * 60 + 55, "departAt")).toBeNull();
});
it("allows a pickup exactly at 06:00", () => {
  expect(timeBikeJourney(bike, 5 * 60 + 55, "departAt")?.pickup).toBe(6 * 60);
});
it("works backwards from an arrive-by deadline", () => {
  expect(timeBikeJourney(bike, 22 * 60 + 11, "arriveBy")).toMatchObject({ pickup: 21 * 60 + 55 });
});
it("prices only the rental segment", () => {
  expect([30, 31, 91, 151, 211].map(estimatedBikeFare)).toEqual([0, 2, 4, 6, 12]);
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: cd web && npm test -- lib/sepsibike-timing.test.ts

Expected: FAIL because the timing module does not exist.

- [ ] **Step 3: Implement the pure time model**

~~~ts
export interface TimedBikeJourney extends BikeJourneyOption {
  depart: Minute; pickup: Minute; returnAt: Minute; arrive: Minute; fareLei: number;
}
export function estimatedBikeFare(rideMinutes: number) {
  if (rideMinutes <= 30) return 0;
  if (rideMinutes <= 90) return 2;
  if (rideMinutes <= 150) return 4;
  return 6 * Math.ceil((rideMinutes - 150) / 60);
}
export function timeBikeJourney(base: BikeJourneyOption, requested: Minute, mode: PlanMode) {
  const total = base.access.minutes + base.ride.minutes + base.egress.minutes;
  const depart = mode === "departAt" ? requested : requested - total;
  const pickup = depart + base.access.minutes;
  const returnAt = pickup + base.ride.minutes;
  const arrive = returnAt + base.egress.minutes;
  return pickup >= 360 && pickup < 1320
    ? { ...base, depart, pickup, returnAt, arrive, fareLei: estimatedBikeFare(base.ride.minutes) }
    : null;
}
~~~

- [ ] **Step 4: Run the focused test to verify it passes**

Run: cd web && npm test -- lib/sepsibike-timing.test.ts

Expected: PASS; 06:00/22:00 and price-tier assertions all pass.

- [ ] **Step 5: Commit**

~~~bash
git add web/lib/sepsibike-timing.ts web/lib/sepsibike-timing.test.ts
git commit -m "feat: time and price SepsiBike journeys"
~~~

## Task 2: Create a common transit/bike result model

**Files:**
- Create: web/lib/planner-options.ts
- Create: web/lib/planner-options.test.ts

**Interfaces:**
- Consumes: Journey, PlanMode, TimedBikeJourney.
- Produces: PlannerOption, plannerOptionTimes, mergePlannerOptions.

- [ ] **Step 1: Write failing merge-order tests**

~~~ts
const busAt = (arrive: number) => ({ depart: arrive - 10, arrive } as Journey);
const busLeaving = (depart: number) => ({ depart, arrive: depart + 10 } as Journey);
const bikeAt = (arrive: number) => ({ depart: arrive - 12, arrive } as TimedBikeJourney);
const bikeLeaving = (depart: number) => ({ depart, arrive: depart + 12 } as TimedBikeJourney);
it("inserts a bike option by projected arrival for depart-at", () => {
  const result = mergePlannerOptions([busAt(520), busAt(545)], bikeAt(530), "departAt");
  expect(result.map((item) => item.kind)).toEqual(["transit", "bike", "transit"]);
});
it("puts the latest usable departure first for arrive-by", () => {
  expect(mergePlannerOptions([busLeaving(480)], bikeLeaving(495), "arriveBy")[0].kind).toBe("bike");
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: cd web && npm test -- lib/planner-options.test.ts

Expected: FAIL because no common option model exists.

- [ ] **Step 3: Implement the discriminated union and sort**

~~~ts
export type PlannerOption =
  | { kind: "transit"; journey: Journey }
  | { kind: "bike"; journey: TimedBikeJourney };
export const plannerOptionTimes = (option: PlannerOption) =>
  option.kind === "transit"
    ? { depart: option.journey.depart, arrive: option.journey.arrive }
    : { depart: option.journey.depart, arrive: option.journey.arrive };
export function mergePlannerOptions(transit: Journey[], bike: TimedBikeJourney | null, mode: PlanMode) {
  const options: PlannerOption[] = transit.map((journey) => ({ kind: "transit", journey }));
  if (bike) options.push({ kind: "bike", journey: bike });
  return options.sort((a, b) => mode === "arriveBy"
    ? plannerOptionTimes(b).depart - plannerOptionTimes(a).depart
    : plannerOptionTimes(a).arrive - plannerOptionTimes(b).arrive);
}
~~~

- [ ] **Step 4: Run the focused test to verify it passes**

Run: cd web && npm test -- lib/planner-options.test.ts

Expected: PASS; both modes interleave the two option kinds correctly.

- [ ] **Step 5: Commit**

~~~bash
git add web/lib/planner-options.ts web/lib/planner-options.test.ts
git commit -m "feat: merge direct bike and transit options"
~~~

## Task 3: Build the SepsiBike detail timeline

**Files:**
- Create: web/components/journey/BikeJourneyDetail.tsx
- Create: web/components/journey/BikeJourneyDetail.module.css
- Create: web/components/journey/BikeJourneyDetail.test.tsx
- Modify: web/lib/i18n.ts

**Interfaces:**
- Consumes: TimedBikeJourney and Strings.
- Produces: BikeJourneyDetail for Planner.

- [ ] **Step 1: Write the failing detail component test**

~~~tsx
const station = (id: string) => ({ id, name: id, address: id, lat: 45.86, lng: 25.78,
  availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online" });
const bike: TimedBikeJourney = {
  start: station("01"), finish: station("02"), depart: 480, pickup: 482,
  returnAt: 486, arrive: 488, fareLei: 2, stale: false, isFreeEstimate: false,
  access: { path: [], metres: 120, minutes: 2 },
  ride: { path: [], metres: 850, minutes: 4 }, egress: { path: [], metres: 80, minutes: 2 },
};
render(<BikeJourneyDetail journey={bike} t={STRINGS.hu} onBack={() => {}} />);
expect(screen.getByText(/120 m · 2 perc gyaloglás/)).toBeInTheDocument();
expect(screen.getByText(/850 m · 4 perc kerékpározás/)).toBeInTheDocument();
expect(screen.getByText(/Becsült díj.*2 lej/)).toBeInTheDocument();
expect(screen.getByText(/GloBikes-fiók szükséges/)).toBeInTheDocument();
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: cd web && npm test -- components/journey/BikeJourneyDetail.test.tsx

Expected: FAIL because the detail component and translated copy do not exist.

- [ ] **Step 3: Implement localized direct-bike detail**

Add bikePickup, bikeReturn, estimatedBikeFare, bikeServiceHours,
bikeAfterHoursReturn, bikeInventoryLastKnown, and bikeSupport to all three
Strings locale objects. Render origin, access walk, pickup dock, bicycle
segment, return dock, egress walk, and destination. Use each path's own metres
and minutes; show fareLei, stale inventory warning, GloBikes requirement, and
the SepsiBike customer-service number 0374 451 350. The Back button uses
aria-label={t.back}.

- [ ] **Step 4: Run the focused component test to verify it passes**

Run: cd web && npm test -- components/journey/BikeJourneyDetail.test.tsx

Expected: PASS; route segments, fare, warning/precondition and back control render.

- [ ] **Step 5: Commit**

~~~bash
git add web/components/journey/BikeJourneyDetail.tsx web/components/journey/BikeJourneyDetail.module.css \
  web/components/journey/BikeJourneyDetail.test.tsx web/lib/i18n.ts
git commit -m "feat: show detailed SepsiBike journeys"
~~~

## Task 4: Integrate one selectable option list

**Files:**
- Modify: web/components/journey/JourneyList.tsx
- Modify: web/components/journey/JourneyList.module.css
- Modify: web/components/planner/Planner.tsx
- Modify: web/components/planner/Planner.module.css
- Modify: web/components/planner/Planner.test.tsx

**Interfaces:**
- Consumes: PlannerOption and BikeJourneyDetail.
- Produces: common onHover(option) and onOpen(option) callbacks for both route kinds.

- [ ] **Step 1: Write failing planner integration tests**

~~~tsx
async function setPlannerTime(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(screen.getByRole("button", { name: /Indulás|Érkezés/ }));
  fireEvent.change(screen.getByDisplayValue(/^\d{2}:\d{2}$/), { target: { value } });
  await user.keyboard("{Escape}");
}
it("places SepsiBike inside selectable results and opens its detail", async () => {
  await startPlanning(user, "Nicolae Iorga", "Sepsi Aréna");
  const bike = await screen.findByRole("button", { name: /SepsiBike/ });
  expect(bike.closest("li")).not.toBeNull();
  await user.click(bike);
  expect(screen.getByText(/GloBikes-fiók szükséges/)).toBeInTheDocument();
});
it("does not show a bike option when departure is 22:00", async () => {
  await setPlannerTime(user, "22:00");
  expect(screen.queryByRole("button", { name: /SepsiBike/ })).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: cd web && npm test -- components/planner/Planner.test.tsx

Expected: FAIL because the current SepsiBike card sits outside the journey list and has no detail state.

- [ ] **Step 3: Make Planner construct and select common options**

After findBikeOption, call timeBikeJourney with the requested time and mode,
then call mergePlannerOptions(journeys, timedBike, mode). Replace numeric-only
detail selection and bikeSelectedKey with selected PlannerOption or null keyed
to the request. Send a selected bike route to TransitMap; send a selected
transit route through existing useRoutedWalks. Pass a bus index or null to
encodeTrip, never the mixed-list index.

- [ ] **Step 4: Render both list-card kinds**

Keep current transit card markup and fare logic. Add a bike branch inside the
same list-item/button structure: blue bike icon, total duration, projected
depart → arrive, access/ride/egress minutes, dock names and estimated fare.
Both branches call the same onOpen(option) and onHover(option) callbacks.
Remove the standalone green bikeCard from Planner.

- [ ] **Step 5: Open the correct detail and map route**

When the selected option is bike, render BikeJourneyDetail where JourneyDetail
is currently rendered and clear selection with its Back action. When it is
transit, preserve JourneyDetail, later-departure and stop-board behaviour.
Ensure only the selected option's geometry is painted on the map.

- [ ] **Step 6: Run focused integration tests to verify they pass**

Run: cd web && npm test -- components/planner/Planner.test.tsx components/journey/BikeJourneyDetail.test.tsx

Expected: PASS; the bike route is inside the list, opens details, paints its map route, and respects pickup hours.

- [ ] **Step 7: Commit**

~~~bash
git add web/components/journey/JourneyList.tsx web/components/journey/JourneyList.module.css \
  web/components/planner/Planner.tsx web/components/planner/Planner.module.css \
  web/components/planner/Planner.test.tsx
git commit -m "feat: present SepsiBike as a planner option"
~~~

## Task 5: Verify the branch

**Files:**
- Modify: docs/superpowers/plans/2026-08-24-sepsibike-unified-options.md

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: reproducible verification record.

- [ ] **Step 1: Run the complete automated suite**

Run: cd web && npm test

Expected: PASS with zero failed files and tests; record exact counts in this plan.

- [ ] **Step 2: Build the static PWA**

Run: cd web && npm run build

Expected: PASS; Next compiles, type-checks, generates static pages, and stamps the service worker.

- [ ] **Step 3: Check the worktree**

Run: git diff --check HEAD && git status --short

Expected: no whitespace errors and no web/.netlify entry.

- [ ] **Step 4: Record evidence and commit**

Replace the Task 5 checkboxes with completed states and append exact results.

~~~bash
git add docs/superpowers/plans/2026-08-24-sepsibike-unified-options.md
git commit -m "docs: verify unified SepsiBike options"
~~~
