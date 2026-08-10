# SpeakerLab Testing Baseline

## Real-browser UI acceptance

The repository uses `@playwright/test` 1.62 with Chromium for a narrow real-browser acceptance layer. The package requires Node.js 20 or newer; SpeakerLab develops and runs CI on the repository-pinned Node.js 24. Install the committed root dependencies and browser once:

```sh
npm ci
npx playwright install chromium
```

Linux CI uses `npx playwright install --with-deps chromium`. Run all journeys or a focused group with:

```sh
npm run test:ui-acceptance
npm run test:setup-acceptance
npm run test:signal-flow-acceptance
npm run test:crossover-acceptance
npm run test:channel-processing-acceptance
npm run test:accessibility-smoke
npm run test:dsp-compilation-acceptance
npm run test:dsp-deployment-accessibility
npm run test:backup-restore-acceptance
npm run test:reconnect-acceptance
```

`npm run verify` includes the complete browser suite after the existing Node tests and syntax check. Each test starts the existing local server on an isolated loopback port with a fresh temporary runtime and simulated current-Beocreate DSP; no real configuration, external network, root privilege, HiFiBerryOS service or hardware is used.

The journeys cover first-run `Other Speaker` and named Beovox setup, configured refresh/restart, responsive setup at desktop/tablet/mobile widths, all locally enabled menu screens, two-way stereo routing, validation, Crossover filter editing/copy/preview/persistence, gain/delay/polarity editing/copy/reset/persistence, explicit disconnected state, clean and conflicting reconnect, configuration download/preview/restore and visible rollback-success feedback. Unexpected page exceptions, console errors, request failures, HTTP 5xx and non-favicon 404s fail tests. Expected WebSocket/static-loader interruption during a deliberate restart and Chromium's successful-download `ERR_ABORTED` are narrowly classified.

Playwright retains a screenshot, trace and video on failure. The fixture additionally attaches the viewport and document width, focused element, Deployment Preview ARIA snapshot, browser diagnostics when present, and local-server stdout/stderr. These diagnostic attachments and server logs are retained only on failure. CI uploads `playwright-report/` and `test-results/` on failure.

Deployment workflow keyboard tests activate the real buttons with Enter and use Tab between controls. If an asynchronous action has not yet enabled its next control, the UI retains the requested focus destination and transfers focus when that control becomes available; tests assert the observable accessible button focus instead of relying on fixed tab counts or CSS hierarchy. This suite does not cover every production extension, Electron, real DSP deployment, acoustic or audible results, GPIO, systemd, SigmaTCP framing, or hardware recovery. Complete keyboard-only traversal, manual screen-reader testing and comprehensive visual-regression snapshots remain future focused work.

## Current state

The repository now has zero-dependency automated tests for the workspace-local Beocreate deployment layout, central settings-file loading/default merging and portable repository-wide JavaScript syntax verification. A minimal GitHub Actions workflow runs these checks on Ubuntu and macOS. There is still no general application test framework, linter, formatter, type checker or coverage configuration.

Most package manifests contain npm's placeholder `test` script, which deliberately exits 1. Beocreate Connect has no `test` script. Files named `*-test.js`, `networktest.js` and `dsp-test.js` are manual experiments, not assertions run by a framework. The committed `@serialport/binding-mock` is a transitive package and is not a SpeakerLab hardware simulator.

## Local deployed-layout tests

Create a gitignored workspace-local representation of `/opt/beocreate`:

```sh
node scripts/prepare-local-beocreate-layout.js .speakerlab-local
```

The resulting server path is `.speakerlab-local/opt/beocreate/beo-system`. The script locates the repository from its own checked-in location, creates relative symbolic links, accepts an existing correct layout, and refuses unexpected managed paths. Any caller-provided destination may be used; the script writes only below that destination.

Run the repository-level tests:

```sh
npm test
```

The equivalent explicit command is:

```sh
npm run test:local-layout
```

The harness uses only Node built-ins: `assert`, `crypto`, `fs`, `os`, `path` and `child_process`. It intentionally avoids selecting a durable project-wide test framework before M1. Node 14.14 or later is required because cleanup uses `fs.rmSync`; the other used APIs are available by that release. It was verified on Node 26.4.0. No npm install is required because the root manifest declares no dependencies.

The ten tests cover fresh creation, expected links, deployed-relative `beocreate_essentials` resolution, idempotence, representative source/lockfile hashes, destination isolation, missing source content, conflicting destination content, spaces in paths and operation without network/hardware/root privileges.

The local-layout command does not start the server, load extensions, access `/etc` or `/opt`, contact SigmaTCP/DSP hardware, validate HiFiBerryOS services, test application behaviour, lint the repository or package Electron.

## Isolated local server and DSP simulator

Start local mode with:

```sh
npm run dev
```

On a clean checkout, the launcher detects missing server modules and runs `npm ci --prefix Beocreate2/beo-system` against the existing committed lockfile. No dependency version or lockfile update is performed. The first clean run needs registry access unless npm already has the packages cached; subsequent startup itself has no external-network requirement.

The default selects an ephemeral loopback port and connected simulated DSP. Options are:

```sh
npm run dev -- --runtime-root "/tmp/SpeakerLab state" --port 8080 --dsp-state connected
npm run dev -- --dsp-state disconnected
```

The launcher logs the runtime root, isolated state directory, linked deployed layout, DSP mode, enabled extensions, disabled extensions and final HTTP URL. `SIGINT` and `SIGTERM` are forwarded to the server's existing graceful shutdown sequence.

Run the focused suites:

```sh
npm run test:local-server
npm run test:dsp-simulator
```

The local-server tests use Node built-ins plus the already installed locked server runtime dependencies. They prepare temporary directories (including spaces), validate loopback and input policy, require an explicit classification for every extension, start the existing server/UI in connected and disconnected modes, fetch the assembled UI, assert the local-mode marker and terminate cleanly. They do not access real `/etc`, `/opt`, SigmaTCP, hardware, systemd, GPIO or external networks.

The DSP suite calls the same method names and callback shapes currently consumed from `dsp.js`. It covers single/multi register reads, parameter/register writes, safeload, checksum/XML present and unavailable, profile/store/reset success, deterministic errors, non-callback timeouts, malformed data, disconnect/reconnect, restart and mute state. The simulator does not validate SigmaTCP byte framing, timing accuracy, GPIO behavior or audible output.

Local mode does not load the deployed global `websocket`/`dnssd2` packages or advertise Bonjour. It now provides the existing browser WebSocket application contract through a zero-dependency loopback transport.

## Client extension initialization and setup navigation

Run:

```sh
npm run test:client-initialization
npm run test:setup-navigation
npm run test:local-server
```

