# SpeakerLab Agent Instructions

## Mission

SpeakerLab is an independent open-source continuation of the Bang & Olufsen Beocreate software.

The current product target is the existing Beocreate software and hardware platform.

The goal is to stabilise, test and improve the current product before introducing major new loudspeaker-design functionality.

Future hardware platforms are not part of the current roadmap.

Preserve the strongest characteristic of Beocreate: its intuitive, approachable and easy-to-navigate user interface.

## Repository ownership

SpeakerLab is independently developed in:

`Heineb/speakerlab`

The original Bang & Olufsen Beocreate repository is historical source material only.

SpeakerLab has its own:

* roadmap
* branches
* issues
* releases
* pull requests
* development process

SpeakerLab changes must never be submitted, pushed or proposed to:

`bang-olufsen/create`

Preserve all applicable upstream copyright and licence notices.

Do not imply that SpeakerLab is developed, endorsed or supported by Bang & Olufsen.

## Start every task by reading

Always read:

1. `docs/PROJECT_CHARTER.md`
2. `docs/CURRENT_STATUS.md`
3. `docs/ROADMAP.md`
4. `docs/TESTING.md`

Read these when relevant:

* `docs/ARCHITECTURE.md`
* `docs/UI_PRINCIPLES.md`
* `docs/UPSTREAM.md`
* relevant records under `docs/decisions/`

Repository documentation is the durable project memory.

Do not rely on previous conversation context when the repository contains a more current answer.

## Current priorities

Work should generally follow this sequence:

1. Reproducible development baseline.
2. Characterization and automated testing of existing behaviour.
3. Simulated or isolated execution of existing Beocreate software.
4. Incremental Node.js, Electron and dependency modernisation.
5. Configuration export, import, backup and recovery.
6. Safe DSP deployment, verification and rollback.
7. Documentation and protection of the existing API.
8. Loudspeaker-tool improvements from Phase 2.
9. Distinctive SpeakerLab functionality from Phase 3.

Several related tasks may be completed together when they form one coherent feature slice.

Do not mix unrelated roadmap areas merely to increase task size.

## Scope restrictions

Do not currently:

* design support for hypothetical hardware
* create generic board capability models
* create universal DSP backends
* build abstractions solely for possible future products
* restructure the repository around speculative future requirements
* replace the existing UI framework solely because it is old
* rewrite working subsystems without a documented reason
* redesign the visual identity or primary navigation without a clear usability benefit
* change the DSP program without an explicit task

An abstraction is justified only when it:

* improves testing of current Beocreate behaviour
* isolates a known source of instability
* makes current code substantially easier to understand
* enables an approved current-roadmap feature

Any simulated hardware must model the current Beocreate platform.

It must not become a speculative universal hardware framework.

## Working principles

* Prefer coherent, testable feature slices over tiny isolated edits.
* Preserve existing behaviour unless the task explicitly changes it.
* Add characterization tests before refactoring poorly tested legacy behaviour.
* Separate refactoring from intentional behaviour changes when practical.
* Keep dependency upgrades separate from feature development.
* Do not introduce a new framework without a documented architecture decision.
* Never silently change audio behaviour.
* Avoid unrelated cleanup.
* Preserve existing file formats unless migration is part of the approved task.
* Do not continue into an unrelated roadmap area without user approval.

A task may include several related implementation steps when they share:

* one clear objective
* one main risk category
* one verification strategy
* one coherent completion criterion

## Branch workflow

SpeakerLab uses two permanent branches:

* `master` is the stable integration and release branch.
* `develop` is the normal working and milestone-integration branch.

Routine development should normally be performed directly on `develop`.

Several related tasks and local commits may accumulate on `develop` before a pull request is created from `develop` to `master`.

### Topic branches

Create a separate topic branch only when the work is:

* experimental
* high risk
* difficult to review as part of ongoing development
* likely to be discarded independently
* a major dependency or Electron upgrade
* a DSP-program change
* a large user-interface feature
* a release-specific fix

Approved topic-branch prefixes are:

* `docs/`
* `chore/`
* `test/`
* `fix/`
* `feature/`
* `refactor/`
* `upgrade/`

Do not create a topic branch for every small test, documentation update or closely related implementation step.

## Git safety

Before changing files, run:

* `git status --short`
* `git branch --show-current`
* `git remote -v`

Confirm that:

* `origin` points to `Heineb/speakerlab`
* the current branch is `develop` or an explicitly requested SpeakerLab topic branch
* the working tree contains no unrelated changes that would be overwritten

