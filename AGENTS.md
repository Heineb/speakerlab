# SpeakerLab Agent Instructions

## Mission

SpeakerLab is an open-source, incrementally modernised continuation of the Bang & Olufsen Beocreate software.

The current and only supported product target is the existing Beocreate hardware and software platform.

The goal is to stabilise, test and improve the current product before introducing major new loudspeaker-design functionality.

Future hardware platforms are not part of the current roadmap.

Preserve the strongest characteristic of Beocreate: its intuitive, approachable and easy-to-navigate user interface.

## Start every task by reading

1. `docs/PROJECT_CHARTER.md`
2. `docs/CURRENT_STATUS.md`
3. `docs/ROADMAP.md`
4. `docs/ARCHITECTURE.md`
5. `docs/UI_PRINCIPLES.md`
6. `docs/TESTING.md`

Read relevant architecture decision records under `docs/decisions/` when a task affects architecture.

Repository documentation is the durable project memory. Do not rely on previous conversation context when the repository contains the answer.

## Current priorities

Work must follow the roadmap in this order:

1. Reproducible baseline.
2. Test framework and simulated Beocreate hardware.
3. Incremental Node.js, Electron and dependency upgrades.
4. Configuration export, import and recovery.
5. Safe DSP deployment and rollback.
6. Existing API documentation.
7. Loudspeaker-tool improvements described in Phase 2.
8. Distinctive functionality described in Phase 3.

Do not begin a later milestone while foundational requirements from an earlier milestone remain unresolved unless the user explicitly approves it.

## Scope restrictions

Do not currently:

* design support for hypothetical hardware
* create generic board capability models
* create universal DSP backends
* build abstractions solely for possible future products
* restructure the repository into speculative packages
* replace the existing UI framework solely because it is old
* rewrite working subsystems without a documented need
* redesign the visual identity or main navigation
* change the DSP program without an explicit task

An abstraction is justified only when it:

* improves testing of existing Beocreate behaviour
* isolates a known source of instability
* makes current code easier to understand
* enables an approved current-roadmap feature

The simulated hardware must model the existing Beocreate platform. It must not become a speculative universal hardware framework.

## Working principles

* Make incremental changes.
* Prefer small, reviewable pull requests.
* Preserve existing behaviour unless the task explicitly changes it.
* Add characterization tests before refactoring legacy code.
* Separate refactoring from behaviour changes.
* Keep dependency upgrades separate from feature work.
* Do not introduce a new framework without an architecture decision.
* Never silently change audio behaviour.
* Preserve upstream copyright and licence notices.
* Avoid unrelated cleanup.
* Do not continue to a second roadmap task after completing the requested task.

## User-interface principles

* Keep the default interface simple.
* Preserve familiar Beocreate navigation and interaction patterns.
* Use progressive disclosure for advanced functionality.
* Express controls using loudspeaker concepts rather than DSP implementation jargon.
* Avoid adding controls merely because they are technically available.
* Prefer guided workflows over large technical control panels.
* Provide safe defaults.
* Make potentially destructive actions reversible.
* Advanced mode must not make basic mode harder to understand.
* Include loading, empty, error and disconnected states.
* Add or update end-to-end tests when navigation or important workflows change.

## Testing requirements

Every behaviour change must have tests.

Use the smallest appropriate test level:

* Unit tests for pure logic.
* Characterization tests for undocumented legacy behaviour.
* Contract tests for UI, backend and DSP-transport boundaries.
* Integration tests for multi-component workflows.
* End-to-end tests for important user journeys.
* Golden fixtures for DSP coefficients, DSP messages and serialized configurations.

The normal automated test suite must not require physical hardware.

Hardware-in-the-loop tests must be explicitly marked and run separately.

Tests must:

* be deterministic
* avoid external network access
* include relevant failure cases
* restore altered state
* use defined floating-point tolerances
* provide useful failure output

Do not weaken or delete a failing test merely to make a change pass.

A task is not complete until required tests, linting, type checks and builds pass.

If a required verification command cannot run, report that explicitly and do not claim complete success.

## Dependency upgrades

Do not perform a broad dependency update.

Before upgrading a dependency:

1. Identify why the upgrade is needed.
2. Identify affected runtime paths.
3. Add or confirm tests for those paths.
4. Upgrade the smallest reasonable dependency group.
5. Run focused and full verification.
6. Document changed runtime requirements.
7. Review the resulting lockfile for unrelated changes.