The System Tools menu declares `configuration-backup-ui.js` before `hifiberry-system-tools-client.js`; the first script defines `window.speakerlabConfigurationUI`. The Signal Flow menu likewise declares `routing-ui-state.js` before `signal-flow-client.js`; the first defines the authoritative `window.signalFlowUIState`. Previously, UI assembly removed every `src="€/..."` tag and selected only the single manifest-matching `€-client` file. Both helpers were therefore absent from the generated page even though isolated tests loaded them manually.

The initialization suite parses the real menu declarations and executes the actual helper and client files in that order in a built-in `vm` browser-like harness. It catches top-level exceptions, proves each required state exists before first use, checks repeated evaluation does not duplicate document handlers, and verifies that absent optional configuration support degrades visibly. A missing Signal Flow state produces an explicit unavailable client instead of an uncaught `ReferenceError`.

The setup-navigation suite executes the existing `beo-ui.js` with a minimal DOM/jQuery harness. It covers unknown extensions, missing parent metadata, repeat attempts after a rejected navigation, the active-navigation diagnostic, and real destination checks during menu registration. The live local-server suite additionally proves:

* setup, speaker-preset and Signal Flow menu screens exist in assembled HTML;
* helper scripts occur exactly once and before their consumers;
* repeated HTTP UI generation returns the same script list without duplication;
* the setup WebSocket flow advances from `setup` to the locally available `speaker-preset` destination;
* Signal Flow state, crossover preview/save and reconnect remain operational in simulation.

`speaker-preset` and `signal-flow` retain their deployed `sound/...` contexts, while the local allow-list excludes the hardware-dependent `sound` extension. Menu preparation now assigns a parent only when that destination exists; otherwise those selected local screens remain top-level and navigable. This is a local composition consequence, not a new production navigation hierarchy.

No new browser framework or dependency was added. A manual connected-mode server startup and clean shutdown were completed, but the requested clean-session click-through and disconnected visual pass could not be performed because no controllable browser session was available in the execution environment. Visual layout, real pointer interaction, browser-specific console behavior and manual refresh behavior therefore remain unverified.

## Product information and speaker-profile setup

Run:

```sh
npm run test:product-information-client
npm run test:client-initialization
npm run test:setup-navigation
npm run test:local-server
```

`product_information` is owned by `product-information-client.js`. Speaker Preset uses `clearPresetPreview` before rendering every preview and uses `product_information.generateSettingsPreview` for named profiles whose server-side identity report declares that processor. Local mode previously excluded the complete Product Information extension because its deployed server startup reads Raspberry Pi/HiFiBerryOS identity and manages host naming and Bonjour. The client object was therefore absent, and the bare identifier at the start of `speaker-preset/presetPreview` raised a `ReferenceError` before any preview could open.

Local mode now loads the existing Product Information extension with a truthful fixed identity:

| Field | Local value |
| --- | --- |
| System/model name | `SpeakerLab Local Simulator` |
| Model ID | `speakerlab-local-simulator` |
| System ID/static name | `speakerlab-local` |
| Product image | existing generic Beocreate image |

The local branch never queries or renames the host, reads deployed identity files under `/etc`, starts Bonjour, changes the fixed simulator identity after applying a profile, or claims physical DSP application. It still reads the shipped repository product identities so named speaker profiles receive their established manufacturer/model preview metadata. Production startup and identity behavior are unchanged.

The Product Information client initializes that local state before messages arrive, updates the same object when valid server state arrives, retains existing values when optional fields are absent, and re-requests state on reconnect without clearing valid state. Malformed state is ignored with one target/header diagnostic per failure type. Repeated script evaluation reuses the client object and handlers.

Speaker Preset receives Product Information explicitly at initialization. If it is unavailable or a preset message arrives first, the preview continues with minimal metadata and emits one diagnostic instead of throwing. A preview without preset content produces a visible unavailable notification. This removes the valid-message-order assumption while preserving identity enrichment when Product Information is available.

The seven focused client cases cover local initialization, valid and optional server state, idempotence, product-before-preset and preset-before-product delivery, setup-before-both delivery, reconnect refresh, missing Product Information, malformed repeated state, named/minimal previews, selection, confirmation and invalid-preview feedback. The browser-like harness executes the actual client files and event handlers without predefining `product_information`.

The live local-server test additionally proves that Product Information loads before Speaker Preset in generated HTML, reports the fixed local identity, supplies repository identity metadata for a named Beovox profile, previews and applies `Other Speaker`, enables the next setup transition, retains the selected preset across another page fetch, and keeps Signal Flow/Crossover and connected/disconnected simulation operational.

A connected local server was started and stopped cleanly. The requested clean/incognito browser clicks, visual preview inspection, console inspection and disconnected manual repeat remain unverified because no controllable browser session was available.

## WebSocket contract and lifecycle

Run:

```sh
npm run test:websocket-contract
npm run test:websocket-lifecycle
npm run test:websocket-client
npm run test:local-server
```

The contract is the root URL on the same HTTP host, WebSocket subprotocol `beocreate`, and JSON `{target, header, content?}` envelopes. There is no request correlation or application acknowledgement. Missing/wrong envelope fields are transported unchanged and are later ignored by the server router when they cannot form an event. Unknown extension/header pairs have no listener and produce no response.

The contract tests use a small raw RFC 6455 test client built from Node's `net` and `crypto` modules. They cover handshake, valid client/server envelopes, content preservation, malformed JSON, repeated-invalid log limiting, synchronous handler failure, unsupported binary data and the 1 MiB assembled-message limit. Rejection checks wait for both the client's close and the matching server-side communication `close` event before inspecting connection state; a client-side close alone does not imply that server cleanup has run. They assert status 1003 for binary data, status 1009 for oversized messages, exactly-once removal of each rejected connection, no application dispatch for rejected input, continued service to an existing client and a valid replacement connection.

Lifecycle tests cover clean and abrupt close, repeated reconnect with fresh IDs, simultaneous clients, broadcast, connection-targeted messages, ordered delivery, protocol ping/pong and shutdown with active clients. The server has no application heartbeat, request timeout or pending-request replay.

The client test executes the existing `beo-comms.js` in a built-in `vm` harness with deterministic DOM, jQuery-event and WebSocket fakes. It verifies URL/protocol selection, envelope construction, extension dispatch, visible connection state, malformed-server-message recovery and one replacement socket after connection loss. No browser framework was added.

The live local-server test additionally verifies:

* connected and disconnected `dsp-programs/status` state on initial connection and reconnect;
* `channels/getSettings` routing and `channels/channelSettings` response;
* `general/activatedExtension` routing and System Tools backup capability response;
* continued availability after malformed JSON and unknown extension/header messages; and
* socket closure during graceful local shutdown.

Backup export, preview, confirmed restore, validation failure, rollback success and critical rollback-failure results remain covered by the configuration API and UI-state suites because those payloads use HTTP, not WebSocket. The live WebSocket test protects the connection/activation/capabilities coordination that enables that UI workflow.

## Limiter and Driver Protection Foundation v1

Run:

```sh
npm run test:driver-protection
npm run test:limiter-model
npm run test:protection-ui
npm run test:protection-acceptance
```

Pure tests cover 4/8-ohm power/RMS/peak conversions, voltage dB relationships, visible safety margin, invalid/non-finite fields, version/default migration, crossover/EQ/gain headroom, limiting-factor selection and deterministic first-order attack/release behavior. Service/contract tests cover complete-design validation, atomic persistence/readback, rollback preservation, named preview/simulator messages and prior-design migration. Compiler/simulator tests prove an explicit simulator-only operation, unknown physical mapping, unavailable readback, missing amplifier-reference diagnostics, exact simulated readback and injected mismatch.

The 12 Chromium journeys cover save/refresh/restart, EQ and channel-gain headroom, amplifier conflict, invalid fields/no partial save, tweeter crossover risk, synthetic limiter behavior, backup/restore and stale draft conflict, Deployment Preview/mismatch, disconnect/reconnect conflict, keyboard-only editing, semantic units/status and desktop/tablet/mobile layout. The monitored fixture fails unexpected page exceptions, console errors, request failures and relevant HTTP errors and retains traces, screenshots, video and server logs on failure.

The simulator accepts normalized level/duration steps and generates no audio. It is not evidence for a real SigmaDSP limiter. The existing source `volume-limit` extension is characterized as distinct. No automated path opens SigmaTCP, writes a physical limiter, predicts temperature/excursion/SPL or claims guaranteed protection. See `DRIVER_PROTECTION.md`.

## Signal-flow and channel-routing editor

Run the focused suites:

```sh
npm run test:signal-flow
npm run test:channel-routing
npm run test:routing-contract
npm run test:routing-ui
npm run test:local-server
```

The model suite covers the conservative default, stereo, two-way and three-way examples, disabled outputs, custom labels, all supported roles, deterministic serialization/revisions, unknown optional properties, unsupported versions, malformed identifiers/roles, duplicate outputs, invalid connections, the one-source policy, unavailable capabilities, blocking errors and non-blocking warnings.

The service suite uses temporary directories, including paths with spaces. It covers first startup without a file, atomic save and readback, repeated deterministic save, validation rejection, controlled write failure, readback corruption and rollback, malformed saved JSON, revision conflict and verified reset. Tests never touch real `/etc`, `/opt`, hardware or the network.

The contract suite exercises existing WebSocket-style headers for capabilities, state, validation, save and reset; valid and invalid drafts; verified not-deployed results; save failure; revision conflict and unknown messages.

The UI-state suite covers loading, four populated output cards, add/remove routing, label/role editing, validation rendering state, Save eligibility, unsaved state, success/failure, discard, disconnection, clean reconnect and conflicting-draft preservation. Markup/CSS checks require labelled ordinary form controls, live status regions, a narrow-width one-column card layout and no canvas dependency.

The live local-server suite assembles the editor into the existing navigation, requests current state over a real loopback WebSocket, saves and reads back a representative route, verifies the isolated `signal-flow.json`, and confirms `not-deployed` status in connected and disconnected simulation. It also retains the existing UI, channels, backup-capability and shutdown checks.

Configuration backup tests prove exact `signal-flow.json` inclusion and checksum, and reject invalid or unsupported routing during export/import validation. Restore tests prove file restoration and last-known-good capture. Existing transaction/rollback failure coverage applies to every central-settings item, including routing.

The feature does not test or change real DSP activation, SigmaTCP, limiter safety, summing/headroom, acoustic results, physical output or hardware restart behavior.

## Crossover Editor Foundation v1

Run the focused suites:

```sh
npm run test:crossover-model
npm run test:crossover-response
npm run test:crossover-ui
npm run test:channel-routing
npm run test:routing-contract
npm run test:configuration-backup
npm run test:configuration-restore
npm run test:local-server
```

The nested `org.speakerlab.crossover` version 1 model records one optional high-pass and low-pass per current output. Butterworth supports 6, 12, 18 and 24 dB/octave. Linkwitz–Riley supports 12 and 24 dB/octave only. The design capability is 48 kHz, derived from the shipped Beocreate universal DSP metadata; the application range is 10–20,000 Hz and remains below Nyquist.

The numeric suites use explicit tolerances rather than snapshots. They verify section count and coefficient finiteness, Butterworth −3.0103 dB and Linkwitz–Riley −6.0206 dB cutoff magnitude, matching Linkwitz–Riley phase relationships, disabled flat response, combined band-pass response, deterministic logarithmic points and finite response values.

Validation tests cover version/format, known outputs, families, slopes, cutoff types/range/Nyquist, reversed filters, narrow passbands and role/disabled-output warnings. Warnings allow save; errors block the complete routing-and-crossover save.

Service and contract tests cover atomic persistence without authoritative coefficients, readback derivation, revision conflicts, preview calculation, draft copy/reset and not-deployed results. UI-state/markup tests cover labelled ordinary inputs, invalid drafts, warnings, save/conflict/discard/disconnect behavior, accessible SVG/text summaries and narrow stacking.

Backup tests prove exact crossover inclusion and reject unsupported crossover versions. Restore and last-known-good tests prove filter round-trip and prior-filter capture. The isolated server test requests a real WebSocket preview, saves a Linkwitz–Riley low-pass, reads it back and retains the simulated/not-deployed state.

No test or implementation applies these settings to `equaliser.json`, speaker presets, DSP filter banks, SigmaTCP or physical hardware. The preview is electrical only and excludes driver, enclosure, impedance, directivity and multi-driver acoustic summation. Browser click-through and visual viewport inspection remain manual verification items.

## Channel Gain, Delay and Polarity v1

```sh
npm run test:channel-processing
npm run test:gain-delay-polarity-ui
npm run test:channel-processing-acceptance
npm run test:accessibility-smoke
```

The zero-dependency model tests cover neutral defaults, −60 to +6 dB boundaries, non-finite and malformed values, 48 kHz sample conversion, the 2,000-sample/41.666667 ms limit, centimetre/metre conversion at 343 m/s, polarity, canonical round-trip and design warnings. Service, WebSocket and UI-state suites cover draft copy/reset, validation, revision-safe atomic save and explicit `not-deployed` status.

Playwright covers mouse and keyboard edits, ordinary labelled controls, unit switching, visible equivalent values, warning/error feedback, disabled Save semantics, narrow/tablet layouts, refresh and server-restart persistence. Existing reconnect and backup/restore journeys now carry representative gain, delay and polarity values. All automated paths use isolated temporary state and the current-Beocreate simulator; they require no network, root, HiFiBerryOS service or physical hardware.

These tests do not prove DSP-register mapping, applied/read-back state, output headroom, audible timing, polarity at terminals or hardware recovery.

## Safe DSP Design Compilation Foundation

```sh
npm run test:dsp-compilation
npm run test:dsp-readback
npm run test:dsp-deployment-preview
npm run test:dsp-compilation-acceptance
npm run test:dsp-deployment-accessibility
```

