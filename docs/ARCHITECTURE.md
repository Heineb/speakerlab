# SpeakerLab Architecture Baseline

## Browser acceptance boundary

The UI acceptance boundary is the assembled existing browser application served by `scripts/start-local-server.js`, not a replacement UI and not Electron. Playwright drives Chromium against a loopback-only instance with per-test temporary state and the current-Beocreate DSP simulator. Tests interact with visible setup, routing, crossover and configuration controls, while lower-level Node/VM suites continue to own model edge cases and protocol permutations.

The boundary deliberately includes generated script order, extension registration, static assets, CSS visibility, browser/WebSocket lifecycle and the configuration HTTP routes. It excludes host services and physical audio behavior. A local-development-only `dsp-programs` seam acknowledges fallback-program installation according to simulated connection state so the unchanged speaker-profile setup workflow can complete without loading the hardware-dependent production extension.

## Status and scope

This document records the established Beocreate architecture and its incremental SpeakerLab development seams. It describes the existing product; it does not propose future-hardware support or a generic DSP abstraction.

## Repository and deployed layout

The repository contains three JavaScript applications/libraries:

| Area | Repository entry point | Role |
| --- | --- | --- |
| Beocreate 2 server | `Beocreate2/beo-system/beo-server.js` | HTTP/WebSocket server, settings broker, extension loader, assembled browser UI and process lifecycle |
| Beocreate Essentials | `beocreate_essentials/beocreate_essentials.js` | Shared communication, SigmaDSP, networking and Raspberry Pi system helpers |
| Beocreate Connect | `BeocreateConnect/start.js` -> `main.js` | Electron desktop discovery/launcher and unfinished SD-card workflow |

The checked-out layout is not directly runnable as the deployed layout. Server and extension imports expect `beocreate_essentials` at `/opt/beocreate/beocreate_essentials`, adjacent to `beo-system` and `beo-extensions`. In this checkout it is repository-root `beocreate_essentials`, not `Beocreate2/beocreate_essentials`. `beocreate2.service` confirms the deployed root `/opt/beocreate` and starts `/usr/bin/node /opt/beocreate/beo-system/beo-server.js` as root after `sigmatcp.service`.

No repository script constructs that deployed tree. The README delegates system creation to HiFiBerryOS/Buildroot.

## Processes and runtime entry points

### Beocreate 2 server

`beo-server.js`:

1. Adds `/usr/lib/node_modules` to `NODE_PATH`, matching Buildroot global modules.
2. Reads `/etc/beocreate/system.json` and `/etc/beocreate/ui.json`, layered over defaults.
3. Creates a global `beo` service object and shared EventEmitter3 bus.
4. Loads server-side extensions synchronously.
5. Listens on configured HTTP port (default 80), serves static assets, assembles the browser UI, accepts a broad extension REST route and starts WebSocket protocol `beocreate` on the same server.
6. Delivers settings and broadcasts `general/startup`.
7. On SIGINT/SIGTERM, allows registered extensions up to five seconds, flushes queued settings, closes WebSocket/HTTP, and optionally invokes Raspberry Pi reboot/shutdown.

Command-line flags are `v`, `vv`, `vvv` (logging), `d` (daemon restart support), `dev` (disable UI etags), `q` (quiet startup) and `beosounds`.

### Browser client

The default view is `Beocreate2/beo-views/default/index.html`. At request time the server reads its `manifest.json`, discovers extension `menu.html`, client JavaScript and CSS, substitutes them into the view, and injects extension/navigation metadata. Client messages use targeted `{target, header, content}` objects over the WebSocket; server messages are broadcast by `communication.js`.

### Beocreate Connect

Electron 9.4.0 is declared as a development dependency. `npm start` runs `electron .`, which loads `start.js`, then `main.js` in normal Electron mode. It opens a Node-integrated renderer (`nodeIntegration: true`), discovers `_beocreate._tcp` services with `dnssd2`, falls back to HTTP discovery at `10.0.0.1`, and embeds the selected product UI. It also lists drives for an SD-card screen.

`start.js` references a missing `writer.js` when `ELECTRON_RUN_AS_NODE` is set. The image-writing dependencies and UI remain in the manifest, but no current main-process writer implementation exists in the checkout.

## Runtime and package assumptions

