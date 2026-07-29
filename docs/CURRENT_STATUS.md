# Current Status

## Current milestone

**M0/M1 foundation — reproducible local application and current-Beocreate contract testing**

Current working branch: `develop`.

## Latest completed slice

The isolated local server now supports the existing Beocreate browser WebSocket contract:

```sh
npm run dev
```

The printed loopback URL serves the existing UI and accepts `ws://<host>/` connections with subprotocol `beocreate`. The browser and server exchange the existing `{target, header, content?}` JSON envelopes without simulator-specific client messages.

Local startup remains isolated below `.speakerlab-local/runtime`, uses an audited hardware-free extension subset and selects connected or disconnected current-Beocreate DSP simulation:

```sh
npm run dev -- --dsp-state connected
npm run dev -- --dsp-state disconnected
```

On connection, the existing client establishes its own visible connection state. The local server emits the existing `dsp-programs/status` envelope to that connection, then ordinary client activation and state requests use the unchanged extension bus. Reconnection creates a new connection identity and re-sends current simulated DSP status.

System Tools backup/restore retains its established split: WebSocket connection and activation enable the UI and deliver capabilities; export, preview and confirmed restore remain HTTP operations.

Bonjour is neither loaded nor required locally. Production Bonjour, WebSocket selection, binding, DSP and audio behavior remain unchanged.

## Verification

Run:

```sh
npm run test:websocket-contract
npm run test:websocket-lifecycle
npm run test:websocket-client
npm run test:local-server
npm run verify
```

The WebSocket suites cover routing, content preservation, malformed/invalid input, handler failure, binary and 1 MiB size rejection, clean/abrupt close, reconnect, multiple clients, broadcast, targeted response, ordering, ping/pong and shutdown. The existing client script is executed in a deterministic harness for envelope construction, dispatch, connection state, malformed server data and reconnect behavior.

The complete normal suite remains hardware-free and uses only isolated state and loopback networking.

## Foundation currently available

* local deployed `/opt/beocreate` shape without writing to real `/opt`
* isolated HTTP/UI and WebSocket startup without root or HiFiBerryOS
* deterministic current-Beocreate DSP wrapper simulation
* settings, preset and listening-mode characterization
* atomic central settings persistence
* versioned configuration backup, preview, restore and rollback
* repository-wide JavaScript syntax verification
* Ubuntu/macOS CI on provisional tooling Node.js 24

## Known gaps and risks

* The zero-dependency local WebSocket transport is intentionally limited to browser features used by Beocreate; it is not a general WebSocket implementation.
* Production still relies on globally supplied legacy `websocket` and `dnssd2` modules.
* The application contract has no request IDs, acknowledgements, authentication, heartbeat or automatic arbitrary state replay.
* Unknown extension/header messages are silently ignored by the legacy event routing.
* Hardware-dependent extensions remain disabled locally.
* SigmaTCP framing, real DSP readback, GPIO mute safety, deployment rollback and audible behavior still require protocol-peer or hardware-in-the-loop coverage.
* Beocreate Connect installation and Electron packaging remain blocked by obsolete native dependencies on the audited Apple Silicon environment.
* Interactive browser automation is not yet part of the repository suite.

## Next recommended slice

Characterize the real SigmaTCP wire framing, read queue and reconnect limit with golden protocol fixtures while continuing to use the current Beocreate-only DSP boundary.

Do not begin broad dependency modernization until the remaining production transport paths are protected.

## Deferred

The root `README.md` update remains deferred until development setup, supported runtime claims and project maturity are sufficiently verified. Future hardware remains outside the roadmap.