Capability/compiler tests cover compatible/incompatible/unknown/missing identity, A–D mappings, deterministic two-way LR24 compilation, legacy coefficient order/sign and signed-5.23 golden values, routing, attenuation gain, whole-sample delay, polarity, disabled output, stale revision, protection, unsupported gain and missing mappings.

Readback tests cover exact match, mismatch, unavailable/invalid or partial state, connection loss, stale comparison, process-restart clearing and mute-until-verified behavior. Service/contract tests prove named WebSocket actions, optimistic concurrency, production preview-only behavior and absence of arbitrary browser register writes.

Five real-browser journeys cover full compilation, unsupported mapping, simulator application/readback/comparison, mismatch diagnostics, stale editing, reconnect/restart, desktop and 390 px layouts, keyboard actions and semantic target/status/per-output comparison groups. They use isolated temporary state and never access physical hardware.

## Complete Remaining Current-Beocreate Mapping

```sh
npm run test:sigmatcp-framing
npm run test:dsp-read-queue
npm run test:dsp-reconnect
npm run test:beocreate-mapping
npm run test:dsp-recovery
npm run test:dsp-readiness-acceptance
```

Framing fixtures distinguish source-derived request bytes from synthetic decoder-compatible responses and deliberately invalid input. Tests cover complete, split, coalesced, malformed, oversized and unknown frames; deterministic reset; serialized/repeated reads; timeout; malformed/wrong-size response; disconnect/reconnect generation; stale response; exactly-once callback cleanup; shutdown; and transported-but-unacknowledged writes.

Mapping tests require evidence and classification for every compiled operation, prohibit unverified mappings from being labelled verified, block unknown/unreadable safety fields and make recovery output deterministic. High-level simulation covers timeout, malformed response, stale response, unavailable readback and identity mismatch without false verification.

Real Chromium journeys expose confidence/readback status, exact blockers, identity mismatch, transport failures, recovery requirements, simulator availability, absence of physical Apply, keyboard semantics and desktop/tablet/390 px layouts. Tests remain loopback-only, deterministic and hardware-free.

## Read-only hardware evidence

```sh
npm run capture:beocreate-readonly -- --dry-run
npm run test:readonly-capture
npm run test:hardware-evidence
npm run test:evidence-review
npm run test:dsp-readiness-acceptance
```

The zero-dependency command tests prove dry-run isolation, exact checksum/parameter read allowlisting, rejection of write/unknown/ambiguous frames, two-read repetition, zero write/unknown transcript counts, request/payload/timeout limits, malformed response handling, cleanup and omission of the target host. Format/review tests cover schema, deterministic sanitized parsing, integrity corruption, missing or mismatched identity, contradictory observations, private-data rejection and the prohibition on promoting repository evidence or safe-state readback into write safety.

The real-browser provenance journey opens the disclosure by keyboard, checks its meaningful region label, source/schema/identity/readback/write-side text, privacy statement and continued absence of physical Apply. Existing journeys continue to cover retained blockers, identity mismatch, readback failure, recovery, desktop/tablet/mobile layout and monitored console/page errors. CI runs fixtures only and never invokes the live capture command.

No physical capture was performed. These tests do not establish physical parameter semantics, tolerances, GPIO mute state, successful writes, rollback, audible behavior or restart persistence.

## Settings loading characterization

The selected boundary is the central settings reader used by `Beocreate2/beo-system/beo-server.js` for system, UI and extension JSON files. The deployed server stores these as `/etc/beocreate/<extension>.json`; system and UI defaults are declared in `beo-server.js`, while extensions generally declare and merge their own defaults after receiving settings over the shared bus. The command-line `configure.js` editor reads and writes the same directory independently. Preset storage is separate: speaker presets use `Beocreate2/beo-speaker-presets` and `/etc/beocreate/beo-speaker-presets`, and Beosonic listening modes use `Beocreate2/beo-listening-modes` and `/etc/beocreate/beo-listening-modes`.

Run only the settings characterization tests:

```sh
npm run test:settings-store
```

The tests use Node built-ins only and require Node 14.14 or later because temporary-directory cleanup uses `fs.rmSync`. They create all fixtures under operating-system temporary directories and do not read or write `/etc/beocreate`, the developer's settings, the network, hardware, systemd, GPIO or SigmaTCP.

The characterized behavior is:

- Valid JSON is returned without schema validation; optional properties may be absent and unknown properties are retained.
- Missing, empty, whitespace-only, malformed and literal JSON `null` settings all produce `null`. Malformed JSON is reported to the error logger; missing files are silent.
- Each read reparses the file and returns a fresh object, so mutating one loaded result does not mutate the file or a later result.
- System/UI defaults are merged with `Object.assign`. The defaults object is mutated, the merge is shallow, unknown top-level properties survive, and a loaded nested object replaces the complete nested default object.
- Paths are based on the caller's data directory plus `<extension>.json`. Production supplies the hard-coded `/etc/beocreate` directory; the loader itself can be exercised with isolated paths, including paths containing spaces, and does not depend on the deployed `/opt/beocreate` source layout.

Directly requiring `beo-server.js` is unsafe in an ordinary development test because module evaluation creates the production data directory when absent, loads extensions, starts the HTTP/WebSocket server and imports OS/hardware-dependent modules. A small `settings-store.js` seam therefore contains the existing read and shallow-merge operations; the server calls it with the same production directory, defaults, debug level and console logger. No file format, default, path, error outcome or merge behavior was intentionally changed.

The settings-loading suite does not itself characterize writes, the ten-second shared save queue, shutdown flushing, path traversal through an untrusted extension name, extension-specific validation/merging or resource application. Central writes, atomicity and configuration recovery are covered by the focused suites below. Speaker-preset and listening-mode discovery are covered separately.

## Configuration read characterization

The configuration-read suite exercises the discovery logic extracted from the existing `speaker-preset` and `beosonic` extensions. It uses only Node built-ins and isolated temporary system/user directories. It does not import either complete extension, start the server, use the process working directory, access deployed `/opt` or `/etc` paths, save fixture data outside the temporary tree, contact hardware or apply any resource.

Run the focused commands:

```sh
npm run test:speaker-presets
npm run test:listening-modes
npm run test:configuration-read
```

Production resolves the directories as follows:

| Resource | System directory | User directory |
| --- | --- | --- |
| Speaker presets | `<beo.systemDirectory>/beo-speaker-presets` (normally `/opt/beocreate/beo-speaker-presets`) | `<beo.dataDirectory>/beo-speaker-presets` (normally `/etc/beocreate/beo-speaker-presets`) |
| Listening modes | `<beo.systemDirectory>/beo-listening-modes` (normally `/opt/beocreate/beo-listening-modes`) | `<beo.dataDirectory>/beo-listening-modes` (normally `/etc/beocreate/beo-listening-modes`) |

