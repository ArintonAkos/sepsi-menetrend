# Planner Worker and reverse RAPTOR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move planning out of React's main thread and replace `arriveBy` sampling with timetable-exact reverse RAPTOR.

**Architecture:** A dedicated planner worker owns prepared static transit data and returns the existing `Journey` data model. The transit engine gains a reverse search which reconstructs normal forward legs. The worker protocol makes every request cancellable and delegates physical walking/bicycle paths to the already-bundled graph routers.

**Tech Stack:** Next.js 16, TypeScript, Web Workers, Vitest, existing RAPTOR/OSM routers.

**Spec:** `docs/superpowers/specs/2026-08-26-worker-reverse-raptor-design.md`

## Global Constraints

- Keep published timetable values and platform binding unchanged.
- Preserve `Journey`, `Leg`, and map rendering contracts.
- Never introduce straight-line walking/bicycle fallback.
- `arriveBy` must be exact to timetable calls and must not exceed the deadline.
- Do not publish stale Worker results.

---

### Task 1: Build and verify reverse transit search

**Files:**
- Modify: `web/lib/engine/plan.ts`
- Modify: `web/lib/engine/__tests__/plan.test.ts`

**Interfaces:**
- Produces: `planWithWalking(ctx, request, walking, limit)` using reverse RAPTOR when `request.mode === "arriveBy"`.

- [x] **Step 1: Write the failing deadline-grid regression test**

```ts
it("finds the last valid departure without sampling start minutes", () => {
  const found = planWithWalking(ctx, ask({ mode: "arriveBy", time: 8 * 60 + 52 }), exactWalking);
  expect(found[0].depart).toBe(8 * 60 + 29);
  expect(found[0].arrive).toBe(8 * 60 + 52);
});
```

- [x] **Step 2: Run the focused test and verify it fails because the sampled forward sweep selects an older/incorrect candidate.**

Run: `npm test -- --run web/lib/engine/__tests__/plan.test.ts`

- [x] **Step 3: Implement `reverseRaptor` and forward-hop reconstruction.**

```ts
function reverseRaptor(ctx: PlanContext, deadline: Minute, service: ServiceId,
                       allowed: Set<string> | undefined,
                       egress: ReadonlyMap<string, WalkingLeg>): ReverseLabel[]
```

Each reverse round scans `Pattern.stopIds` from end to start, chooses the last
trip whose alight call meets the current deadline, subtracts `MIN_TRANSFER`
only between rides, and writes a predecessor label at the boarding platform.

- [x] **Step 4: Run the focused planner test and then the full suite.**

Run: `npm test -- --run web/lib/engine/__tests__/plan.test.ts`
Run: `npm test`

- [ ] **Step 5: Commit the isolated reverse-search change.**

```bash
git add web/lib/engine/plan.ts web/lib/engine/__tests__/plan.test.ts
git commit -m "Use reverse RAPTOR for arrive-by transit planning"
```

### Task 2: Add a cancellable planner Worker client

**Files:**
- Create: `web/lib/planner.worker.ts`
- Create: `web/lib/planner-worker.ts`
- Create: `web/lib/planner-worker.test.ts`

**Interfaces:**
- Produces: `PlannerWorkerClient.plan(input): Promise<Journey[]>` and `dispose()`.

- [x] **Step 1: Write a failing client test for one-time initialization and stale-response suppression.**

```ts
expect(posted).toEqual([
  { type: "init", network },
  { type: "plan", id: 1, input },
  { type: "cancel", id: 1 },
  { type: "plan", id: 2, input: laterInput },
]);
```

- [x] **Step 2: Run the test and verify it fails because no client exists.**

Run: `npm test -- --run web/lib/planner-worker.test.ts`

- [x] **Step 3: Implement the typed message protocol and client.**

The client creates `new Worker(new URL("./planner.worker.ts", import.meta.url))`,
sends `init` once per `network.version`, cancels the prior ID before posting a
new request, and resolves only a matching `result` message.

- [x] **Step 4: Implement Worker initialization and transit execution.**

The Worker uses `prepare(network)` once and invokes `planWithWalking` for
transit-only requests. It checks a cancelled ID immediately before posting.

- [x] **Step 5: Run client and full tests.**

Run: `npm test -- --run web/lib/planner-worker.test.ts`
Run: `npm test`

```bash
git add web/lib/planner.worker.ts web/lib/planner-worker.ts web/lib/planner-worker.test.ts
git commit -m "Run transit planning in a cancellable worker"
```

### Task 3: Move multimodal planning and reverse bike edges into the Worker

**Files:**
- Modify: `web/lib/engine/multimodal.ts`
- Modify: `web/lib/planner.worker.ts`
- Modify: `web/lib/planner-worker.ts`
- Modify: `web/lib/engine/__tests__/multimodal.test.ts`

**Interfaces:**
- Consumes: `BikeAvailability`, `BikeStation[]`, `PlanRequest`, `WalkingContext`.
- Produces: exact deadline-valid multimodal `Journey[]`.

- [x] **Step 1: Write a failing reverse-bike deadline test.**

```ts
expect(result).toContainEqual(expect.objectContaining({
  depart: 19 * 60 + 42, arrive: 20 * 60,
}));
```

- [x] **Step 2: Run the focused test and verify it fails with forward sampled planning.**

Run: `npm test -- --run web/lib/engine/__tests__/multimodal.test.ts`

- [x] **Step 3: Implement reverse dock and bus transitions.**

For each return dock, use exact precomputed bicycle path duration to derive the
latest pickup. Reject unavailable docks and any pickup after 22:00. Preserve
the existing two-rental cap and `BikeLeg` terrain/cost values.

- [x] **Step 4: Move route-function use into Worker-owned graph clients.**

Use the existing `walking.ts`/`bicycle.ts` worker routers from the planner
worker; never send router functions through `postMessage`.

- [x] **Step 5: Run focused and full tests.**

Run: `npm test -- --run web/lib/engine/__tests__/multimodal.test.ts`
Run: `npm test`

```bash
git add web/lib/engine/multimodal.ts web/lib/planner.worker.ts web/lib/planner-worker.ts web/lib/engine/__tests__/multimodal.test.ts
git commit -m "Plan multimodal arrive-by journeys backwards in worker"
```

### Task 4: Connect Planner UI and verify end-to-end behaviour

**Files:**
- Modify: `web/components/planner/Planner.tsx`
- Modify: `web/components/planner/Planner.test.tsx`

**Interfaces:**
- Consumes: `PlannerWorkerClient`.
- Produces: responsive loading state and only-current `Journey[]`.

- [ ] **Step 1: Write a failing UI test that changes a request before its first answer arrives.**

```ts
expect(worker.cancelledIds).toContain(1);
expect(screen.queryByText("stale route")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify it fails because the UI still calls the engine directly.**

Run: `npm test -- --run web/components/planner/Planner.test.tsx`

- [x] **Step 3: Replace direct planner calls with one memoized Worker client.**

Keep all current keying, loading, empty-result and cleanup semantics. Dispose
the worker when the component unmounts.

- [x] **Step 4: Run full verification and inspect the production bundle.**

Run: `npm test`
Run: `npm run build`
Run: `git diff --check`

- [ ] **Step 5: Commit the UI handoff.**

```bash
git add web/components/planner/Planner.tsx web/components/planner/Planner.test.tsx
git commit -m "Use planner worker from route search UI"
```
