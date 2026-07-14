# SpeakerLab Testing Baseline

## Current state

The repository now has zero-dependency automated tests for the workspace-local Beocreate deployment layout and portable repository-wide JavaScript syntax verification. A minimal GitHub Actions workflow runs these checks on Ubuntu and macOS. There is still no general application test framework, linter, formatter, type checker or coverage configuration.

Most package manifests contain npm's placeholder `test` script, which deliberately exits 1. Beocreate Connect has no `test` script. Files named `*-test.js`, `networktest.js` and `dsp-test.js` are manual experiments, not assertions run by a framework. The committed `@serialport/binding-mock` is a transitive package and is not a SpeakerLab hardware simulator.

## Local deployed-layout tests

Create a gitignored workspace-local representation of `/opt/beocreate`:

```sh
node scripts/prepare-local-beocreate-layout.js .speakerlab-local
```

The resulting server path is `.speakerlab-local/opt/beocreate/beo-system`. The script locates the repository from its own checked-in location, creates relative symbolic links, accepts an existing correct layout, and refuses unexpected managed paths. Any caller-provided destination may be used; the script writes only below that destination.

Run the focused repository-level tests:

```sh
npm test
```

The equivalent explicit command is:

```sh
npm run test:local-layout
```

The harness uses only Node built-ins: `assert`, `crypto`, `fs`, `os`, `path` and `child_process`. It intentionally avoids selecting a durable project-wide test framework before M1. Node 14.14 or later is required because cleanup uses `fs.rmSync`; the other used APIs are available by that release. It was verified on Node 26.4.0. No npm install is required because the root manifest declares no dependencies.

The ten tests cover fresh creation, expected links, deployed-relative `beocreate_essentials` resolution, idempotence, representative source/lockfile hashes, destination isolation, missing source content, conflicting destination content, spaces in paths and operation without network/hardware/root privileges.

This command does not start the server, load extensions, access `/etc` or `/opt`, contact SigmaTCP/DSP hardware, validate HiFiBerryOS services, test application behaviour, lint the repository or package Electron. It is the first narrow M0 verification command, not a complete suite.

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

`npm run verify` runs the 14 focused tests and then checks every repository `.js` file selected by `scripts/verify-javascript-syntax.js`. Selection is deterministic; `.git`, `node_modules`, `.speakerlab-local` and symbolic-link directories are not traversed. Each file is passed as a separate argument to the active Node executable's `--check` mode, so paths containing spaces are safe and failures identify the affected relative path.

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

## What can run without hardware today

Static JavaScript syntax checks, the local deployed-layout tests and pure exported DSP calculations can run without hardware. The root verification command needs no dependency installation or external network. JSON fixtures can be parsed. The server dependency install can run on the audited Mac with registry access.

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
