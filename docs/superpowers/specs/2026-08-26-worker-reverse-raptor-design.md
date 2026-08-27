# Planner Worker and reverse RAPTOR design

## Goal

Keep all route planning off the React/UI thread and answer `arriveBy` with
the latest timetable-valid departure, rather than sampling candidate start
minutes.

## Architecture

`Planner` sends an immutable request to one long-lived dedicated Worker.  The
worker loads and prepares the static `network.json` once per network version,
performs transit and multimodal planning, and returns cloneable `Journey[]`.
The main thread remains responsible for input state, rendering, and cancelling
obsolete result messages.  Existing walking and bicycle graph workers remain
the source of exact OSM paths; the planner worker is their client, never a
straight-line fallback.

For `departAt`, the current forward search remains valid.  For `arriveBy`, a
reverse RAPTOR search starts from every exact egress platform at the requested
deadline.  A label stores the latest time at which a passenger may be at a
platform and still finish on time.  It scans each pattern backwards, chooses
the latest valid trip/call, applies the same transfer minimum as the forward
search, and records predecessor hops.  Reconstruction reverses the hops into
the existing `Journey` format, so the presentation and map layers do not gain
a second representation.

The SepsiBike extension uses the same reverse label model: at a return dock it
enumerates usable pickup docks, subtracts the measured bicycle duration and
the pickup/return walks, and rejects pickups after 22:00.  Availability is a
per-request snapshot; stale availability remains explicitly marked on the
returned `BikeLeg`.

## Data flow and cancellation

1. Planner creates or reuses one `planner.worker.ts` instance.
2. It posts `init { network }` only when the supplied network version changes.
3. It posts a numbered `plan` request including coordinates, service, mode,
   line filter, walking context, bike availability, and stations.
4. A newer request sends `cancel { id }`; the worker checks cancellation
   between graph operations and does not post a stale response.
5. Planner accepts only the newest response ID.  Worker failures resolve to an
   empty option set, exactly as the current UI does.

## Constraints

- `arriveBy` must never return a journey whose `arrive` exceeds the requested
  minute.
- It must prefer the latest feasible departure for equivalent journeys.
- Published timetable times remain hard anchors; this work changes only
  routing, never timetable reconstruction.
- No new network request is introduced for normal use.  Static PWA assets and
  the downloaded OSM graphs continue to support offline operation.
- `departAt` behaviour is preserved while its computation moves into the
  Worker.

## Tests

- A reverse-RAPTOR fixture proves a deadline finds a departure that a fixed
  sampling grid would miss and honours `MIN_TRANSFER`.
- A Worker-client test verifies `init` is sent once, only the current request
  may resolve, and cancellation rejects/discards the older request.
- A multimodal arrive-by test checks a pickup after 22:00 is rejected and an
  earlier bike/bus combination returns the same `Journey` contract.
- Existing full planner suite and production build remain required gates.
