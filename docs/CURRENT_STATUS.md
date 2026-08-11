# Current Status

## Current milestone

**M11D — UI Workflow Consolidation v1**

Current working branch: `develop`.

## Latest completed slice

SpeakerLab now presents its established loudspeaker features as one **Speaker Design** workflow inside the inherited global shell. Three local views share one ordinary design draft:

- **Design** selects one output and exposes a single-open sequence of Output & routing, Crossover, Level & timing, Parametric EQ and Driver Protection.
- **Measurements** keeps import, inspect and assign together, with merge and routes to Driver alignment, assisted crossover and assisted EQ as contextual actions.
- **Review** derives a concise whole-speaker summary, links back to editing context and contains the simplified Deployment Preview.

Assisted features remain transient until explicit acceptance converts their result to ordinary unsaved design fields. Contextual measurement actions now preserve the selected measurement as the assistant reference. One collapsed **Advanced** pattern contains provenance, algorithm metrics, mapping, compiler and transport/readback details; validation, stale state, protection limitations and physical-deployment blockers stay visible.

Assisted EQ eligibility is contextual to the explicitly selected measurement. Selection is retained by stable ID while the assistant is open or closed, unrelated invalid measurements stay in Advanced detail, and a stale derived response receives one primary recompute blocker. Recomputing the merge updates its saved source-hash relationship and restores eligibility without weakening the 12-point source-quality minimum.

Canonical terms distinguish Output/Driver, Level & timing, Measurement/derived response, Measured/Predicted/Simulated, Saved/Unsaved/Error and Simulated/Blocked deployment. The default view renders one selected output, one expanded section and no permanent multi-graph dashboard.

README, Getting Started, Design Workflow, User Guide, UI principles, architecture, roadmap, testing and focused feature guides describe the consolidated paths. SpeakerLab remains the product identity; current-Beocreate references are retained only for supported hardware/DSP targets, inherited interfaces, history or attribution.

## Verification

`npm run verify` passes locally. It validates links across 25 documentation files, runs the complete Node and contract suite, checks 247 JavaScript files for syntax and passes 93 real-browser journeys in 15.7 minutes. `git diff --check` also passes.

The dedicated browser coverage includes a complete two-output design through Review/Save/restart, a measurement import/merge/alignment/assisted-crossover/assisted-EQ flow, clean default disclosure, mutation-free Advanced behavior, keyboard/semantic state and desktop/tablet/mobile layouts. The in-app browser backend was unavailable for a separate manual walkthrough; Playwright screenshots and semantic snapshots provided the available visual evidence. Simulator results remain hardware-free and are not evidence of audible output or physical deployment.

The most recent known remote `develop` GitHub Actions run before this local slice (`31433917583`, head `06290aa`) passed on Ubuntu and macOS. This local slice has not been pushed or run in CI.

## Active work

No implementation slice is active. The consolidated workflow is ready for local review and user validation.

## Known blockers and risks

Physical DSP apply remains blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback/tolerances, connection-loss invalidation and verified last-known-good rollback. No physical Apply control exists.

The inherited global shell still contains legacy extension-oriented destinations outside Speaker Design. Output selection and accordion disclosure are intentionally transient across a full page reload. Backup/restore remains in System Tools rather than duplicated in Review. Measurement timing references remain user-declared; assisted results depend on source quality and are not acoustic, audible or safety guarantees. Driver Protection still has no thermal or excursion model.

## Next recommended slice

**Stop and Validate.** Put the consolidated workflow in front of real users before adding another feature or commissioning layer.

## Deferred work

Physical DSP writes, automatic optimization, FIR, directivity, cardioid tools, room correction, thermal/excursion models and speculative hardware abstractions remain excluded. UI refinements should wait for specific evidence from real-user testing.