- `.nvmrc` and `.node-version` select Node.js 24 for supported repository and isolated-server development. GitHub Actions verifies that runtime on Ubuntu and macOS.
- The server service assumes `/usr/bin/node`, Linux, root privileges, systemd, HiFiBerryOS paths and globally installed modules.
- The server package records npm 11.6.2 and has an npm lockfile version 3. Beocreate Connect retains its separate legacy lockfile and runtime.
- The only committed lockfiles cover `Beocreate2/beo-system`, Beocreate Connect, and selected extensions. `beocreate_essentials` and many extensions have manifests but no lockfile.
- `npm ci --prefix Beocreate2/beo-system` reproducibly installs the server-owned dependency tree on Apple Silicon and in the Ubuntu/macOS CI matrix. It does not install the global `websocket` and `dnssd2` modules or reproduce the HiFiBerryOS image.
- Node.js 24.18.0 with npm 11.6.2 is verified for the isolated local server and repository suite. The deployed appliance's `/usr/bin/node` version is not recorded in this repository, so Node.js 24 is not claimed as the production HiFiBerryOS runtime.
- Electron 9.4.0 defines the desktop runtime; the repository does not state a compatible host Node version for installation/building.

The server-owned direct packages are Express (HTTP/static/REST handling), EventEmitter3 (the shared extension bus), Underscore (utility use in DSP-program metadata handling) and `aplay` (startup audio playback). Express 4.22.2, EventEmitter3 5.0.4 and Underscore 1.13.8 are pure JavaScript and form the first controlled modernisation wave. `aplay` remains at 1.2.0 because it invokes platform audio and is bypassed by quiet local startup. The resulting 71-package dependency tree contains no native binding, `binding.gyp`, or install lifecycle script.

Express remains on major 4. Express 5 routing/API migration is deferred. Production-global modules, optional extension packages, DSPToolkit, SigmaTCP, GPIO, discovery, Linux networking and Electron dependencies are outside this server wave.

## Extension architecture

System extensions live in `Beocreate2/beo-extensions`; persistent user extensions are expected in `/etc/beocreate/beo-extensions`. A user extension replaces a same-named system extension only when `system.json` sets `preferUserExtensions`. `enabledExtensions` is an allow-list and `disabledExtensions` a deny-list.

`package.json` metadata may filter an extension by card type or required/rejected card features. Server-side code resolves the extension directory as a Node module (normally `index.js`). UI discovery is independent: an extension can have only markup. The default appearance selects filename patterns in its manifest.

Extensions communicate through the global `beo.bus`, call explicitly exported functions through `beo.extensions`, use global helpers for settings/UI/downloads, and may register Express routes. There is no isolation or permission boundary: an extension can observe or emit any bus channel and runs with the root server's authority.

## Signal-flow routing design

The `signal-flow` extension adds a design-only boundary alongside, not inside, the legacy live `channels` controls. Current repository evidence defines Left, Right and Mono logical inputs and four outputs (`a` through `d`). The UI presents stable `output-a` through `output-d` identities as ordinary output cards with labels, driver roles, side/position, enabled state and one optional input.

The authoritative model is `org.speakerlab.signal-flow`, version 1, stored as `signal-flow.json` below `beo.dataDirectory`. Production therefore uses `/etc/beocreate/signal-flow.json`; local development uses isolated runtime state. The default disables and unroutes all four outputs. It neither infers a loudspeaker topology nor imports the existing live `channels.json`.

The same atomic design contains a nested `org.speakerlab.crossover`, version 1. Each known output has human-readable high-pass and low-pass parameters: enabled state, Butterworth or Linkwitz–Riley family, slope in dB/octave and cutoff in Hz. Existing routing-v1 files without this section remain readable and receive disabled-filter defaults in memory; legacy `equaliser.json` and speaker presets are not migrated or overwritten.

It also contains `org.speakerlab.channel-processing`, version 1, with gain in dB, delay in milliseconds and an explicit polarity-inverted boolean for every current output. The server capability is −60 to +6 dB and 0–2,000 samples at 48 kHz, derived from the shipped current Beocreate universal DSP metadata. Milliseconds are authoritative; sample counts and distance at 343 m/s are derived display values. Existing routing-v1 files without this section receive neutral in-memory defaults and are changed only by a deliberate save.