Both extensions create the user directory during module evaluation if it is missing, then discover resources on the `general/startup` event. The extracted seams preserve the discovery functions only; startup creation, event handling, settings saving and application remain in the original extensions.

### Speaker-preset behavior

- Every entry returned by `fs.readdirSync` is attempted; files are not filtered by extension.
- Identity is the filename with only its final extension removed. The display name is `speaker-preset.presetName`, falling back to `product-information.modelName`, but a truthy `speaker-preset` object is still required.
- System resources are read before user resources. The first accepted filename identity wins, so a user file cannot override a system file with the same filename. Different identities may share a display name.
- Compact/full objects retain insertion order derived from the platform's `readdirSync` results: accepted system entries followed by new user entries. The code performs no explicit sort.
- Missing system or user directories throw synchronously. A missing user directory can therefore leave system entries added before the throw.
- Read errors, empty/whitespace files, malformed JSON and JSON `null` are caught per file. Arrays and primitive JSON values are parsed but do not qualify. Errors and skips are logged only when extension debug logging is enabled.
- Unknown properties are retained in the full object without schema validation.
- Module-level lists are not cleared. Repeated discovery does not refresh an existing identity and does not remove stale entries whose files disappeared.

### Listening-mode behavior

- Identity is likewise the filename without its final extension. A truthy `beosonic.presetName` is required; other top-level adjustments and unknown properties are retained.
- System resources are read before user resources, but every accepted resource is assigned unconditionally. A user file with the same filename therefore overwrites the system value and becomes writable. Different identities may share a display name.
- Object insertion order follows first insertion from `readdirSync`; overwriting a duplicate does not move its key. Newly seen identities are appended to `settings.presetOrder` in discovery order and trigger the existing settings-save callback.
- Missing directories throw synchronously. Per-file malformed, empty, whitespace, JSON `null`, array and primitive handling matches the speaker loader's broad parse/skip behavior.
- Repeated discovery refreshes identities whose files still exist, but module-level full/compact lists retain identities for files that were removed. Missing entries in `presetOrder` are deleted and the existing settings-save callback runs.

The seams are `Beocreate2/beo-extensions/speaker-preset/preset-discovery.js` and `Beocreate2/beo-extensions/beosonic/preset-discovery.js`. They are extension-specific and intentionally do not define a generic configuration API, schema, storage format or hardware abstraction.

The 27 focused cases cover valid system/user resources, missing and empty directories, unreadable entries, malformed/empty/whitespace files, JSON `null`, arrays and primitives, required names, unknown properties, duplicate identities and display names, precedence, observed filesystem order, repeated discovery, stale state and paths containing spaces.

Still untested are speaker-preset/listening-mode upload, rename, delete and save paths; migration from old sound presets; product-identity enrichment; `presetOrder` interactions beyond discovery cleanup; concurrent filesystem changes; permissions on the target HiFiBerryOS image; and all preview/application/DSP behavior.

## Configuration write characterization

The focused write suite exercises the central settings writer used by `beo-server.js`. The writer is isolated in `settings-store.js` because importing the complete server starts network services and hardware/OS-dependent extensions. Production supplies `/etc/beocreate`, the global console and real timers; tests supply an isolated temporary directory and controllable built-in-only timers.

Run:

```sh
npm run test:settings-write
npm run test:atomic-settings
npm run test:configuration-write
```

### Write entry points found

| Owner | Target and behavior |
| --- | --- |
| Central settings broker | `/etc/beocreate/<extension>.json`; direct `beo.saveSettings` calls and `settings/saveSettings` bus events from system/UI and extensions including sound, channels, equaliser, Beosonic, speaker preset, sources, network, setup, privacy, DSP programs and others |
| `configure.js` | Directly reads and synchronously rewrites `/etc/beocreate/<extension>.json`; catches read/write errors but always exits with status 0 |
| Beosonic | Direct synchronous compact JSON writes for new/renamed user listening modes under `/etc/beocreate/beo-listening-modes`, in addition to central Beosonic settings saves |
| Speaker preset | Uploaded presets are moved into `/etc/beocreate/beo-speaker-presets`; legacy sound-preset migration rewrites files synchronously and saves selected-preset settings through the central broker |
| Room compensation | Direct compact JSON writes for measurements and generated compensation presets under `/etc/beocreate/beo-room-compensation` |
| ALSA loop and Squeezelite | Direct compact rewrites of `/etc/alsaloop.json` and `/etc/squeezelite.json`, followed by `statSync` |
| MPD | Direct compact rewrites of `beo-cache.json` below the active music library |
| Other platform configuration | Several extensions synchronously rewrite non-JSON `/etc` service/configuration files; these are configuration sources but are outside the JSON writer seam |

### Central atomic writes

- The target is constructed by direct string concatenation: `<dataDirectory>/<extension>.json`. Extension names are not validated, so path traversal is possible.
- `JSON.stringify` is called without a replacer, indentation or trailing newline. Property insertion order is used. Serialization completes before a filesystem replacement is attempted.
- Nested `undefined`, functions and symbols are omitted from objects and become `null` in arrays. Top-level `undefined`, BigInt and circular structures fail according to native `JSON.stringify`/`writeFileSync` behavior.
- A unique temporary file is opened exclusively in the target directory as `.<target-name>.speakerlab-<process-id>-<counter>.tmp`. Complete bytes are written in a loop, permissions are applied, the file is synced and closed, then renamed over the target. The directory is synced where supported. No target is deleted or truncated first.
- Existing permission bits are copied to the replacement. A new file uses `0666` filtered by the current process `umask`. Because rename installs a new inode, ownership becomes the writer's identity; this matches the normal root-owned deployed-service case but may differ for an unusually owned pre-existing file. Tests require no ownership changes, root or `sudo`.
- Immediate serialization observes state at the call and does not mutate the object. Errors propagate synchronously with their native code plus `atomicWriteStage` and `atomicWriteTarget`; a cleanup error is attached as `atomicWriteCleanupError`. Success is logged only at debug level 2 or higher and only after the write returns.
- Every failure before rename preserves the previous target and attempts to remove only the current write's temporary file. A directory-sync failure is reported after the complete replacement is visible and cannot be rolled back safely. Known unsupported directory-sync errors are tolerated.
- Stale temporary files are ignored, left untouched and never treated as authoritative. A new write uses another exclusive name. Automatic restoration and broad stale-file cleanup belong to later recovery work.

### Delayed and coalesced writes

- Non-immediate calls store the supplied object reference in one process-global pending object keyed by extension and reset one global 10,000 ms timer.
- A later save for the same extension replaces its queued reference. Saves for different extensions accumulate, but every call cancels and replaces the shared timer; activity from any extension postpones all pending writes.
- Because references are retained, mutation after scheduling changes the eventual serialized data. An immediate save does not remove an older queued value, so the queued value can later overwrite the immediate file.
- On timer expiry, pending extensions are synchronously serialized/written in object-property order. The queue is cleared only after the complete loop succeeds. A serialization or write failure aborts the loop, produces no broker error log, leaves the complete queue available in memory for a later retry, and escapes the timer callback as an uncaught exception.

