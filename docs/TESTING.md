# SpeakerLab Testing Baseline

## Current state

There is no automated test framework, repository-level test runner, linter, formatter, type checker, coverage configuration or CI workflow in this checkout.

Most package manifests contain npm's placeholder `test` script, which deliberately exits 1. Beocreate Connect has no `test` script. Files named `*-test.js`, `networktest.js` and `dsp-test.js` are manual experiments, not assertions run by a framework. The committed `@serialport/binding-mock` is a transitive package and is not a SpeakerLab hardware simulator.

## Commands found

| Area | Install | Start | Build/package | Test/lint |
| --- | --- | --- | --- | --- |
| Beocreate server | `cd Beocreate2/beo-system && npm ci` | deployed: systemd unit; source attempt: `node beo-server.js` | none; HiFiBerryOS/Buildroot is external | placeholder `npm test`; no lint |
| Beocreate Essentials | no lockfile; historically installed as part of image | library only | none | placeholder `npm test`; no lint |
| Beocreate Connect | `cd BeocreateConnect && npm ci` | `npm start` | `npm run pack`, `npm run dist` | no test or lint |

`npm install` is documented for Beocreate Connect in the upstream README; `npm ci` is the reproducibility check where a committed lockfile exists.

## M0 command results (2026-07-14)

Environment: Apple Silicon `arm64`, macOS 14.5, Node `v26.4.0`, npm `11.17.0`.

### Passing checks

- `find ... -name '*.js' ... | xargs ... node --check`: passed for all repository JavaScript files outside `.git` and `node_modules`.
- `cd Beocreate2/beo-system && npm ci`: passed, adding 53 packages. npm warned that the v1 lockfile required registry metadata and reported 8 vulnerabilities (3 low, 4 high, 1 critical). No fixes were applied.

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

Static JavaScript syntax checks and pure exported DSP calculations can run without hardware. JSON fixtures can be parsed. The server dependency install can run on the audited Mac with registry access.

No supported whole-application automated test currently runs without hardware/HiFiBerryOS because extension loading eagerly imports OS-dependent modules and the source/deployed layouts differ. Beocreate Connect discovery/UI logic could theoretically run locally after dependencies install, but its current clean install does not succeed on the audited Apple Silicon runtime.

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

- A supported host Node/npm pair is pinned and installs every in-scope locked package from a clean checkout on Apple Silicon.
- A documented command prepares the repository's Beocreate server layout without writing to host `/etc`.
- One repository-level verification command runs deterministic syntax/static checks and the initial characterization tests without hardware.
- CI runs that command on every pull request.
- Server startup reaches an explicit simulated/disconnected state without root or physical hardware.
- Beocreate Connect install and at least unpacked packaging succeed on Apple Silicon, or it is explicitly excluded from M0 with an approved roadmap decision.
- Exact install/start/package commands and supported/unsupported environments are recorded.
- No DSP, audible behaviour, preset format or main navigation changes are included.