The same design now contains `org.speakerlab.driver-protection`, version 1. Per output it keeps user-entered driver, amplifier and electrical-limit metadata plus a peak-voltage limiter design, visible safety margin, attack and release. Pure calculations derive sine-wave RMS/peak/power relationships and combine channel gain with the existing crossover/EQ grid. Existing files without this section receive disabled defaults in memory. The current-Beocreate target has no verified per-output limiter mapping, so compiler operations are simulator-only diagnostics and can never become physical writes. See `DRIVER_PROTECTION.md` and ADR 0014.

`crossover-model.js` is a pure design boundary. It derives finite first/second-order digital sections, cascades their complex responses and produces deterministic logarithmic electrical-response points. The 48 kHz capability comes from the shipped current Beocreate universal DSP XML; accepted frequencies are 10–20,000 Hz and always below Nyquist. Butterworth supports orders 1–4. Linkwitz–Riley supports only defined order 2 and 4 constructions, at −6.0206 dB at cutoff.

Pure model validation separates blocking structural/capability errors from advisory design warnings. Canonical serialization fixes property order and excludes transient UI state. A SHA-256 content revision provides optimistic concurrency. Save validates the complete draft, checks the edited revision, writes with the existing atomic JSON writer, reads back, revalidates and verifies the revision. A failed save attempts to preserve the previous valid file.

Messages use the existing `signal-flow` extension target and ordinary WebSocket envelope. The server owns capabilities, format, validation, revision and persistence. The browser keeps only an in-memory draft and preserves it through disconnection or revision conflict.

Crossover response and independent crossover/processing draft copy and per-output reset use the same envelope. Preview responses are server-authoritative and carry no deployment claim. A save validates routing, crossover and channel processing together, derives every enabled filter, atomically replaces the complete file, reads it back and verifies the same content revision.

`signal-flow.json` is a safe central-settings file, so configuration backup, preview, last-known-good capture, restore and rollback include it without changing backup schema v1. Export and import validation reject invalid routing and unsupported routing versions before preview or restore. The service rereads the file for each state request, allowing the editor to show a restored design without applying it to the DSP.

Saved routing is never described as active DSP state. Local connected/disconnected simulation is reported as context, while deployment status remains `not-deployed`. No SigmaTCP, DSPToolkit, live channel, preset or audible path is changed.

## Safe DSP design compilation

`dsp-target-capability.js` records only the repository-shipped Beocreate Universal v10 identity and metadata mappings. `dsp-design-compiler.js` derives versioned, deterministic operations from the canonical saved design; the design remains authoritative and the plan is process-local diagnostic state. Compilation fails closed on stale revision or untrusted program identity.

Protection compilation preserves configured/derived values, unknown mapping confidence, unavailable physical readback and exact blockers. A normalized simulator operation is available only with an entered amplifier peak-voltage reference; it has a string diagnostic target and `physicalWriteAllowed: false`.

The operation sequence is safe-state entry, routing, complete IIR banks, gain, delay, polarity, verification and deferred safe-state exit. `dsp-plan-simulator.js` applies this sequence only in local development, provides normalized readback and permits simulated unmute only after a complete match. Production-like runtime exposes preview-only unavailable identity and no application path. Details and unresolved mappings are in `CURRENT_BEOCREATE_DSP_MAPPING.md` and ADR 0010.

## Settings and configuration storage

The central settings convention is one unversioned JSON file per extension at `/etc/beocreate/<extension>.json`. `getSettings` returns `null` for missing, empty or invalid files and logs parse errors. Extensions merge their own defaults. The existing read, immediate-write, delayed-write and flush mechanics are isolated in `settings-store.js` so they can be characterized without starting the server.

Central saves serialize with compact `JSON.stringify` and persist synchronously through `atomic-json-file.js`, either immediately or queued by extension behind one global ten-second timer. The complete JSON is written to an exclusively created temporary file beside the target, given the existing target mode (or `0666` filtered by `umask` for a new file), synced, closed and atomically renamed over the target. The containing directory is then synced where supported. Errors before rename preserve the previous target; a directory-sync error is reported after the valid replacement is already visible. Unique stale temporary files are ignored and never restored automatically.