Electron upgrades must be separate from unrelated Node.js or application feature changes.

Major-version upgrades must normally have their own pull request.

## DSP and audio safety

Treat these as safety-sensitive:

* output gain
* routing
* mute behaviour
* crossovers
* high-pass filters
* delay
* polarity
* limiters
* driver protection
* DSP deployment
* fallback configuration

Changes in these areas require:

* explicit validation
* automated tests
* defined safe defaults
* failure behaviour
* rollback considerations
* documentation of audible changes
* review of startup and disconnected states

Never deploy unvalidated coefficients or configuration values.

Do not replace a last-known-good configuration until the new configuration has been successfully validated and applied.

## Change workflow

For each task:

1. Read the required project documents.
2. Inspect the relevant existing code and tests.
3. Describe the current behaviour.
4. State the intended behaviour.
5. Identify regression and audio-safety risks.
6. Add characterization tests where behaviour is not already protected.
7. Implement the smallest viable change.
8. Run focused tests.
9. Run the complete available verification suite.
10. Review the diff for unrelated changes.
11. Update relevant documentation.
12. Update `docs/CURRENT_STATUS.md`.

For exploratory tasks, produce findings and recommendations before implementing production changes.

## Documentation

Update `docs/CURRENT_STATUS.md` after meaningful work with:

* current milestone
* completed work
* files changed
* commands run
* test results
* known issues
* remaining risks
* next recommended task

Create an architecture decision record before difficult-to-reverse decisions involving:

* frameworks
* public APIs
* configuration formats
* storage formats
* test frameworks
* DSP deployment design
* major package boundaries
* licensing

Do not create an architecture decision record for ordinary small implementation details.

## Git discipline

* Do not commit directly to the protected default branch.
* Use focused branches.
* Use clear conventional commit messages.
* Do not combine unrelated changes.
* Do not rewrite upstream history.
* Do not commit secrets or local credentials.
* Do not commit local machine paths.
* Do not commit generated build artifacts unless required.
* Preserve attribution to the upstream Beocreate project.

## Completion response

At the end of a task, report:

* current milestone
* what changed
* tests added or changed
* commands run
* results
* remaining risks
* documentation updated
* suggested next task

Do not claim that a task is complete when required verification failed or was not executed.

## Repository ownership and Git safety

SpeakerLab is an independent project developed in:

`Heineb/speakerlab`

The original Bang & Olufsen Beocreate repository is historical source material only.

SpeakerLab changes must never be submitted, pushed or proposed to:

`bang-olufsen/create`

### Remote requirements

* `origin` must point to `Heineb/speakerlab`.
* No Beocreate remote is required.
* Do not add, remove, rename or modify Git remotes.
* If `origin` does not point to `Heineb/speakerlab`, stop and report the problem before changing files.
* Do not synchronise SpeakerLab with the original Beocreate repository unless the user explicitly introduces a new policy in the future.

### Branch requirements

Before changing files, run:

* `git status --short`
* `git branch --show-current`
* `git remote -v`

Never implement changes directly on the SpeakerLab default branch.

Create or use one focused SpeakerLab topic branch for each task.

Approved branch prefixes are:

* `docs/`
* `chore/`
* `test/`
* `fix/`
* `feature/`
* `refactor/`

Do not create branches in any other repository.

Do not combine unrelated roadmap tasks on one branch.

### Push and merge restrictions

Codex must not:

* push branches
* create pull requests
* merge pull requests
* merge into the default branch
* rebase or rewrite the default branch
* force-push
* delete remote branches
* create tags or releases
* change repository settings

unless the user explicitly requests that exact Git operation.

The normal Codex task ends with local changes, test results and a suggested commit message. The user reviews and performs the push and merge.

### Pull request destination

All pull requests are internal SpeakerLab pull requests.

The required base repository is:

`Heineb/speakerlab`

The head repository is also:

`Heineb/speakerlab`

Never create or recommend a pull request with `bang-olufsen/create` as the base repository.

### Relationship to Beocreate

Do not describe SpeakerLab changes as candidates for contribution back to Beocreate.

Do not add roadmap items for upstream synchronisation.

Preserve applicable original copyright and licence notices, but maintain an independent roadmap, release process and project identity.
