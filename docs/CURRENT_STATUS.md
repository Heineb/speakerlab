# Current Status

## Current milestone

M0 – Reproducible Baseline (local deployment shape complete; broader acceptance criteria not yet met)

## Completed work

- Audited all repository documentation, structure, Git state, manifests, v1 lockfiles, scripts, entry points, extensions, settings/presets, DSP path, Electron app and workflow absence.
- Documented the existing architecture, testing baseline, UI constraints, upstream relationship and incremental-modernisation decision.
- Verified all JavaScript parses with the available Node runtime.
- Verified server dependency installation on Apple Silicon/Node 26 and captured its vulnerability report.
- Reproduced Beocreate Connect's native install failure and the server's checked-out/deployed layout mismatch.
- Defined evidence-based M0 acceptance criteria and the smallest current-hardware simulator boundary.
- Added a deterministic workspace-local representation of the deployed `/opt/beocreate` shape using relative symbolic links.
- Added the first repository-level zero-dependency test command, covering layout creation, isolation, conflicts, idempotence and deployed-relative module resolution.
- Established that SpeakerLab is developed exclusively in `Heineb/speakerlab`; the original Beocreate repository is historical source material, not a development or pull-request destination.

## Files changed

- `docs/ARCHITECTURE.md`
- `docs/CURRENT_STATUS.md`
- `docs/PROJECT_CHARTER.md`
- `docs/TESTING.md`
- `docs/UPSTREAM.md`
- `docs/UI_PRINCIPLES.md`
- `docs/decisions/0001-incremental-modernisation.md`
- `.gitignore`
- `package.json`
- `scripts/prepare-local-beocreate-layout.js`
- `test/local-beocreate-layout.test.js`
- `AGENTS.md`
- `docs/decisions/0002-independent-repository-governance.md`

No production runtime code, DSP program, dependency version, lockfile, UI or audio behaviour was changed.

## Repository governance

All future SpeakerLab branches, issues, releases and pull requests belong only to `Heineb/speakerlab`. Pull requests are internal to that repository, with both base and head in `Heineb/speakerlab`. No ongoing synchronisation with the original Beocreate repository is planned, and SpeakerLab work is never proposed or pushed there.

Before editing files, agents must verify the working tree, current branch and remotes. Ordinary tasks must not modify remotes, push, merge, create pull requests, create releases or change repository settings unless the user explicitly requests that exact operation.

## Commands run and results

Environment: macOS 14.5 arm64, Node `v26.4.0`, npm `11.17.0`.

- Repository/Git/file/manifest searches and source inspection: passed.
- `node --check` over repository JavaScript: passed.
- `cd Beocreate2/beo-system && npm ci`: passed; 53 packages installed, 8 vulnerabilities reported (3 low, 4 high, 1 critical).
- Existing npm test commands: failed because they are placeholders or absent.
- Existing lint commands: absent.
- `cd BeocreateConnect && npm ci`: failed in native `drivelist` build using `node-gyp@6.1.0` on Node 26/arm64 (`Cannot assign to read only property 'cflags'`).
- Source server startup and dependency listing: failed because imports expect deployed sibling `Beocreate2/beocreate_essentials`, which is not present in the checkout.
- Electron `pack`/`dist`: could not run because Connect installation failed and `electron-builder` was unavailable.
- No GitHub Actions or other `.github/workflows` files exist.
- `npm test`: passed 10 focused local-layout tests.
- `node scripts/prepare-local-beocreate-layout.js .speakerlab-local`: passed twice; the second run preserved the same valid layout.
- Repository-wide `node --check`: passed for all JavaScript outside `.git` and `node_modules`.
- Legacy package test commands remain unavailable: server and Essentials use failing placeholders; Connect has no `test` script.
- `git diff --check`: passed.
- Repository safety check: `origin` is `https://github.com/Heineb/speakerlab.git`, branch is `docs/independent-speakerlab-workflow`, and no unrelated working-tree changes were present.
- Documentation governance search: no incorrect SpeakerLab repository-name variants remain, and no text recommends the original Beocreate repository as a future contribution destination.

Exact failure records and blocker classifications are in `docs/TESTING.md`.

## Current known issues

- No supported Node/npm version is pinned. Node 26 is an audit environment, not a supported baseline.
- The repository can now prepare the deployed path shape, but cannot safely start the whole server locally because extensions still assume HiFiBerryOS, root-level system paths and hardware services.
- There is one narrow test runner for the layout harness, but no general application test framework, lint/format/type-check setup or CI.
- Normal server execution eagerly loads Linux/HiFiBerryOS/root/hardware-dependent extensions.
- Beocreate Connect 0.3.0/Electron 9.4.0 does not cleanly install on the audited Apple Silicon runtime; native dependencies include `drivelist`, image-writing packages and `node-hid`.
- Electron references missing `writer.js` for its Node-mode writer path.
- Settings and preset writes are synchronous, unversioned and non-atomic; DSP/preset application has no transaction/readback/rollback.
- Server dependencies report known vulnerabilities; no audit fixes were applied because dependency changes are outside this task.
- No complete third-party asset/licence/trademark inventory exists.

## Development compatibility assessment

The main Apple Silicon blocker observed is Beocreate Connect's native dependency toolchain, not the pure JavaScript server packages. Old v1 lockfiles require supplemental registry metadata. Other likely native/OS constraints, evidenced by manifests and source, include serialport 7, experimental pigpio, node-hid, drivelist, Etcher image-writing dependencies, ALSA `aplay`, Linux wireless tools, systemd, GPIO and fixed Raspberry Pi/HiFiBerryOS paths.

