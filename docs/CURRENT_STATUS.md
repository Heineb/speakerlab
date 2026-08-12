# Current Status

## Current milestone

**M11F — Release Candidate, Repository Hygiene and Master Readiness v1**

Current working branch: `develop`.

## Latest completed slice

The macOS CI regression in the consolidated measurement-assistance journey has been reproduced and fixed. Sequential measurement imports could receive late validation, preview or overlay responses between field edits. The render buffer preserved metadata only while a detail control owned focus, so a render between Playwright's programmatic selects could restore the authoritative pre-edit name, type and assignment before `Update measurement` read the form. The update then completed successfully with those old values.

Measurement form values are now buffered whenever they differ from the authoritative selected measurement, independent of focus and only for the same stable measurement ID. The acceptance helper waits for authoritative import count and update metadata rather than an incidental timeout, deliberately exercises a real same-entry overlay rerender, and verifies all three sequential imports by stable ID before continuing through merge, alignment, crossover and EQ.

The preceding repository-hygiene audit and release boundary remain unchanged in `docs/REPOSITORY_HYGIENE.md`.

## Verification

The previously failing journey passes once with trace, five consecutive focused repetitions and the complete 10-test workflow specification. Measurement import/model/storage/UI/merge suites pass, including all eight focused measurement browser journeys. `npm test` passes after the sandboxed socket attempt was correctly rerun outside the sandbox.

`npm run verify` passes locally: links across 27 documentation files, the complete Node/model/contract suite, syntax checks for 247 JavaScript files and all 95 Chromium journeys in 17.7 minutes. `npm run check:syntax` and `git diff --check` pass separately.

## Verified previous candidate

The release candidate `865db8542786255295faef8b6649d538108c97fb` was pushed to `develop`. GitHub Actions run `31547428307` completed successfully on that exact SHA: both `Verify (ubuntu-latest)` and `Verify (macos-latest)` passed, including the authoritative `npm run verify` step.

The final readiness review also confirmed that the README accurately describes SpeakerLab, links across all 27 Markdown documentation files pass, branding checks pass and the repository hygiene, secret and artifact scans pass. `develop` was 84 commits ahead and 0 behind `master`. No unresolved Critical or High finding remains.

## New documentation HEAD

This status correction creates a new documentation-only commit after the verified candidate. That new HEAD has not yet been pushed or evaluated by GitHub Actions. It must receive green Ubuntu and macOS CI on its own exact SHA before the final `develop` → `master` readiness decision.

## Active work

No feature implementation slice is active or required. Product work and the previous release candidate are verified; only this documentation-only readiness update and its fresh candidate-head CI gate remain active.

## Known blockers and risks

There are no unresolved Critical or High findings. Master integration is gated only by fresh candidate-head CI evidence after this documentation-only update is committed and pushed. Publishing, pull-request creation and integration remain user-owned actions.

Physical DSP apply remains blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback/tolerances, connection-loss invalidation and verified last-known-good rollback. No physical Apply control exists.

The inherited global shell still contains legacy extension-oriented destinations, and backup/restore remains in System Tools. Timing references are user-declared and cannot be acoustically verified. Driver Protection has no thermal or excursion model. Predictions, assisted results and simulator readback are not acoustic, audible, safety or physical-deployment evidence.

## Next recommended slice

Commit and publish this documentation-only status update on `develop`, require green Ubuntu and macOS checks on its exact new SHA, then repeat the final `develop` → `master` readiness review. Do not begin external user testing or new product work before that gate is resolved.

## Deferred work

Broad global-navigation redesign, physical DSP writes, automatic optimization, FIR, directivity, cardioid tools, room correction, thermal/excursion models, speculative hardware abstractions and broad dependency upgrades remain excluded.
