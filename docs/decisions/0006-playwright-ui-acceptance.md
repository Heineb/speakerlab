# ADR 0006: Playwright UI Acceptance Tests

- Status: Accepted
- Date: 2026-07-29
- Milestone: M1 – Test Framework and Simulated Beocreate Hardware

## Context

Node and VM tests protect models, transports and selected client handlers, but they cannot detect browser loading order, CSS collisions, missing assets, pointer interaction, responsive layout or failures across the assembled UI and real local server.

## Decision

Use root-scoped `@playwright/test` with Chromium for a small acceptance layer against `scripts/start-local-server.js`. Each test receives a temporary runtime, loopback-only server and simulated current-Beocreate DSP. Tests use visible controls and observable UI state, fail on unexpected page errors, console errors, failed requests and HTTP 5xx/404 responses, and retain traces, screenshots, video and server logs on failure.

`npm run test:ui-acceptance` is part of `npm run verify`. CI runs it on Ubuntu and macOS using Node 24 and the committed root lockfile.

## Consequences

The suite protects first-run setup, configured startup, navigation, Signal Flow/Crossover editing and persistence, disconnected behavior, and configuration backup/restore including rollback feedback. It adds a browser download and approximately one minute to full local verification. It does not replace unit, contract, integration or hardware-in-the-loop testing and does not validate audio output or physical DSP deployment.

## Rejected alternatives

- Expanding the VM harness: it cannot expose rendering, asset or browser-lifecycle failures.
- Electron-driven acceptance first: the shipped Electron runtime is obsolete and is not the current local server boundary.
- A broad end-to-end framework or cloud browser service: unnecessary for the current local, deterministic scope.
