# ADR 0001: Incremental Modernisation of the Existing Beocreate Product

- Status: Accepted
- Date: 2026-07-14
- Milestone: M0 – Reproducible Baseline

## Context

SpeakerLab starts from a working but tightly environment-coupled Beocreate codebase. It targets the existing Beocreate 4-Channel Amplifier and current software platform. The server uses a dynamic extension architecture, root-level HiFiBerryOS integrations, unversioned JSON settings and direct SigmaTCP/DSPToolkit access. Automated tests and CI are absent. Electron and several native dependencies are obsolete and do not cleanly install on the audited Apple Silicon runtime.

A rewrite, framework replacement or generic future-hardware model would discard undocumented behaviour and increase audio-safety risk before the baseline is protected.

## Decision

SpeakerLab will modernise the existing product incrementally.

1. Preserve existing Beocreate behaviour, UI/navigation patterns, configuration formats and extension contracts unless a focused task explicitly changes them.
2. Establish a reproducible runtime and characterization tests before refactoring or dependency upgrades.
3. Introduce only boundaries that solve a current Beocreate problem. The first hardware-testing boundary will model the existing SigmaTCP/DSPToolkit transport consumed by current extensions, not a universal DSP or board API.
4. Separate test infrastructure, refactoring, dependency upgrades, Electron upgrades and user-visible features into reviewable changes.
5. Treat routing, gain, mute, crossovers, delay, polarity, limiting, protection and DSP deployment as safety-sensitive, requiring validation, failure behaviour and rollback consideration.
6. Preserve upstream attribution and licensing.

## Consequences

Positive consequences:

- Existing user workflows and audible behaviour can be protected before change.
- Upgrade failures can be isolated to small dependency/runtime waves.
- A simulated current-hardware transport can enable ordinary CI without broad speculative architecture.
- Review and rollback remain tractable.

Costs and limitations:

- Legacy global state, callbacks and OS coupling remain temporarily.
- Modernisation will take multiple pull requests rather than one rewrite.
- Some integration and audio behaviour will still require HiFiBerryOS or physical hardware testing.
- New product/hardware support is deliberately not enabled by this decision.

## Rejected alternatives

- Full application rewrite: rejected because behaviour is insufficiently tested and the UI baseline should be preserved.
- Immediate broad dependency update: rejected because affected runtime paths lack tests and Electron/native/server changes need separate verification.
- Generic hardware capability or DSP backend framework: rejected because no current-roadmap product requires it.
- UI framework replacement as foundation work: rejected because age alone is not a documented product need.

## Follow-up

M0 should pin a working runtime, prepare the checked-out server layout, add the smallest characterization suite and CI. M1 should decide the durable test framework and add the current-Beocreate DSP transport simulator. Only then should M2 upgrade dependencies in small waves.