Every delayed request resets the timer, including requests for different extensions. Queued values are object references rather than snapshots. Immediate saves neither clear nor replace a queued value. A successful flush writes every pending extension synchronously and then clears the queue; it does not cancel the timer. Serialization and filesystem failures propagate without broker callbacks or failure logging and abort a flush before the queue is cleared.

Graceful shutdown flushes only after extension shutdown coordination and WebSocket closure, before HTTP closure and process exit/power control. The synchronous flush waits for each atomic write it reaches, and repeated flush calls after success are harmless. Abrupt termination or a failure earlier in the shutdown sequence can still lose queued in-memory state. A flush failure retains the queue but interrupts the existing shutdown callback.

Central broker writes are atomic at rename, but ordinary saves are not schema-validated or read back. Configuration restore now creates a verified immediate pre-restore last-known-good snapshot, described below; ordinary settings changes do not create snapshot history. File and directory syncing improves durability but cannot guarantee a particular result across every filesystem or physical power loss. The target filename is still built by direct extension-name concatenation. `configure.js` edits the same files independently and remains non-atomic.

JSON-backed writes also bypass the central broker: Beosonic user modes, room-compensation measurements/presets, ALSA loop and Squeezelite configuration, MPD cache data and speaker-preset migration/upload paths perform their own synchronous writes or moves. Several extensions also write non-JSON service configuration under `/etc`. These paths differ in directory creation, in-memory mutation, error handling and follow-up events and are not unified by the central seam.

Additional configuration is spread across `/etc` and HiFiBerryOS helpers, including SigmaTCP, AudioControl, network, service and source configuration. This is outside the central settings broker and is important for future complete configuration backup.

## Configuration backup and restore

`configuration-backup.js` implements the versioned `org.speakerlab.configuration-backup` JSON format for the current Beocreate platform. It collects safe top-level central settings plus user speaker presets and listening modes. Items are sorted by filename and retain their existing parsed JSON payloads. SHA-256 checksums cover each payload, each section and the complete backup wrapper.

The collector excludes credential-bearing or machine-specific categories, hidden/temporary files, symlinks, non-JSON resources and known service/DSP/update state. A recursive sensitive-key check excludes a complete file when it encounters password, passphrase, credential, secret, token, private-key or API-key fields. Malformed or unreadable in-scope files fail the export rather than producing an unreported partial backup.

System Tools registers four REST routes:

| Method | Route | Contract |
| --- | --- | --- |
| `GET` | `/hifiberry-system-tools/configuration-backup/capabilities` | Format, version, 5 MiB limit, sections and current restore state |
| `GET` | `/hifiberry-system-tools/configuration-backup/export` | Validated JSON download assembled in memory |
| `POST` | `/hifiberry-system-tools/configuration-backup/preview` | Parse, validate and return metadata, change plan, warnings and single-use token |
| `POST` | `/hifiberry-system-tools/configuration-backup/restore` | Confirm with the preview token, apply synchronously, verify and report rollback |

The endpoints use the existing unauthenticated local-product trust model. They accept no filesystem path. Section names map to fixed data-directory paths, item names must be safe `.json` basenames, and request bodies are limited to 5 MiB.

Before restore, the settings coordinator synchronously flushes pending saves, cancels the shared timer and rejects ordinary saves until the operation finishes. A second restore is rejected. The service validates and atomically stores the current in-scope configuration as `.speakerlab-last-known-good.json`, stages target/rollback values in memory, then atomically writes and verifies each changed file. On failure it rolls every attempted item back in reverse order and verifies the rollback. Items absent from the backup are left unchanged; no implicit deletion occurs.

Measurement merge sources, derived points, source hashes and versioned recipes are all nested in the one `signal-flow.json` backup item. Export and restore validation traverse that complete dependency graph: a missing source or corrupt derived point hash rejects the item, while an intact but stale source relationship remains readable and visibly requires recomputation. Restore preview reports `settings/signal-flow.json` as changed when a merge recipe/result differs. The existing item-level transaction and rollback therefore restore the prior sources, recipe and derived result together rather than applying a partial merge.

This is a best-effort multi-file transaction, not filesystem-wide atomicity. Process or power loss between replacements, rollback deletion of newly created files and independent cross-process writers remain limitations. Restored files are not applied to extension memory or the DSP; the UI reports that a restart is required.

