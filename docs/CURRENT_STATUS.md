# Current Status

## Current milestone

**M0/M1 foundation — reproducible local server and current-Beocreate DSP simulation**

SpeakerLab now has an explicit, isolated local-development startup path for the existing Beocreate server and browser UI. This is a development/test mode, not a production runtime or a HiFiBerryOS replacement.

## Branch model

* `master` is stable.
* `develop` is the normal working and milestone-integration branch.
* SpeakerLab work remains in `Heineb/speakerlab`; nothing is submitted upstream without explicit direction.

## Latest completed slice

Run:

```sh
npm run dev
```

The launcher creates `.speakerlab-local/runtime`, reproduces the deployed `/opt/beocreate` shape with links, stores mutable state below the runtime root, selects the current-Beocreate DSP simulator, binds the HTTP server to an ephemeral loopback port and prints the URL. Use:

```sh
npm run dev -- --port 8080 --dsp-state connected
npm run dev -- --dsp-state disconnected
```

The launcher never writes to real `/opt` or `/etc`, requires no root privileges and never contacts SigmaTCP or physical hardware. On a clean checkout the same command installs the server's existing committed lockfile with `npm ci` before startup. It does not upgrade dependencies or regenerate the lockfile; the first run therefore requires npm registry access unless the packages are already cached.

Local mode explicitly enables the hardware-free extension subset and logs every disabled extension with its reason. The browser shell marks local simulated operation with a small persistent badge. Production startup remains the default when the explicit environment switch is absent.

The local communication seam intentionally disables Bonjour and the unavailable legacy WebSocket package. Static UI assembly, extension navigation markup, REST routes and graceful HTTP shutdown run locally; live browser-to-server WebSocket interaction remains unimplemented and is not claimed.

## Verification

Run:

```sh
npm run test:local-server
npm run test:dsp-simulator
npm run verify
```

The new suites cover isolated/idempotent runtime preparation, paths containing spaces, loopback-only binding, complete extension classification, connected/disconnected startup, UI assembly, graceful shutdown, register and safeload read/write behavior, metadata present/unavailable, deterministic error/timeout/malformed outcomes, reconnect, reset and mute state.

The normal suite requires no physical hardware, HiFiBerryOS, root access or external network. Loopback-binding tests may require permission from a restrictive execution sandbox.

## Existing foundation

The repository also has characterized and tested boundaries for:

* local deployed-layout preparation
* central settings reads, shallow default merging, delayed writes and shutdown flush
* speaker-preset and listening-mode discovery
* atomic central JSON persistence
* versioned configuration backup, preview, restore and rollback
* repository-wide JavaScript syntax verification
* Ubuntu/macOS CI on provisional tooling Node.js 24

No dependency, Electron, DSP program, configuration format or audible production behavior changed in this slice.

## Remaining risks and gaps

* The local WebSocket communication path is not available, so live extension controls are not yet an end-to-end browser workflow.
* The simulator protects the current `dsp.js` call surface but does not emulate SigmaTCP wire framing, DSPToolkit processes, GPIO mute polarity or systemd.
* Hardware-dependent extensions remain disabled locally; their startup and shutdown contracts need narrower seams before inclusion.
* Node.js 24 remains a tooling baseline, not a verified deployed Beocreate runtime.
* Beocreate Connect installation and Electron packaging remain blocked by obsolete native dependencies on the audited Apple Silicon setup.
* Real DSP readback, deployment rollback, power-loss behavior and audible output remain hardware-in-the-loop questions.

## M0/M1 acceptance progress

Completed:

* isolated local HTTP/UI startup with explicit simulated connected/disconnected DSP state
* loopback-only dynamic/default port and isolated mutable state
* deterministic current-Beocreate DSP wrapper simulator and focused contracts
* extension startup audit and explicit safe subset
* graceful local shutdown coverage

Still incomplete:

* live local WebSocket client/server communication
* SigmaTCP framing/reconnect characterization against a protocol peer
* resource-application and DSP-program deployment characterization
* linting, formatting, type checking and coverage reporting
* verified production and Electron runtime versions

## Recommended next task

Add a zero-dependency local WebSocket transport compatible with the existing `beocreate` client/server message contract, with routing and reconnect characterization tests, without enabling additional hardware-dependent extensions.

Do not begin dependency modernization until that contract is protected.

## Questions requiring HiFiBerryOS or physical hardware

* Which Node.js version and global modules ship in the target image?
* Which SigmaTCP reads and deployment operations can be verified reliably?
* What mute state and GPIO polarity are maintained through disconnect, reset and failure?
* What survives interrupted DSP installation and power loss?
* Which extension startup assumptions differ on current supported board revisions?

## Deferred

The root `README.md` update remains deferred until development setup, runtime support and maturity claims are sufficiently verified. Future hardware remains outside the roadmap.
