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

### Atomic Settings Persistence

The central settings writer now uses tested same-directory atomic replacement. A complete compact JSON value is written to a unique temporary file, permissions are applied, file contents are synced and closed, and the file is renamed over the target before the containing directory is synced where supported.

The persistence contract protects:

* the prior valid target for every reported pre-rename failure
* complete and short writes, permissions, `umask`, sync, close, rename and cleanup failures
* existing delayed/coalesced save ordering and mutable-reference behavior
* synchronous repeated shutdown-style flush and failure/retry behavior
* paths containing spaces without `/etc`, `/opt`, hardware, network or root access in tests

Production paths, filenames, compact JSON, delay, coalescing, logging and synchronous application-facing behavior remain compatible. This intentionally replaces unsafe in-place truncation. It does not add backups, schemas, export/import or recovery.

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

The current suite contains 90 focused tests covering:

* local deployed-layout preparation
* JavaScript syntax-verifier behaviour
* central settings loading and default merging
* speaker-preset discovery
* listening-mode discovery
* central configuration writes and flushes
* central atomic JSON persistence and deterministic failure injection

Repository-wide JavaScript syntax verification currently covers 142 JavaScript files.

GitHub Actions runs the available verification on:

* Ubuntu
* macOS
* Node.js 24

The current suite does not constitute complete application verification.

## Current architecture seams introduced for testing

* `scripts/prepare-local-beocreate-layout.js`
* `scripts/verify-javascript-syntax.js`
* `Beocreate2/beo-system/settings-store.js` (read, merge and write mechanics)
* `Beocreate2/beo-system/atomic-json-file.js` (central atomic JSON persistence)
* `Beocreate2/beo-extensions/speaker-preset/preset-discovery.js`
* `Beocreate2/beo-extensions/beosonic/preset-discovery.js`

These seams are specific to the existing Beocreate platform.

No generic future-hardware abstraction has been introduced.

## Active work

The next coherent feature slice is:

### Configuration backup, export, import and restore

This slice should cover:

* a complete inventory and versioned configuration bundle
* validation before applying imported data
* last-known-good backup and rollback
* round-trip and malformed/partial backup fixtures

It must not include:

* DSP-program changes or preset application
* generic future-hardware storage
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

* cross-process writes
* recovery and last-known-good backups
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
* Atomic central settings persistence with failure injection.
* Independent SpeakerLab repository governance.

### Partially complete

* Reproducible clean development setup.
* Characterization of configuration behaviour.
* Isolation of hardware-dependent runtime paths.
* Verification on Node.js 24 through hosted CI.

### Not yet complete

* Safe local server startup.
* Simulated or disconnected DSP transport.
* Resource-application characterization.
* General application test framework or coverage reporting.
* Linting, formatting and type checking.
* Reproducible Beocreate Connect installation and packaging.
* Verified production runtime versions.

## Next planned slices

1. Configuration backup, export, import and restore.
2. Isolated server startup with disconnected or simulated current Beocreate DSP transport.
3. Controlled dependency modernisation.
4. Safe DSP deployment and rollback.

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