## Presets and identities

There are two distinct preset families:

- Speaker presets: system JSON in `Beocreate2/beo-speaker-presets`; user JSON in `/etc/beocreate/beo-speaker-presets`. The `speaker-preset` extension loads system files first, then user files without replacing an already known ID. It preflights sections by calling each named extension's `checkSettings`, applies them through `applySpeakerPreset`, optionally installs a fallback DSP program, and only then records `selectedSpeakerPreset`. Writes/moves/deletes are synchronous and unversioned.
- Beosonic listening modes: system JSON in `Beocreate2/beo-listening-modes`; user JSON in `/etc/beocreate/beo-listening-modes`. The `beosonic` extension combines both lists and lets user files be renamed/deleted.

Both identities come from the filename with its final extension removed, not the display name. Neither discovery path filters directory entries or sorts `readdirSync` output. Speaker presets keep the first accepted identity, giving system files precedence; listening modes assign unconditionally, giving a same-named user file precedence while retaining the key's original insertion position. Missing directories throw, individual read/parse failures are skipped, and repeated discovery retains stale module-level identities. Speaker identities are not refreshed on repeat discovery, whereas existing listening-mode identities are refreshed. These extension-specific routines are isolated in adjacent `preset-discovery.js` modules for hardware-free characterization; directory creation, startup events, writes and resource application remain in the extensions.

Product identities similarly combine system data and `/etc/beocreate/beo-product-identities`, and may be embedded in speaker presets. Room-compensation measurements/presets have their own `/etc/beocreate/beo-room-compensation` tree.

Preset application can change routing, gain, delay, polarity and filters. It has compatibility checks but no transaction, readback, all-or-nothing rollback or last-known-good snapshot. A partial exception or DSP disconnect can therefore leave mixed state.

## DSP communication path

## Parametric EQ design boundary

Signal Flow owns a nested `parametricEQ` v1 value alongside routing, crossover and channel processing. `parametric-eq-model.js` is the pure authority for capabilities, normalization, validation, RBJ coefficient design, stability, response, headroom estimation and deterministic band operations. `routing-service.js` validates and persists the complete design atomically; there is no independent EQ file.

The browser stores only transient selection and server-returned response points. The server calculates the combined crossover + EQ response. Enabled bands compile after crossover sections into the same 16-section current-Beocreate IIR bank. Compiler operations retain `parametricEQ.<band-id>` and the stable `bandId`, use signed 5.23 quantization and support simulator readback/mismatch reporting. The legacy `equaliser` extension, `equaliser.json` and speaker-preset EQ remain separate and unchanged.

This is a current-Beocreate design/simulator boundary, not a generic hardware abstraction. Repository mapping evidence remains insufficient for physical Apply.

The current path is:

`browser control -> WebSocket/REST -> extension bus handler -> extension -> beocreate_essentials/dsp.js -> SigmaTCP server at 127.0.1.1:8086 -> Beocreate SigmaDSP hardware`

DSP-aware extensions (`dsp-programs`, `equaliser`, `channels`, `sound`, `beosonic`, `toslink`, `volume-limit` and others) import the same cached `dsp.js` module directly. `dsp.js` owns a `net.Socket`, creates 14-byte SigmaTCP read/write messages, converts 8.24 fixed-point values, queues reads and retries a closed connection up to ten times. Disconnected writes return `false`; many callers do not inspect that result.

Program management is split across the socket and command-line tools. `dsp.js` invokes `dsptoolkit` for install/store/check/reset. `dsp-programs` invokes `dsptoolkit get-xml`, reads/writes `/etc/sigmatcp.conf`, restarts `sigmatcp.service`, controls amplifier mute through `pigs` GPIO commands, and can run `/opt/hifiberry/bin/reconfigure-players`.

At startup, `dsp-programs` mutes the amplifier while obtaining checksum/metadata. It can use stored metadata when XML is unavailable and optionally keep unknown programs muted. Connection errors and a five-second checksum timeout are logged and sent to the UI. There is no general write acknowledgement/readback contract, deployment transaction or automatic rollback.

## Smallest simulated-hardware boundary