### Shutdown and flush behavior

`SIGINT`/`SIGTERM` start the server's graceful shutdown sequence. Extensions may delay it for at most five seconds. After WebSocket shutdown completes, `completeShutdown` calls the same synchronous pending-write flush before closing HTTP and exiting or invoking the power command. The process waits for every file sync, close, rename and supported directory sync reached by that synchronous flush.

Manual/graceful flushing does not cancel the existing ten-second timer; it empties the queue after a successful loop, so the later timer normally performs an empty flush. Repeated flushes are otherwise harmless. A flush failure prevents the remaining shutdown callback steps from running and may terminate the process through an uncaught exception. Abrupt exit, kill, crash, power loss, a second unhandled signal or failure before the WebSocket callback can lose pending state.

The 18 scheduling/compatibility tests cover exact compact output, nested data, `null`, unsupported values, overwrite behavior, missing files/directories, controlled write failure, spaces, unsafe filename construction, repeated writes, immediate/delayed mutation, one and multiple extensions, timer replacement, success logging, queued-versus-immediate ordering, synchronous flush, repeated flush and failure/retry behavior.

The 20 atomic-persistence tests cover same-directory temporary placement, compact output, existing/new modes and `umask`, existing and stale files, spaces, serialization, exclusive creation/permission denial, complete and short writes, zero-progress writes, `chmod`, file sync, close, rename, directory sync, unsupported directory sync, cleanup, missing directories and delayed-flush failure/retry. Failures are injected through the module's narrow filesystem test seam. Tests use isolated operating-system temporary directories and never access real `/etc`, `/opt`, hardware or network services.

Still untested are the independent extension/CLI writers listed above, real ten-second timing under load, real signals and complete-server shutdown, true disk-full behavior, deployed filesystem and power-loss behavior, cross-process writers and unusual ownership. Those independent paths remain non-atomic.

## Configuration backup and restore

The configuration-portability slice uses the existing zero-dependency Node test style and isolated temporary directories. It does not load the complete server or contact hardware, SigmaTCP, HiFiBerryOS services or the network.

Run the focused suites:

```sh
npm run test:configuration-backup
npm run test:configuration-restore
npm run test:configuration-api
npm run test:configuration-ui
```

The v1 backup format is `org.speakerlab.configuration-backup`, schema version 1. It is a formatted JSON document with source/creation metadata, explicit included and excluded categories, opaque legacy JSON payloads, deterministic filename ordering, and SHA-256 checksums for items, sections and overall integrity.

Included configuration:

- safe top-level central settings files;
- user speaker presets under `beo-speaker-presets`; and
- user listening modes under `beo-listening-modes`.

Explicit exclusions include network/device identity, authentication-bearing services, DSP program state, first-run/update state, operating-system configuration, packages, logs, caches, uploads and temporary files. Files with sensitive key names are excluded as complete units and reported in backup metadata. `system.json` is included unless `runAtStart` is present. Malformed or unreadable in-scope files fail export.

Restore validation covers the 5 MiB input limit, JSON parsing, format and schema versions, required metadata/sections, safe `.json` basenames, duplicate items, per-item/section/overall checksums, unknown required sections and optional-section warnings. Preview classifies created, replaced, unchanged, absent and unsupported content. Absent active items are left unchanged.

The restore tests cover multi-file success, overwrite/create, validation and staging failures, first/later replacement failures, readback failure, reverse rollback, rollback verification/failure reporting, last-known-good verification, pending-save flush/cancellation, ordinary-write locking, concurrent/repeated restore, paths containing spaces and full export/change/restore semantic round trip. Measurement-merge coverage additionally proves source/derived/recipe export, source and derived hash preservation, change-plan reporting, missing-source and corrupt-derived rejection, and restoration of the complete dependency graph.

API contract tests exercise capabilities, download, preview, confirmation, invalid/unsupported/oversized input and rollback results. Client-state tests cover selection/validation, summary rendering, explicit confirmation, double-submit prevention, verified success, disconnected state, successful rollback and critical rollback failure.

The UI-state tests exercise the pure state/rendering seam in `configuration-backup-ui.js`, while `test:backup-restore-acceptance` and the merge acceptance journey cover real browser download, preview, confirmation, restart and restored-state inspection. The API tests still call route handlers directly rather than starting Express. HiFiBerryOS filesystem permissions, cross-process writers and physical power-loss recovery remain unverified.

## Supported server development runtime

Node.js 24 is the supported baseline for root repository scripts and the isolated Beocreate server. `.nvmrc` and `.node-version` both select major version 24. The server manifest records npm 11.6.2, which generated its lockfile version 3.

With nvm:

```sh
nvm install
nvm use
```

Other version managers that understand `.node-version` can select the same baseline from that file. Install the locked server tree with:

```sh
npm ci --prefix Beocreate2/beo-system
```

Node.js 24.18.0 and npm 11.6.2 were verified on Apple Silicon for clean install and the complete isolated suite. CI selects Node.js 24 on current Ubuntu and macOS runners. The clean tree contains no native binding or install lifecycle script.

Node.js 24 is not a verified production runtime for HiFiBerryOS, Beocreate Connect, Electron packaging or physical Beocreate hardware. The deployed service invokes an unversioned `/usr/bin/node`; its actual appliance version remains unresolved. The root manifest intentionally has no `engines` field because the supported claim does not extend to every legacy nested application.

### Server dependency wave 1

The controlled pure-JavaScript wave updates EventEmitter3 3.1.2 to 5.0.4, Express 4.17.1 to 4.22.2 and Underscore 1.9.1 to 1.13.8. Express stays on major 4. `aplay` stays at 1.2.0 because it invokes platform audio; production-global modules, extension platform dependencies, DSPToolkit, SigmaTCP and Electron remain deferred.

Before the wave, npm audit reported eight findings: three low, four high and one critical. The modern locked tree reports zero findings. No `npm audit fix` was used. This covers only server-owned packages at the assessment date and does not establish application or production-image security.

The clean install grows from 53 to 71 packages. The material additions are Express transitive call/prototype and side-channel helpers (`call-bind-apply-helpers`, `call-bound`, `dunder-proto`, `es-*`, `function-bind`, `get-*`, `gopd`, `has-*`, `math-intrinsics`, `object-inspect` and `side-channel*`) plus Express's nested `ms`; no direct dependency was added or removed.

## Repository verification

Run the focused automated tests:

```sh
npm test
```

Run only the portable JavaScript syntax sweep:

```sh
npm run check:syntax
```

Run the current repository-level verification:

```sh
npm run verify
```

