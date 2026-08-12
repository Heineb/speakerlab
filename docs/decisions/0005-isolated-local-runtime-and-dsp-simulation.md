# ADR 0005: Isolated Local Runtime and Current-Beocreate DSP Simulation

- Status: Accepted
- Date: 2026-07-29
- Milestone: M0/M1 – Reproducible Baseline and Test Framework

## Context

The Beocreate server assumes `/opt/beocreate`, writable `/etc/beocreate`, port 80, root privileges, Buildroot global Node modules and extensions that eagerly access SigmaTCP, DSPToolkit, GPIO, ALSA, systemd and network services. Starting it directly on a developer machine is unsafe and non-reproducible.

The existing DSP wrapper is imported directly by multiple extensions. Introducing a generic hardware abstraction would exceed the current product scope and risk changing current behavior before it is characterized.

## Decision

SpeakerLab adds an opt-in local runtime selected only by `SPEAKERLAB_LOCAL_DEVELOPMENT=1` and launched by `npm run dev`.

The launcher:

1. installs the existing committed server lockfile with `npm ci` only when its modules are absent;
2. prepares the existing `/opt/beocreate` shape below a caller-provided temporary or gitignored workspace root;
3. stores all mutable application state below that runtime root;
4. binds the HTTP listener to `127.0.0.1`, with an ephemeral port by default;
5. selects connected or disconnected simulated DSP state;
6. enables only an audited hardware-free extension allow-list and reports every disabled extension with a reason; and
7. forwards termination signals to the existing graceful shutdown sequence.

The simulator implements the current exported `beocreate_essentials/dsp.js` call surface. Local startup substitutes that module before extension loading. No extension-facing interface or production import path changes. The model is limited to current Beocreate register/safeload/metadata/profile/reset behavior and deterministic failure states.

The locked server manifest does not include the deployed global `websocket` and `dnssd2` modules. Local mode uses a no-discovery communication seam and a zero-dependency WebSocket implementation limited to the existing Beocreate browser contract. It attaches to the isolated HTTP server, accepts the same root-path `beocreate` subprotocol, preserves the existing message envelope/routing surface and closes active sockets during shutdown.

Production defaults and behavior remain active when the explicit switch is absent. Local mode never invokes `runAtStart`, power control, Bonjour, System Tools activation metrics, SigmaTCP, DSPToolkit, GPIO or systemd.

## Consequences

Developers can start the existing server and assembled UI without root, physical hardware, real `/opt` or real `/etc`. Tests can exercise deterministic current-wrapper outcomes and graceful server lifecycle on macOS and Linux.

The safe extension subset is smaller than the deployed product. The local WebSocket implementation is not intended as a new public protocol or general-purpose server; production retains its existing dependency and transport. The simulator validates application-level wrapper contracts, not SigmaTCP framing, real-time timing, GPIO mute polarity, deployment durability or audible behavior. Those require protocol-level or hardware-in-the-loop tests.

Adding an extension to local startup requires evidence that its module evaluation, startup, activation and shutdown paths cannot access host services or hardware.

## Rejected alternatives

- Starting every extension and mocking failed commands: rejected because eager side effects could alter the developer host before a mock intercepts them.
- Writing to real `/opt` or `/etc`: rejected because it requires privilege and breaks isolation.
- A generic hardware/provider abstraction: rejected because only the existing Beocreate product is in scope.
- Reimplementing the full server: rejected because the purpose is to exercise the existing extension and UI assembly.
- Silently treating the simulator as hardware: rejected; logs and UI identify local simulated operation.
