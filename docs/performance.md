# Performance Validation Guide

This project includes a lightweight checklist so you can reproduce the FPS and input-latency characteristics that the client asked for. The flow below assumes you already have the dev servers running via `npm run dev`.

## 1. Populate a High-Density Board

Use the development-only bulk endpoint to generate up to 500 nodes in one call:

```bash
curl -X POST http://localhost:3001/api/boards/1/nodes/bulk \
  -H 'Content-Type: application/json' \
  -H 'x-client-id: perf-script' \
  -d '{"count": 300}'
```

The payload is clamped to 1–500 nodes. The Express handler mirrors each insert over the WebSocket bus, so any connected canvas updates instantly and the React Query cache remains in sync.

To reset the dataset, either rerun `npm run db:seed --workspace apps/api` or delete rows directly through Prisma Studio (`npx prisma studio --workspace apps/api`).

## 2. Inspect the Live Canvas Metrics

In development builds the canvas now exposes a top-left HUD with real-time counters:

- **fps** – sampled every second using `requestAnimationFrame`
- **nodes / edges** – current element counts after React Query filtering
- **selected** – the number of nodes in the current selection set

The overlay has `pointer-events: none` so it never interferes with drag or pinch gestures.

## 3. Capture Browser-Level Diagnostics

For formal reports combine the HUD with Chrome/Edge DevTools:

1. Open DevTools → **Performance**.
2. Hit record, perform stress actions (multi-select drag, pinch zoom, bulk status updates).
3. Stop recording to inspect FPS, scripting, and input latency bars. Export the trace to attach to a status update.

If you need memory pressure data, switch to the **Performance Insights** or **Memory** panels and repeat the run.

## 4. Print a Summary

The following snippet records a one-minute average of the HUD metrics and logs the result, which is handy for quick regression checks:

```js
(() => {
  const start = performance.now();
  let frames = 0;
  const tick = () => {
    frames += 1;
    if (performance.now() - start >= 60_000) {
      console.table({
        averageFps: Math.round(frames / 60),
        nodes: window.__FLOWWEEK?.metrics?.nodes ?? 'n/a',
        edges: window.__FLOWWEEK?.metrics?.edges ?? 'n/a',
      });
      return;
    }
    requestAnimationFrame(tick);
  };
  tick();
})();
```

The global `window.__FLOWWEEK.metrics` object is updated alongside the HUD, so you can feed the values into custom dashboards if desired.

With these steps you can hand over a reproducible performance report that matches the client’s expectations without additional tooling.