Obsolete/high-risk assumptions include Electron 9, renderer `nodeIntegration: true`, Electron's legacy `new-window` event, node-gyp 6, deprecated image-writing/sudo/request-era packages, implicit global variables, synchronous filesystem/process operations and unauthenticated root server routes. These must be addressed incrementally after characterization tests.

## Proposed M0 acceptance criteria

1. Pin and document one working host Node/npm pair and the target HiFiBerryOS runtime assumption.
2. Make clean locked installs succeed for in-scope packages on Apple Silicon.
3. ~~Add a non-root command that prepares the deployed Beocreate directory layout in a workspace/temp directory.~~ Completed by `scripts/prepare-local-beocreate-layout.js`.
4. Partially complete: `npm test` runs deterministic layout tests without hardware/network; repository-wide syntax/static checks are not yet combined into that command and application characterization tests remain absent.
5. Add CI for that command.
6. Start the server against isolated fixture state and an explicit simulated/disconnected Beocreate DSP transport.
7. Verify Beocreate Connect unpacked packaging on Apple Silicon, or explicitly defer/exclude it through a roadmap decision.
8. Keep DSP program, audible behaviour, preset formats and main navigation unchanged.

## Prioritized dependency-modernisation sequence

1. Before upgrades, pin the last reproducible runtime for server and Connect separately and add tests around affected paths.
2. Repair repository/deployed layout preparation without changing runtime behaviour.
3. Add the minimal characterization/contract harness and current Beocreate DSP transport simulator; establish CI.
4. Separate Beocreate Connect's obsolete native image-writing/drive stack from its discovery/launcher path and decide whether the incomplete writer feature remains in scope; characterize both before changing dependencies.
5. Upgrade development-only tooling and lockfile format in focused changes.
6. Upgrade server pure-JavaScript patch/minor dependencies in small groups.
7. Upgrade native dependencies individually, beginning with the dependency blocking Apple Silicon install, with discovery/drive tests.
8. Upgrade the server Node runtime one supported step at a time.
9. Upgrade Electron separately, with startup, discovery, navigation, security and packaging tests at each major compatibility boundary.
10. Address major runtime libraries and obsolete APIs individually; remove compatibility code only after the new baseline is stable.

No vulnerability or audit auto-fix should be run as a broad upgrade.

## Completed coding pull request scope

The workspace-local preparation script now creates `<destination>/opt/beocreate` with links to `beo-system`, extensions, views/assets, presets/program data and `beocreate_essentials`. It accepts a caller-provided destination, never touches real `/opt` or `/etc`, and does not start the application or hardware.

Create the default gitignored layout with:

```sh
node scripts/prepare-local-beocreate-layout.js .speakerlab-local
```

Run its tests with:

```sh
npm test
```

## Tests added

- Characterized the expected deployed relative paths and `beocreate_essentials/communication` resolution.
- Verified creation in fresh temporary paths and repeatable/idempotent execution.
- Verified isolation to the selected destination and support for spaces.
- Verified missing source and destination conflicts fail clearly without overwriting.
- Verified representative production sources and the server lockfile retain their hashes.
- Verified operation with blocked proxy settings, no dependency installation, no hardware and no root destination.

Syntax checks remain a separate verification command; JSON configuration/preset characterization belongs in the next focused application-test change.

## Questions requiring physical Beocreate hardware

- What exact Node version and global module set ship in the currently supported Beocreate/HiFiBerryOS image?
- Does SigmaTCP on the supported image match the read/write framing, partial-response behaviour and reconnect assumptions in `dsp.js`?
- Which DSP writes are readable back reliably, and what acknowledgement/readback latency is safe?
- Does amplifier mute remain asserted through DSP/SigmaTCP restart, failed profile installation, server crash and power loss?
- What state remains in RAM, DSP memory and EEPROM after `dsptoolkit store`, reset, interrupted install and reboot?
- Which default/fallback program is actually last-known-good on shipped hardware, and how is it recovered today?
- Are gain, routing, polarity, delay, crossover and limiter settings applied audibly exactly as inferred from metadata and presets?
- Which GPIO/pigpio mute polarity and timing apply to every supported revision of the existing Beocreate 4-Channel Amplifier?
- Which operations require hardware versus only a representative HiFiBerryOS image?

## Remaining risks

The new harness validates paths and module resolution only. It did not boot HiFiBerryOS, start the root server, load extensions, connect to SigmaTCP, modify `/etc`, package Electron successfully or validate audible output. M0 therefore remains open.

## Documentation updated

All six requested M0 documents now contain the verified baseline. Legacy upstream material under `Documentation/` remains unchanged and is treated as supporting evidence, not SpeakerLab's durable status record.

## Deferred documentation work

- Update the root `README.md` when the M0 development setup, test commands, supported runtime and project status have been verified.
- The eventual README must clearly describe SpeakerLab as an independent project developed in `Heineb/speakerlab`, not an official Bang & Olufsen project.
- Do not present SpeakerLab as production-ready before the documented Phase 1 acceptance criteria are met.

## Next recommended task

Pin and document a supported development Node runtime, then add a minimal CI workflow that runs the focused layout tests and repository-wide JavaScript syntax check. Keep application characterization tests and the DSP simulator in later focused work.
