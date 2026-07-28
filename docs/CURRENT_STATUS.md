# Current Status

## Current milestone

**M0/M1 — Reproducible baseline and characterization foundation**

The repository now has a reproducible local layout harness, provisional development tooling, minimal continuous integration and initial characterization tests.

The broader M0 and M1 acceptance criteria are not yet complete.

## Branch model

* `master` is the stable integration branch.
* `develop` is the normal working and milestone-integration branch.
* Routine related work may accumulate on `develop`.
* Topic branches are reserved for high-risk, experimental or independently discardable work.
* Pull requests are internal to `Heineb/speakerlab`.
* SpeakerLab work is never submitted to `bang-olufsen/create`.

## Latest completed slice

### Configuration Write Safety

The central settings writer is now isolated behind a hardware-free seam and protected by characterization tests for immediate, delayed and shutdown-style flush behavior.

Characterized behaviour includes:

* compact synchronous JSON output and overwrite behavior
* missing directories, serialization errors and write failures
* unsupported values and mutable object references
* one global ten-second timer and cross-extension coalescing
* immediate writes followed by older queued state
* synchronous graceful-shutdown flushing and failure/retry behavior
* unsanitized filename construction and partial-write risk

Production paths, filenames, JSON output, delay, coalescing, logging and failure behavior were intentionally preserved. Atomic writes, backups and recovery were not introduced.

## Foundation currently available

### Local deployed-layout harness

The repository can create a workspace-local representation of:

`/opt/beocreate`

Run:

```sh
node scripts/prepare-local-beocreate-layout.js .speakerlab-local
```

The harness:

* never writes to the real `/opt`
* requires no root permissions
* uses relative symbolic links
* is deterministic and idempotent
* supports temporary directories and paths containing spaces

### Development runtime

Node.js 24 is the provisional runtime for:

* root repository scripts
* automated tests
* syntax verification
* GitHub Actions

Select it with:

```sh
nvm install
nvm use
```

This does not establish Node.js 24 as the production runtime for:

* the deployed Beocreate server
* HiFiBerryOS
* Beocreate Connect
* Electron packaging
* physical hardware

### Automated verification

Run the complete currently available repository verification with:

```sh
npm run verify
```

The current suite contains 70 focused tests covering:

* local deployed-layout preparation
* JavaScript syntax-verifier behaviour
* central settings loading and default merging
* speaker-preset discovery
* listening-mode discovery
* central configuration writes and flushes

Repository-wide JavaScript syntax verification currently covers 140 JavaScript files.

GitHub Actions runs the available verification on:

* Ubuntu
* macOS
* Node.js 24

The current suite does not constitute complete application verification.

## Current architecture seams introduced for testing

* `scripts/prepare-local-beocreate-layout.js`
* `scripts/verify-javascript-syntax.js`
* `Beocreate2/beo-system/settings-store.js` (read, merge and write mechanics)
* `Beocreate2/beo-extensions/speaker-preset/preset-discovery.js`
* `Beocreate2/beo-extensions/beosonic/preset-discovery.js`

These seams are specific to the existing Beocreate platform.

No generic future-hardware abstraction has been introduced.

## Active work

The next coherent development slice is:

### Atomic Settings Persistence

This slice should cover:

* an explicit atomic-write contract for central settings
* temporary-file placement, permissions and rename behavior
* serialization-before-truncation and failure cleanup
* durability expectations and last-known-good considerations
* migration from the characterized non-atomic path

It must not include:

* speaker-preset or listening-mode application
* import or export
* broad unification of extension-owned configuration writers
* UI changes
* dependency upgrades

The slice may be implemented directly on `develop` through several focused local commits.

## Known blockers and risks

### Server execution

The complete server cannot yet start safely in an ordinary local development environment because extensions eagerly assume:

* HiFiBerryOS
* root-level paths
* systemd
* GPIO
* SigmaTCP
* Linux-specific commands
* physical Beocreate services

### Configuration safety

The following remain unprotected or untested:

* concurrent writes
* atomicity
* recovery after partial writes
* independent extension and CLI write paths
* speaker-preset application
* listening-mode application

### DSP and audio

The following remain untested:

* SigmaTCP framing and reconnect behaviour
* DSP readback
* DSP deployment verification
* mute safety
* rollback
* audible filter behaviour
* GPIO mute timing and polarity

### Beocreate Connect

Beocreate Connect remains blocked on the audited Apple Silicon setup by obsolete native dependencies, including `drivelist` through the old `node-gyp` toolchain.

Electron packaging has not been verified.

### Dependencies and security

Server dependencies install on the audited development machine but report known vulnerabilities.

No broad audit fix or dependency upgrade has been applied.

## M0/M1 acceptance progress

### Completed

* Workspace-local deployed directory shape.
* Root repository test commands.
* Portable JavaScript syntax verification.
* Node.js 24 development-tooling selection.
* Minimal Ubuntu/macOS continuous integration.
* Initial settings characterization tests.
* Speaker-preset and listening-mode discovery characterization.
* Central immediate, delayed and shutdown-flush write characterization.
* Independent SpeakerLab repository governance.

### Partially complete

* Reproducible clean development setup.
* Characterization of configuration behaviour.
* Isolation of hardware-dependent runtime paths.
* Verification on Node.js 24 through hosted CI.

### Not yet complete

* Safe local server startup.
* Simulated or disconnected DSP transport.
* Atomic settings persistence and resource-application characterization.
* General application test framework or coverage reporting.
* Linting, formatting and type checking.
* Reproducible Beocreate Connect installation and packaging.
* Verified production runtime versions.

## Next planned slices

1. Atomic Settings Persistence.
2. Configuration backup, export, import and restore.
3. Isolated server startup with disconnected or simulated current Beocreate DSP transport.
4. Controlled dependency modernisation.
5. Safe DSP deployment and rollback.

The ordering may be adjusted when repository evidence reveals a stronger dependency between these slices.

## Questions requiring physical hardware

* Which Node.js version and global modules ship in the target HiFiBerryOS image?
* Which SigmaTCP operations can be read back reliably?
* What mute state is maintained during DSP or server failure?
* What survives DSP reset, interrupted installation and power loss?
* What is the current known-good recovery procedure?
* Which GPIO mute polarity and timing apply to supported board revisions?
* Which audio behaviours differ from the source-code assumptions?

## Deferred work

### Root README

Update the root `README.md` when these facts are sufficiently verified:

* development setup
* verification commands
* supported runtime assumptions
* licensing and attribution
* project maturity
* current limitations
* contribution workflow

The README must state clearly that SpeakerLab is:

* an independent project
* developed in `Heineb/speakerlab`
* based on the original Beocreate codebase
* not an official Bang & Olufsen project

Do not describe SpeakerLab as production-ready before the applicable Phase 1 criteria are met.

### Future hardware

New hardware remains outside the current roadmap.

Do not introduce speculative hardware or DSP abstractions.
