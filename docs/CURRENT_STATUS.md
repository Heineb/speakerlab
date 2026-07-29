# Current Status

## Current milestone

**M8 — Crossover Editor Foundation**

Current working branch: `develop`.

## Latest completed slice

Local UI assembly now preserves ordered extension-local client dependencies declared by active `src="€/..."` script tags. Configuration backup state loads before System Tools, and the Signal Flow state model loads before its client. Both globals are explicit, idempotent `window` properties; repeated page generation emits each script once, and repeated client evaluation does not duplicate handlers.

System Tools reports and visibly disables configuration restore if its optional state helper is absent. Signal Flow reports an unavailable client instead of throwing if its required state helper is absent.

Menu registration now assigns `parentMenu` only when the declared destination exists. This keeps locally enabled Speaker Preset and Signal Flow screens navigable when the hardware-dependent Sound parent is filtered out. `showExtension` returns a clear diagnostic for unknown screens, missing menu metadata, invalid parents or navigation already in progress instead of throwing.

Focused tests cover actual menu declaration order, generated script order, top-level browser-like execution, idempotent initialization, setup destinations and progression, Signal Flow/Crossover reachability, repeated UI generation, WebSocket state and reconnect.

## Verification

```sh
npm run test:client-initialization
npm run test:setup-navigation
npm run test:signal-flow
npm run test:routing-ui
npm run test:crossover-ui
npm run test:websocket-contract
npm run test:websocket-lifecycle
npm run test:websocket-client
npm run test:local-server
npm test
npm run verify
npm run check:syntax
git diff --check
```

Automated focused and complete verification passes on the development runtime.

## Known limitations

* Manual browser click-through remains unverified because no controllable browser session was available. Connected local startup and clean shutdown were verified.
* The browser-like harness is intentionally minimal and does not validate layout, pointer events or browser rendering.
* Production HiFiBerryOS and physical hardware behavior remain unverified.
* Crossover designs remain simulated and are not deployed to the DSP.

## Next recommended slice

Run the documented clean-browser connected/disconnected setup, Signal Flow, Crossover and refresh smoke path when a browser session is available. After that verification, resume the planned Channel Gain, Delay and Polarity v1 slice as a separate task.