`npm run verify` runs the focused tests and then checks every repository `.js` file selected by `scripts/verify-javascript-syntax.js`. Selection is deterministic; `.git`, `node_modules`, `.speakerlab-local` and symbolic-link directories are not traversed. Each file is passed as a separate argument to the active Node executable's `--check` mode, so paths containing spaces are safe and failures identify the affected relative path.

This is not complete application verification. It covers isolated HTTP/UI startup, the browser WebSocket contract, configuration paths, connected/disconnected simulation and graceful shutdown, but it does not access hardware or HiFiBerryOS, validate SigmaTCP framing/read queues/reconnect limits, package Electron, lint, type-check or assess production-global dependencies.

## Continuous integration

`.github/workflows/verify.yml` runs on pushes to `master` and `develop`, and on pull requests targeting either branch. Its matrix uses `ubuntu-latest` and `macos-latest`. The workflow uses `actions/checkout@v6` and `actions/setup-node@v6`, selects the version from `.nvmrc`, explicitly disables setup-node's automatic package-manager cache, and performs a clean server `npm ci`.

WebSocket, signal-flow/routing, configuration backup/restore and isolated-server commands run in named focused steps so their failures are visible directly. The final `npm run verify` remains authoritative and runs the complete focused suite plus the repository-wide syntax sweep once; CI no longer runs the complete `npm test` suite a second time as a separate step.

The WebSocket contract tests synchronize on the characterized application events instead of assuming that Ubuntu and macOS will process multiple frames within a fixed 20–30 ms delay. A two-second timeout remains only as a clear failure bound; the assertions and malformed-message/handler-failure coverage are unchanged.

The root tooling has no dependencies. CI installs only the modern server lockfile; it does not use a dependency cache. The workflow does not write to `/opt`, use sudo or secrets, start host services, contact physical hardware, install Beocreate Connect dependencies, package Electron or remediate npm audit findings.

## Commands found

| Area | Install | Start | Build/package | Test/lint |
| --- | --- | --- | --- | --- |
| Beocreate server | `cd Beocreate2/beo-system && npm ci` | local: `npm run dev`; deployed: systemd unit | none; HiFiBerryOS/Buildroot is external | local lifecycle: `npm run test:local-server`; nested package test remains a placeholder |
| Beocreate Essentials | no lockfile; historically installed as part of image | library only | none | placeholder `npm test`; no lint |
| Beocreate Connect | `cd BeocreateConnect && npm ci` | `npm start` | `npm run pack`, `npm run dist` | no test or lint |
| Repository layout harness | none | `node scripts/prepare-local-beocreate-layout.js <destination>` | none | `npm test` or `npm run test:local-layout` |
| Settings loading characterization | none | library seam only | none | `npm run test:settings-store` |
| Configuration read characterization | none | extension-specific discovery seams only | none | `npm run test:configuration-read`; focused: `test:speaker-presets`, `test:listening-modes` |
| Configuration write and atomic persistence | none | central settings writer seam only | none | `npm run test:configuration-write`; focused: `test:settings-write`, `test:atomic-settings` |
| Configuration backup and restore | none | service, REST-handler and client-state seams | none | focused: `test:configuration-backup`, `test:configuration-restore`, `test:configuration-api`, `test:configuration-ui` |
| Signal flow and channel routing | none | `npm run dev`, then open Signal Flow | none | focused: `test:signal-flow`, `test:channel-routing`, `test:routing-contract`, `test:routing-ui`, `test:local-server` |
| Parametric EQ v1 | root locked Playwright only for browser journeys | Signal Flow in isolated local mode | none | focused: `test:parametric-eq`, `test:eq-response`, `test:eq-ui`, `test:eq-acceptance` |
| Repository verification | none | not applicable | none | `npm run verify`; syntax only: `npm run check:syntax` |

`npm install` is documented for Beocreate Connect in the upstream README; `npm ci` is the reproducibility check where a committed lockfile exists.

## M0 command results (2026-07-14)

Environment: Apple Silicon `arm64`, macOS 14.5, Node `v26.4.0`, npm `11.17.0`.

### Passing checks

- `find ... -name '*.js' ... | xargs ... node --check`: passed for all repository JavaScript files outside `.git` and `node_modules`.
- `cd Beocreate2/beo-system && npm ci`: passed, adding 53 packages. npm warned that the v1 lockfile required registry metadata and reported 8 vulnerabilities (3 low, 4 high, 1 critical). No fixes were applied.
- `npm test`: passed all 10 local-layout tests without dependencies, network, root, HiFiBerryOS or hardware.
- `node scripts/prepare-local-beocreate-layout.js .speakerlab-local` run twice: passed and produced the same valid gitignored layout.
- `npm test`: passed 14 focused tests (10 layout and 4 syntax-verifier tests).
- `npm run check:syntax`: passed for 132 JavaScript files on the audited checkout.
- `npm run verify`: passed the focused tests and repository-wide syntax verification.

### Failed or unavailable checks

| Exact command | Relevant error | Likely cause | Blocks M0? |
| --- | --- | --- | --- |
| `cd Beocreate2/beo-system && npm test` | `Error: no test specified` | Placeholder manifest script | Yes: no executable server baseline tests |
| `cd beocreate_essentials && npm test` | `Error: no test specified` | Placeholder manifest script | Yes: no executable DSP/helper tests |
| `cd BeocreateConnect && npm test` | `Missing script: "test"` | No test script | Yes for a complete M0 verification command |
| `cd Beocreate2/beo-system && npm run lint` | `Missing script: "lint"` | No lint configuration | Yes for agreed M0 acceptance criteria |
| `cd Beocreate2/beo-system && npm run build` | `Missing script: "build"` | Server is deployed by external HiFiBerryOS build, not built here | No by itself; the deployment preparation gap does block a clean-checkout baseline |
| `cd BeocreateConnect && npm run lint` | `Missing script: "lint"` | No lint configuration | Yes for agreed M0 acceptance criteria |
| `cd BeocreateConnect && npm run build` | `Missing script: "build"` | Packaging scripts are named `pack` and `dist` | No; use documented package commands instead |
| `cd BeocreateConnect && npm ci` | `drivelist` ran `prebuild-install || node-gyp rebuild`; `node-gyp@6.1.0` failed on Node 26/arm64 with `TypeError: Cannot assign to read only property 'cflags'` | No usable prebuild plus obsolete node-gyp/native dependency on an unsupported host Node; install also reports many deprecated packages | Yes for Apple Silicon desktop reproducibility |
| `cd Beocreate2/beo-system && node beo-server.js` | `Cannot find module '../beocreate_essentials/communication'` | Repository layout differs from expected `/opt/beocreate` deployed layout | Yes for clean-checkout startup |
| `cd Beocreate2/beo-system && node list-dependencies.js` | `ENOENT ... Beocreate2/beocreate_essentials` | Same deployed-layout assumption | Yes for the documented dependency inventory helper |
| `cd BeocreateConnect && npm run pack` | `electron-builder: command not found` | Failed `npm ci` removed/left no complete dependency tree | Yes for packaging verification; downstream of install failure |
| `cd BeocreateConnect && npm run dist` | `electron-builder: command not found` | Same | Yes for distributable verification; downstream of install failure |