The smallest useful boundary is the existing transport operations consumed by current extensions: connect/disconnect/state, register read/write, safeload batches, checksum/XML, EEPROM/profile install, store, reset and their success/disconnect/timeout/error outcomes. The first implementation should allow the current `dsp.js` dependency to be substituted or have its socket/command execution injected while preserving its exported API and current Beocreate protocol semantics.

It must model only the existing Beocreate SigmaTCP/DSPToolkit behaviour. GPIO mute and systemd/service operations should be separate fakes because they are OS integration, not the DSP register transport.

### Characterized physical-transport boundary

`signal-flow/sigmatcp-protocol.js` isolates the source-derived 14-byte request layout and a strongly evidenced response layout without changing production `dsp.js`. Its incremental parser bounds memory, retains split frames, emits coalesced frames and rejects malformed length or command state deterministically.

`sigmatcp-transport-simulator.js` models the required future positional single-outstanding read contract with per-socket generations, exactly-once completion, timeout/queue cleanup and stale-response rejection. Write completion is explicitly transported-only and unacknowledged. `dsp-physical-readiness.js` owns the current-Beocreate mapping/recovery matrix used by the compiler and Deployment Preview. None of these boundaries can issue physical writes.

`beocreate-readonly-evidence.js` is a separate current-Beocreate-only observation boundary. It exposes named allowlisted checksum and mapped-parameter operations, not a generic transport API. Before serialization it rejects ambiguous, unknown and non-read intent; after serialization it checks the exact command and header shape. Live capture is an explicit CLI action, never production startup or CI behavior. Captures separate raw responses from interpretations and require a separate `beocreate-evidence-review.js` conclusion. Repository-backed fixtures cannot promote physical confidence.

## Isolated local-development runtime

`npm run dev` invokes `scripts/start-local-server.js`. The launcher prepares the existing linked deployment shape below `.speakerlab-local/runtime/layout`, uses `.speakerlab-local/runtime/state` instead of `/etc/beocreate`, selects an ephemeral port by default and binds only `127.0.0.1`. A caller may choose another workspace/temporary runtime root, fixed port, and deterministic connected or disconnected DSP state.

The explicit `SPEAKERLAB_LOCAL_DEVELOPMENT=1` environment switch is the only path that changes server startup. Without it, the production defaults remain `/etc/beocreate`, port 80, the deployed global module path, the real communication module and real hardware integrations. Local mode deletes `runAtStart`, ignores power/restart commands, suppresses System Tools activation metrics and never starts Bonjour.

Local startup uses an allow-list of extensions whose module evaluation and startup handlers do not invoke the audited HiFiBerryOS/hardware dependencies. Every remaining extension is classified in `scripts/local-development-runtime.js` with the concrete reason it is disabled. UI discovery uses the same extension policy, so server and client assembly remain aligned. The list is intentionally specific to the current Beocreate product.

Product Information is enabled locally because Speaker Preset owns a real optional client integration with its `product_information` object and uses its identity preview processor. The existing extension remains the owner on both client and server. Under the explicit local switch, its server startup does not query or rename the host, read deployed HiFiBerryOS identity, advertise Bonjour or change the simulated product model. It instead reports the fixed identity `SpeakerLab Local Simulator` with system ID `speakerlab-local`, while still reading the repository's shipped product-identity files for speaker-profile previews. Outside local mode, the established Raspberry Pi and HiFiBerryOS behavior is unchanged.

Extension `menu.html` files may declare multiple active extension-local scripts with `src="€/..."`. These declarations are the ordered client dependency contract: UI assembly removes the tags from the menu markup, validates that each target exists, and emits each URL once in declaration order. When a menu has no explicit declarations, the existing appearance-manifest `€-client` discovery remains the compatibility fallback. Commented script tags are not declarations.

Browser helpers that are consumed by another extension script use explicit, idempotent `window` properties. The configuration backup state is `window.speakerlabConfigurationUI`; the Signal Flow state model is `window.signalFlowUIState`. Their client scripts receive those objects at initialization and reuse an already-created public extension object on repeated evaluation. This preserves the established global client architecture without relying on implicit globals or introducing a bundler.

Some locally enabled menu screens retain deployed `data-context` values whose parent extension is deliberately disabled because it invokes platform services. Menu preparation assigns `parentMenu` only when the named destination exists and the item was placed there. Otherwise the enabled screen remains navigable as a top-level screen. Navigation rejects unknown screens or invalid parent metadata with a development error instead of dereferencing missing extension state.

