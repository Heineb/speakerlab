# Current Status

## Current milestone

**M1 — UI Acceptance and Regression Test Foundation**

Current working branch: `develop`.

## Latest completed slice

Playwright 1.62 and Chromium now exercise the assembled UI against an isolated local server and simulated current-Beocreate DSP. Acceptance journeys cover first-run and configured setup, named and generic speaker profiles, enabled-screen navigation, responsive widths, Signal Flow/Crossover editing and persistence, interrupted WebSocket reconnect with clean or unsaved state, explicit disconnected behavior, and configuration backup/restore with rollback feedback.

Real-browser testing exposed and now protects five concrete defects: the local simulator could not acknowledge a preset fallback-program install, Signal Flow omitted its declared navigation icon, global legacy `section` CSS hid all routing and crossover controls, a disconnected runtime state was overwritten as connected in the UI model, and reconnect conflicts were not explained visibly. Only the explicit local-development DSP seam changes server behavior; deployed hardware startup remains unchanged.

## Verification

```sh
npm run test:ui-acceptance
npm test
npm run check:syntax
npm run verify
git diff --check
```

CI installs locked root and server dependencies, installs Chromium, runs verification on Ubuntu and macOS, and uploads Playwright traces, screenshots, videos and logs on failure.

## Remaining risks

Physical DSP deployment, audio output, GPIO/systemd/HiFiBerryOS integration, Electron, comprehensive keyboard/screen-reader behavior and visual snapshot regression remain outside this browser layer. The requested manual browser pass remains unverified because no interactive browser session was available; the equivalent automated Chromium journey is green.

## Next recommended slice

Add a focused keyboard and screen-reader smoke slice for the existing setup, routing, crossover and restore controls. Do not broaden into UI redesign or hardware deployment.
