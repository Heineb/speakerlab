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

GitHub Actions run `31537054127` for published `develop` head `c031dc4` passed completely on Ubuntu. Its macOS job passed every step and 94 browser journeys, failing only the reproduced measurement-assistance journey in the final repository-verification step. The local fix has not been pushed or run in CI.

## Active work

No feature implementation slice is active. The focused CI fix is ready for local review and push, but the exact integration verdict remains **NOT READY FOR MASTER** until CI is green for the fixed candidate SHA.

## Known blockers and risks

Master integration is blocked by missing candidate-head CI evidence. The current published SHA has one macOS acceptance failure; the fix is local. Publishing, pull-request creation and integration remain user-owned actions.

Physical DSP apply remains blocked by fresh hardware identity, GPIO mute confirmation, per-operation physical readback/tolerances, connection-loss invalidation and verified last-known-good rollback. No physical Apply control exists.

The inherited global shell still contains legacy extension-oriented destinations, and backup/restore remains in System Tools. Timing references are user-declared and cannot be acoustically verified. Driver Protection has no thermal or excursion model. Predictions, assisted results and simulator readback are not acoustic, audible, safety or physical-deployment evidence.

## Next recommended slice

Review and publish the focused CI-fix commit on `develop`, require green Ubuntu and macOS checks on that exact SHA, then reconsider a `develop` → `master` pull request. Do not begin external user testing or new product work before that gate is resolved.

## Deferred work

Broad global-navigation redesign, physical DSP writes, automatic optimization, FIR, directivity, cardioid tools, room correction, thermal/excursion models, speculative hardware abstractions and broad dependency upgrades remain excluded.