`beocreate_essentials/dsp-simulator.js` implements the existing exported `dsp.js` surface used by enabled extensions. The server substitutes it in Node's module cache only after the explicit local switch is active and before extensions load. It models connected/disconnected state, register and safeload operations, metadata availability, install/store/reset outcomes, deterministic errors/timeouts/malformed responses, reconnect and mute/restart state. It does not introduce a generic hardware API and does not open a SigmaTCP socket or execute DSPToolkit.

The deployed WebSocket implementation depends on globally supplied `websocket` and `dnssd2` packages absent from the locked server package. Local mode uses `communication-local.js` plus the zero-dependency `websocket-server.js`. It attaches to the existing HTTP server's upgrade event, requires WebSocket version 13 and subprotocol `beocreate`, accepts the root path used by the browser and deliberately performs no Bonjour discovery.

### Existing Beocreate WebSocket contract

The browser derives the socket host from `window.location.host`, selects `ws` or `wss` from the page protocol and connects without an explicit path:

`ws://<same-host>/` with subprotocol `beocreate`

Both directions use UTF-8 JSON objects:

```json
{
  "target": "extension-identifier",
  "header": "message-name",
  "content": {}
}
```

`content` is optional. There is no protocol version, request ID, response correlation, acknowledgement or standard error envelope. Client messages become an event on the bus channel named by `target`; `header` and optional `content` are preserved. Unknown targets or headers normally have no listener and are ignored. Extension/server messages are broadcasts unless `communication.send` receives a connection ID or one of the legacy protocol names as its restriction.

On a socket open the server assigns an increasing process-local connection ID and broadcasts `general/connected` internally. The production contract sends no universal initial-state bundle: the client emits its own `general/connection` DOM event on open, then requests setup or extension state as screens activate. In local mode only, the server sends the newly connected client the already established `dsp-programs/status` envelope with simulated connected/responding state. A `general/activatedExtension` client message continues to trigger existing extension state providers; for System Tools this returns `configurationBackupCapabilities`.

The browser reconnects immediately after losing a previously open socket. Failed initial attempts retry after five seconds, up to five times. Arbitrary in-flight requests are not retained. A reconnect gets a new server connection ID and providers are queried again through the same activation/state messages. No application heartbeat or idle timeout exists; WebSocket ping frames receive the protocol-required pong without adding application state.

The local transport preserves message ordering per socket, supports fragmented text, and limits one assembled message to 1 MiB. Malformed JSON and synchronous handler exceptions are logged without stopping the server; repeated invalid-message logging is capped per connection. Binary messages close with 1003, oversized messages with 1009, and invalid protocol data with an appropriate WebSocket close code. The browser client now catches malformed server JSON and continues processing later messages.

During local shutdown active sockets receive close code 1001 before the isolated server exits. Production continues using the original communication module and shutdown path.

Configuration backup/restore intentionally remains split across transports. WebSocket connection state controls UI availability and activation delivers capabilities; JSON download, upload/preview and confirmed restore use the existing constrained HTTP routes. No backup payload is moved into WebSocket messages.

## Measurement import boundary

Signal Flow owns the versioned `org.speakerlab.measurements` model inside `signal-flow.json`. Pure parsing and validation live in `measurement-model.js`; the service owns bounded preview tokens, draft operations, assignment and electrical-overlay data. Normalized source points are authoritative. Graph state and derived electrical curves are not persisted, and the DSP compiler ignores measurements.

Keeping bounded measurement data in the complete design reuses optimistic revision checking, atomic write/readback, rollback and portable configuration backup. See ADR 0012 and `docs/MEASUREMENT_IMPORT.md` for formats, normalization and limits.

Derived nearfield/farfield responses use the same measurement collection but carry a versioned merge recipe and source ID/hash dependency edges. `measurement-merge-model.js` owns overlap, alignment suggestion, log-frequency interpolation, phase-compatibility summary and raised-cosine blending. The service regenerates recipe and derived payload together. Missing sources invalidate the dependency graph; changed hashes are exposed as stale until recomputation. DSP compilation has no measurement or merge operation. See ADR 0013 and `docs/MEASUREMENT_MERGE.md`.