Never modify production files directly on `master`.

Do not add, remove, rename or modify Git remotes.

Do not synchronise SpeakerLab with the original Beocreate repository unless the user explicitly changes this policy.

## Local commits

Codex may:

* stage files related to the current task
* create focused local commits
* create multiple local commits when they represent distinct logical steps
* suggest how the commits should be grouped before committing

Commit messages should use clear conventional prefixes such as:

* `test:`
* `fix:`
* `feat:`
* `refactor:`
* `docs:`
* `chore:`
* `ci:`

Codex must not, unless the user explicitly requests that exact operation:

* push commits
* create pull requests
* merge branches
* merge into `master`
* force-push
* rebase or rewrite shared history
* delete local or remote branches
* create tags
* create releases
* modify repository settings

The normal task ends with verified local commits ready for the user to inspect and push.

## Pull requests and integration

All pull requests are internal SpeakerLab pull requests.

Both base and head repositories must be:

`Heineb/speakerlab`

Never create or recommend a pull request with `bang-olufsen/create` as the base repository.

Routine work may accumulate on `develop`.

Create a pull request from `develop` to `master` when a coherent milestone or feature slice is complete and the applicable verification passes.

Examples of suitable integration slices include:

* configuration-read foundation
* configuration-write safety
* backup and restore
* DSP transport simulation
* Node server modernisation
* Electron modernisation
* crossover editor
* measurement import

A pull request may contain multiple focused commits.

## User-interface principles

* Keep the default interface simple.
* Preserve familiar Beocreate navigation and interaction patterns.
* Optimise the default interface for the common workflow: define outputs, route signals, set crossover, adjust level/delay/polarity, EQ, inspect measurements, protect drivers and verify the design.
* Use progressive disclosure. Frequently used controls belong in context; specialised controls, implementation details, diagnostics and rarely used parameters belong under `Advanced`.
* Express controls using loudspeaker concepts rather than DSP jargon.
* Avoid adding controls merely because they are technically available.
* Prefer fewer strong, guided workflows over many narrow features or dense technical panels.
* A new navigation item, major panel, dashboard, toolbar section, persistent graph or workflow step must earn its space by supporting frequent work. Otherwise integrate it contextually, disclose it only when relevant or omit it from v1.
* Preserve the calm, clean, restrained B&O-inspired interaction mindset: generous spacing, clear hierarchy, few simultaneous decisions and low cognitive load. The default UI should feel like a product, not an engineering console.
* Hide raw DSP addresses, coefficients, transport internals, mapping hashes, protocol states, compiler operations and advanced numerical diagnostics unless they are needed for the current decision; place them under `Advanced` or Diagnostics.
* Prefer sensible safe presentation defaults over mandatory configuration, while keeping material safety decisions visible and advanced control available.
* Aim for roughly 80–90% of normal loudspeaker-design work to fit a small coherent interface. FIR, cardioid design, detailed phase diagnostics, directivity analysis and unusual target architectures must not dominate the default experience.
* Make destructive or potentially dangerous actions reversible.
* Advanced mode must not make basic mode harder to understand.
* Include loading, empty, error and disconnected states.
* Add or update end-to-end tests when important user workflows change.

For every user-visible slice ask whether it is frequent, reduces work or improves an important decision, belongs in an existing workflow, can use sensible defaults, which controls belong under `Advanced`, and which proposed UI can be removed without reducing the user outcome.

## Testing requirements

For every user-visible design feature, add focused model, server/contract, UI-state and real-browser tests where those boundaries exist. Cover refresh/restart persistence, responsive layout, keyboard operation, semantic status/error exposure, disconnected and reconnect behavior, backup/restore, and explicit distinction between saved, simulated and physically deployed state. Normal verification must remain hardware-free; hardware-in-the-loop evidence is separate and must never be implied by simulator results.

Every intentional behaviour change must have appropriate tests.

Use the smallest suitable test level:

* unit tests for pure logic
* characterization tests for undocumented legacy behaviour
* contract tests for component boundaries
* integration tests for multi-component workflows
* end-to-end tests for important user journeys
* golden fixtures for DSP coefficients, messages and serialized configurations

The normal automated test suite must not require physical hardware.

Hardware-in-the-loop tests must be explicitly marked and run separately.

Tests must:

* be deterministic
* avoid external network access unless explicitly marked
* use isolated temporary state
* include relevant failure cases
* restore altered state
* use defined floating-point tolerances where applicable
* provide useful failure output

Do not weaken or delete a failing test merely to make an implementation pass.

A task is not complete until the applicable focused tests and repository verification pass.

The current repository-level verification command is:

```sh
npm run verify
```

Do not describe it as complete application verification until the documented gaps have been closed.

If a required command cannot run, report that explicitly and do not claim complete success.

## Dependency upgrades

Do not perform broad dependency updates.

Before upgrading a dependency:

1. Explain why the upgrade is needed.
2. Identify the affected runtime paths.
3. Add or confirm tests for those paths.
4. Upgrade the smallest coherent dependency group.
5. Run focused and full verification.
6. Document changed runtime requirements.
7. Review lockfile changes for unrelated updates.

Electron upgrades must remain separate from unrelated server or feature development.

Major runtime upgrades should normally use a dedicated topic branch.

## DSP and audio safety

Treat these areas as safety-sensitive:

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

* explicit input validation
* automated tests
* defined safe defaults
* documented failure behaviour
* rollback considerations
* documentation of audible changes
* review of startup and disconnected states

Never deploy unvalidated coefficients or configuration values.

Do not replace a last-known-good configuration until the new configuration has been successfully validated and applied.

## Change workflow

For each coherent task or feature slice:

1. Read the required project documents.
2. Inspect the relevant existing code and tests.
3. Describe the current behaviour.
4. State the intended behaviour.
5. Identify regression, compatibility and audio-safety risks.
6. Add characterization tests where existing behaviour is not protected.
7. Implement the smallest coherent solution.
8. Run focused tests while developing.
9. Run `npm run verify`.
10. Review the diff for unrelated changes.
11. Update relevant documentation.
12. Update `docs/CURRENT_STATUS.md`.
13. Create one or more focused local commits when authorised by these instructions.

For exploratory tasks, document findings and recommendations before implementing broad production changes.

## Documentation

Update `docs/CURRENT_STATUS.md` after meaningful work.

Any meaningful user-visible feature is incomplete until its applicable documentation is current. Always consider the root `README.md` and task-oriented user guides explicitly, then update only the architecture, testing, UI descriptions or screenshots actually affected. Keep guides short, task-oriented and focused on the common workflow; put specialist diagnostics and implementation detail behind separate advanced material.

Keep it concise and forward-looking.

It should contain:

* current milestone
* current working branch
* latest completed slice
* verification status
* active work
* known blockers and risks
* next planned slice
* deferred work

Do not turn `CURRENT_STATUS.md` into a permanent command log or complete history.

Detailed historical findings belong in:

* Git commits
* pull requests
* architecture decision records
* `docs/TESTING.md`
* `docs/ARCHITECTURE.md`
* issue tracking

Create an architecture decision record before difficult-to-reverse decisions involving:

* frameworks
* public APIs
* configuration or storage formats
* test frameworks
* DSP deployment design
* major package boundaries
* licensing
* branch or release policy

Do not create an architecture decision record for ordinary implementation details.

## Product branding

SpeakerLab owns the user-facing application identity. New and changed product UI must use the SpeakerLab name and neutral SpeakerLab artwork, while preserving the restrained, calm and geometric Beocreate-inspired interface language.

Do not use the Beocreate logo, wordmark or Bang & Olufsen trademarks as SpeakerLab branding. Preserve Beocreate and Bang & Olufsen names where they are technically, historically or legally required, including current hardware names, protocol identifiers, inherited package/API names, speaker provenance, copyright and licence notices, and upstream documentation. Treat branding cleanup as identity maintenance, not a visual redesign, and add a focused stale-branding regression check where practical.

## README policy

The root `README.md` must be updated when the development setup, verification commands, runtime assumptions, licensing, upstream relationship and public project status are sufficiently accurate.

The future README must clearly state that:

* SpeakerLab is independent
* SpeakerLab is based on the original Beocreate codebase
* SpeakerLab is not an official Bang & Olufsen project
* current production readiness and limitations are accurately described

Do not present SpeakerLab as production-ready before the relevant Phase 1 acceptance criteria are met.

## Completion response

At the end of a task, report:

* current milestone
* current branch
* what changed
* local commits created
* tests added or changed
* commands run
* results
* production behaviour changed or unchanged
* remaining risks
* documentation updated
* suggested next task

Do not claim that a task is complete when required verification failed or was not executed.
