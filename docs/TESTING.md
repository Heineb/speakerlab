# SpeakerLab Testing Baseline

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

The settings-store tests do not characterize writes, the ten-second shared save queue, shutdown flushing, path traversal through an untrusted extension name, extension-specific validation/merging, resource application, atomicity, recovery, or concurrent access. Settings writes remain synchronous, unversioned and non-atomic. Speaker-preset and listening-mode discovery are covered separately below.

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

### Central immediate writes

- The target is constructed by direct string concatenation: `<dataDirectory>/<extension>.json`. Extension names are not validated, so path traversal is possible.
- `JSON.stringify` is called without a replacer or indentation. Property insertion order is used. Existing files are opened with the default `writeFileSync` behavior, truncated and overwritten; missing files are created, but missing parent directories are not.
- Nested `undefined`, functions and symbols are omitted from objects and become `null` in arrays. Top-level `undefined`, BigInt and circular structures fail according to native `JSON.stringify`/`writeFileSync` behavior.
- Immediate serialization observes state at the call and does not mutate the object. Errors from serialization or the filesystem propagate synchronously; there is no failure log, callback or event. Success is logged only at debug level 2 or higher and only after the write returns.
- There is no temporary file, rename, backup, `fsync`, schema check or readback. Truncation and writing happen in place, so another reader or a crash can observe an empty or partial file.

### Delayed and coalesced writes

- Non-immediate calls store the supplied object reference in one process-global pending object keyed by extension and reset one global 10,000 ms timer.
- A later save for the same extension replaces its queued reference. Saves for different extensions accumulate, but every call cancels and replaces the shared timer; activity from any extension postpones all pending writes.
- Because references are retained, mutation after scheduling changes the eventual serialized data. An immediate save does not remove an older queued value, so the queued value can later overwrite the immediate file.
- On timer expiry, pending extensions are synchronously serialized/written in object-property order. The queue is cleared only after the complete loop succeeds. A serialization or write failure aborts the loop, produces no broker error log, leaves the complete queue available in memory for a later retry, and escapes the timer callback as an uncaught exception.

### Shutdown and flush behavior

`SIGINT`/`SIGTERM` start the server's graceful shutdown sequence. Extensions may delay it for at most five seconds. After WebSocket shutdown completes, `completeShutdown` calls the same synchronous pending-write flush before closing HTTP and exiting or invoking the power command. The process therefore waits for each synchronous write that is reached, but not for durability beyond `writeFileSync` returning.

Manual/graceful flushing does not cancel the existing ten-second timer; it empties the queue after a successful loop, so the later timer normally performs an empty flush. Repeated flushes are otherwise harmless. A flush failure prevents the remaining shutdown callback steps from running and may terminate the process through an uncaught exception. Abrupt exit, kill, crash, power loss, a second unhandled signal or failure before the WebSocket callback can lose pending state.

The 18 focused tests cover exact compact output, nested data, `null`, unsupported values, overwrite/truncation, missing files/directories, controlled write failure, spaces, unsafe filename construction, repeated writes, immediate/delayed mutation, one and multiple extensions, timer replacement, success logging, queued-versus-immediate ordering, synchronous flush, repeated flush and failure/retry behavior. They do not access `/etc`, `/opt`, deployed user data, hardware or network services.

Still untested are the independent extension/CLI writers listed above, real ten-second timing under load, real signals and complete-server shutdown, OS page-cache/disk durability, concurrent processes, disk-full behavior, ownership/mode preservation, and observation of an actual partial write. Those paths remain non-atomic and require a later intentional behavior-change slice.

## Provisional development-tooling runtime

Node.js 24 is the provisional baseline only for root repository scripts, the local layout harness, current zero-dependency tests, the syntax verifier and GitHub Actions. `.nvmrc` and `.node-version` both select major version 24.

With nvm:

```sh
nvm install
nvm use
```

Other version managers that understand `.node-version` can select the same baseline from that file. The root manifest intentionally has no `engines` field because Node.js 24 support has not been established for every legacy application nested in the repository.

Node.js 24 is not a verified production runtime for the deployed Beocreate server, HiFiBerryOS, Beocreate Connect, Electron packaging or physical Beocreate hardware. Those runtime questions remain separate and unresolved. The tooling was most recently run locally on Node.js 26.4.0; Node.js 24 execution is configured in CI and must still be confirmed by a hosted workflow run.

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

`npm run verify` runs the 70 focused tests and then checks every repository `.js` file selected by `scripts/verify-javascript-syntax.js`. Selection is deterministic; `.git`, `node_modules`, `.speakerlab-local` and symbolic-link directories are not traversed. Each file is passed as a separate argument to the active Node executable's `--check` mode, so paths containing spaces are safe and failures identify the affected relative path.

This is not complete application verification. It does not run legacy placeholder test commands, install nested application dependencies, start the Beocreate server, access hardware or HiFiBerryOS, communicate with SigmaTCP, package Electron, test the UI, lint, type-check or audit dependencies.

## Continuous integration

`.github/workflows/verify.yml` runs on pushes to `master` and pull requests targeting `master`. Its matrix uses `ubuntu-latest` and `macos-latest`, checks out SpeakerLab, selects Node.js 24, runs `npm test`, and runs `npm run verify`.

The root tooling has no dependencies, so CI does not run an installation step or use a dependency cache. The workflow does not write to `/opt`, use sudo or secrets, start services, contact physical hardware, install Beocreate Connect dependencies, package Electron or remediate npm audit findings.

## Commands found

| Area | Install | Start | Build/package | Test/lint |
| --- | --- | --- | --- | --- |
| Beocreate server | `cd Beocreate2/beo-system && npm ci` | deployed: systemd unit; source attempt: `node beo-server.js` | none; HiFiBerryOS/Buildroot is external | placeholder `npm test`; no lint |
| Beocreate Essentials | no lockfile; historically installed as part of image | library only | none | placeholder `npm test`; no lint |
| Beocreate Connect | `cd BeocreateConnect && npm ci` | `npm start` | `npm run pack`, `npm run dist` | no test or lint |
| Repository layout harness | none | `node scripts/prepare-local-beocreate-layout.js <destination>` | none | `npm test` or `npm run test:local-layout` |
| Settings loading characterization | none | library seam only | none | `npm run test:settings-store` |
| Configuration read characterization | none | extension-specific discovery seams only | none | `npm run test:configuration-read`; focused: `test:speaker-presets`, `test:listening-modes` |
| Configuration write characterization | none | central settings writer seam only | none | `npm run test:configuration-write`; focused: `test:settings-write` |
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

The central settings reader/default merge, static JavaScript syntax checks, local deployed-layout tests and pure exported DSP calculations can run without hardware. The root verification command needs no dependency installation or external network. JSON fixtures can be parsed. The server dependency install can run on the audited Mac with registry access.

No supported whole-application automated test currently runs without hardware/HiFiBerryOS because extension loading eagerly imports OS-dependent modules. The local layout fixes path reproduction only; it does not isolate extension side effects or system paths. Beocreate Connect discovery/UI logic could theoretically run locally after dependencies install, but its current clean install does not succeed on the audited Apple Silicon runtime.

## What currently requires hardware or its OS image

- SigmaTCP/DSPToolkit register and program operations, amplifier mute GPIO and meaningful DSP metadata/readback.
- ALSA playback/mixer paths and source services.
- Wi-Fi/Ethernet mutation, Raspberry Pi identity/power/storage operations and systemd service control.
- Serial, Bluetooth, room-measurement and HiFiBerry helper workflows.
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