`eq-suggestion-model.js` is a pure transient analysis boundary over those measurements plus the current output, crossover, ordinary PEQ and protection context. It owns the deterministic grid, smoothing, target, candidate/objective policy, null restraint and prediction. The service retains bounded analyses only long enough to validate source hash, unchanged draft and saved revision during acceptance. Selected suggestions then become standard `parametricEQ` bands; no suggestion collection is serialized. The browser integrates this contextually inside Parametric EQ and keeps numerical controls under `Advanced`. See ADR 0015 and `docs/ASSISTED_EQ.md`.

`phase-alignment-model.js` is the pure transient two-measurement alignment boundary. It validates explicit timing-reference compatibility and crossover overlap, unwraps copied phase points, fits relative delay across a log grid and predicts complex summation after current crossover, PEQ, gain, delay and polarity. The service retains an analysis only for source-hash, unchanged-draft and saved-revision validation. Acceptance writes only standard `channelProcessing` delay and polarity draft fields; no analysis state is serialized and DSP compilation continues to ignore measurements. See ADR 0016 and `docs/PHASE_ALIGNMENT.md`.

`assisted-crossover-model.js` is the pure transient two-way crossover-design boundary. It reuses phase-alignment interpolation, unwrap and robust timing fit; evaluates only existing crossover-model filters; includes current PEQ/gain/delay/polarity; and produces no more than three deduplicated candidates. Complex phase-aware and magnitude-only power-sum modes are separate contracts. The service applies the same source-hash, unchanged-draft and saved-revision guards before converting an accepted candidate to ordinary crossover and optional processing draft fields. Nothing new is serialized or compiled for DSP. See ADR 0017 and `docs/ASSISTED_CROSSOVER.md`.

## Speaker Design presentation boundary

UI Workflow Consolidation v1 changes presentation, not the versioned Signal Flow storage or server contracts. The `signal-flow` extension is labelled **Speaker Design** and exposes local Design, Measurements and Review views over the same `routing-ui-state` draft. Output selection, accordion state, workspace selection and Advanced disclosure state are transient browser presentation state.

`routing-ui-state.designReview` derives speaker-wide counts and Saved/Unsaved/Error, Simulated and Blocked labels from the ordinary draft, validation and runtime state. It is never serialized. Measurement contextual actions retain the selected measurement only as transient assistant input; accepted results continue to become ordinary crossover, channel-processing or PEQ fields through existing guarded service messages. See ADR 0018 and `docs/DESIGN_WORKFLOW.md`.

## Hardware- and OS-dependent modules

Beyond DSP, direct dependencies include Raspberry Pi `/proc/cpuinfo`, `raspi-config`, hostname/hosts files, wireless-tools and `wpa_cli`, fixed `wlan0`/`eth0`, systemd services, ALSA tools, AudioControl, Bluetooth, serial ports, GPIO, MPD, Shairport, room-measurement helpers and various `/opt/hifiberry/bin` programs. These prevent whole-server execution on a development Mac unless extensions and filesystem/process dependencies are controlled.

## Errors, recovery and logging

Logging is unstructured `console.log/error/warn`; the systemd unit routes stdout/stderr to syslog under `beocreate2`. Verbosity is global but extensions apply it inconsistently. There is no correlation ID, persistent application log managed by the app, or redaction policy.

The server catches individual extension-load failures and continues. Invalid settings/presets are skipped or become `null`. HTTP port collision triggers graceful shutdown; other HTTP errors are only logged. Settings are flushed on handled signals, but there is no `uncaughtException`/`unhandledRejection` recovery. Hardware helpers vary between returning false, callbacks, logging and throwing. Recovery is therefore local and inconsistent.

## Security and compatibility observations

- The server normally runs as root and exposes unauthenticated HTTP, WebSocket and extension REST routes on port 80.
- Upload routing accepts client-provided filenames and an optional path header; this needs security characterization before reuse.
- Electron enables renderer Node integration and uses the obsolete `new-window` event model.
- Global variables are created extensively by omitted declarations, making modules order- and concurrency-sensitive.
- Current code uses callbacks, synchronous filesystem/process operations and deprecated packages/APIs, but these are modernization inputs, not reasons for a rewrite.