The first sandboxed server `npm ci` attempt could not resolve `registry.npmjs.org`; rerunning with approved network access succeeded. That environmental DNS failure is not a repository defect and does not independently block M0.

## Settings characterization command results (2026-07-15)

Environment: macOS, Node `v26.4.0`, npm `11.17.0`.

- `npm run test:settings-store`: passed 11 focused settings-reader/default-merge tests.
- `npm test`: passed 25 focused tests (10 layout, 4 syntax-verifier and 11 settings tests).
- `npm run check:syntax`: passed for 134 JavaScript files.
- `npm run verify`: passed all 25 focused tests and the 134-file syntax sweep.
- `git diff --check`: passed.

No command failed in this change. The checks did not install dependencies, use the network, access `/etc` or `/opt`, start the complete server, contact hardware or invoke HiFiBerryOS services.

## What can run without hardware today

Parametric EQ mathematics, validation, draft operations, atomic complete-design persistence, compiler output, simulator readback and browser workflows run without hardware. They use temporary state, the isolated local server and no network after locked dependencies are installed. They do not exercise legacy preset application, SigmaTCP writes, GPIO mute, audible output or acoustic behavior.

The central settings/default, configuration, syntax, deployed-layout and simulated DSP suites run without hardware. The local-server suite starts the existing server and HTTP UI assembly with an audited extension subset, isolated temporary state and no HiFiBerryOS services. Once the existing locked server modules are installed, tests perform no external network access. A clean `npm run dev` may use registry access to install those locked modules automatically.

Live WebSocket UI interaction, disabled hardware-dependent extensions and Beocreate Connect are not part of this local whole-server boundary. Beocreate Connect's current clean install still fails on the audited Apple Silicon runtime.

## What currently requires hardware or its OS image

- SigmaTCP/DSPToolkit register and program operations, amplifier mute GPIO and meaningful DSP metadata/readback.
- ALSA playback/mixer paths and source services.
- Wi-Fi/Ethernet mutation, Raspberry Pi identity/power/storage operations and systemd service control.
- Serial, Bluetooth, room-measurement and HiFiBerry helper workflows.

## Measurement Import Foundation

`npm run test:measurement-import` covers deterministic REW/FRD detection, parsing, normalization, malformed/binary rejection, path safety and integrity validation. `npm run test:measurement-storage` covers preview confirmation, atomic Signal Flow persistence, reload, assignment, overlay labelling and removal. `npm run test:measurement-ui` protects semantic controls and safety wording.

`npm run test:measurement-acceptance` runs isolated real-browser REW, no-phase FRD, malformed-input and narrow-responsive workflows with the shared console/page-error monitor. Fixtures are small synthetic project-owned text files; oversized inputs are generated in tests rather than committed.

`npm run test:measurement-alignment` covers overlap, log interpolation without extrapolation, robust median alignment, complementary raised-cosine weights, phase wrapping and deterministic magnitude-only output. `npm run test:measurement-merge` covers service/controller preview and save, source immutability, dependencies, edit/regeneration, atomic persistence and backup/restore. `npm run test:measurement-merge-ui` protects workflow semantics and safety wording.

`npm run test:measurement-merge-acceptance` covers a complete nearfield/farfield merge across refresh and restart, exact source immutability, recipe/transition editing, derived electrical overlays, source/hash backup and restore, one-sided missing-phase disclosure, narrow-overlap and large-offset warnings, deliberate warning acceptance, invalid transition/frequency rejection, named stale-source detection and recomputation, dependent-source removal, desktop/tablet/mobile layouts, keyboard-only save/reopen, semantic status/units and the shared browser-error monitor.
- End-to-end verification of startup mute, audible gain/routing/filter behaviour, EEPROM persistence and restart recovery.

Many of these require the HiFiBerryOS image rather than physical DSP hardware specifically. Tests must distinguish simulated, image integration and hardware-in-the-loop suites.

## Recommended test boundaries

### Characterization tests first

1. Speaker-preset discovery precedence, malformed JSON, required-name handling, compatibility preview, excluded sections and application ordering.
2. Settings defaults/merge, invalid/missing files, ten-second coalescing and shutdown flush.
3. DSP fixed-point conversion, message bytes, read-response decoding, read queue and reconnect limit using golden fixtures.
4. Extension filtering, system/user precedence, server-load failure isolation and UI asset assembly.
5. Channels/equaliser parameter conversion and out-of-range behaviour with existing preset fixtures.
6. Beosonic system/user preset loading and rename/delete semantics.

### Contract tests

- Current `dsp.js` exported operations against a simulated Beocreate SigmaTCP peer: success, disconnected write, timeout, malformed/partial response, reconnect and read correlation.
- Extension-to-DSP calls for routing, mute, gain, delay, polarity, filters and safeload, captured as golden writes.
- `{target, header, content}` WebSocket routing between client, server bus and extension.
- REST upload/download and extension event routing, including invalid paths/data and failure responses.
- Settings storage contract, including atomic-write behaviour once it is intentionally introduced.
- Speaker-preset `checkSettings`/`applySpeakerPreset` extension contracts.

### UI and end-to-end targets

- First-run setup navigation through country, network, speaker preset, product information and privacy, with disconnected/error states.
- Speaker preset list, preview, incompatible/malformed preset, apply success/failure and fallback-DSP confirmation.
- Main navigation, light/dark appearance, responsive widths and extension load failure.
- Sound changes showing pending, applied, failed and disconnected feedback.
- Beocreate Connect empty discovery, discovered product, manual `10.0.0.1` fallback and unreachable product.

## Test framework decision needed

Selecting the test and UI automation frameworks is a difficult-to-reverse project decision and belongs in a focused ADR during M1. M0 should first add a minimal Node-supported characterization harness only if the choice is intentionally narrow and documented. Normal tests must never require root, mutate host `/etc`, use the external network or contact physical hardware.

## Proposed M0 acceptance criteria

- Node.js 24 is pinned provisionally for development tooling and CI; production and nested-application runtime baselines remain unresolved.
- A documented command prepares the repository's Beocreate server layout without writing to host `/etc`.
- One repository-level verification command runs the currently available deterministic syntax and layout checks without hardware.
- CI runs the available verification on Ubuntu and macOS for pushes to `master` and pull requests targeting `master`.
- Server startup reaches an explicit simulated/disconnected state without root or physical hardware.
- Beocreate Connect install and at least unpacked packaging succeed on Apple Silicon, or it is explicitly excluded from M0 with an approved roadmap decision.
- Exact install/start/package commands and supported/unsupported environments are recorded.
- No DSP, audible behaviour, preset format or main navigation changes are included.
