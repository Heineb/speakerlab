# Repository Hygiene and Master Readiness

Audit date: 2026-08-11

Candidate branch: `develop`

Comparison branch: `master`

## Outcome

The repository is coherent, locally reproducible and ready for external review as a development preview. The previous release candidate `865db8542786255295faef8b6649d538108c97fb` was pushed to `develop`; GitHub Actions run `31547428307` completed successfully on that exact SHA, with both Ubuntu and macOS passing.

This documentation-only readiness correction creates a new HEAD after that verified candidate. The new documentation HEAD has not yet been pushed or evaluated by GitHub Actions, so the exact integration verdict remains **NOT READY FOR MASTER** until that new SHA receives green Ubuntu and macOS CI and the final readiness review is repeated.

No unresolved Critical or High finding, credential, private key, access token, tracked runtime state or generated browser-test output was found. Four historical PDF guides contained local authoring paths in catalog XMP metadata; those streams were removed, and all 79 pages rendered pixel-identically before and after cleanup. The README review, documentation-link checks, branding checks and repository hygiene, secret and artifact scans all pass.

## Repository map and release boundary

| Area | Classification | Release treatment |
| --- | --- | --- |
| `Beocreate2/beo-system`, active extensions and default view | Current product runtime | In scope and verified |
| `scripts/`, root `test/`, Playwright acceptance tests | Development and verification | In scope and verified |
| `docs/`, `README.md`, `LICENSE`, `AGENTS.md` | Public and maintainer documentation | In scope |
| `Speakers/`, `DSP Programs/`, `Guides/`, `Documentation/` | Inherited current-hardware presets, programs and reference material | Retained with provenance |
| `beocreate_essentials/` | Inherited current-platform service compatibility | Retained; not independently modernised here |
| `BeocreateConnect/` | Unfinished legacy Electron discovery/launcher tool | Retained outside the preview runtime; packaging remains unverified |
| `Beocreate2/beo-extensions-experimental/` | Inherited experiments excluded from the production extension loader | Retained as deferred source material |
| `DSP Parameter Reader/` | Legacy engineering utility | Retained outside the preview runtime |

The release candidate is the browser product, isolated local runtime, simulator, tests and documentation. It is not a production image, a physical DSP writer or a validated release of the legacy desktop and engineering utilities.

## Branding and naming audit

The audit found 999 case-insensitive `Beocreate` references across 278 files and 267 Bang & Olufsen or historical repository references across 140 files, excluding lockfiles. Volume alone is not a defect because compatibility paths and retained history are extensive.

| Category | Examples | Decision |
| --- | --- | --- |
| Attribution and history | licence notices, upstream docs, origins, historical guides | Keep |
| Technical compatibility | `/opt/beocreate`, `beocreate` WebSocket namespaces, package and service names, current 4-Channel Amplifier target | Keep until an explicit compatibility migration exists |
| Stale user-facing project branding | active title, manifest, setup, About and Feedback were already corrected to SpeakerLab | Guard with `test/branding.test.js` |
| Legacy-tool branding | Beocreate Connect and DSP Parameter Reader surfaces | Keep within clearly excluded legacy boundaries; do not imply these are validated SpeakerLab surfaces |
| Dead or obsolete presentation | unreferenced historical icons and old assets | Retain unless loader/build reachability is proven; static-reference absence alone is insufficient |

The canonical mark, monochrome extension symbol and social-preview derivatives are documented in `docs/BRANDING.md`. The README now leads with the product and workflow; the Beocreate tribute and independence statement remain visible without dominating the landing page.

## Assets and GitHub presentation

- Canonical product mark: `Beocreate2/beo-system/common/speakerlab-mark.svg`.
- Canonical loading companion: `Beocreate2/beo-system/common/speakerlab-wait-animate.svg`.
- Intentional extension-local monochrome adaptation: `Beocreate2/beo-extensions/product-information/symbols-black/speakerlab-mark.svg`.
- Repository social preview: `docs/assets/speakerlab-social-preview.png`, with editable SVG source alongside it.
- README hero: the canonical product mark, not a duplicate bitmap.
- Repository icon: use the canonical mark when the hosting platform exposes an applicable organization/avatar surface; GitHub does not provide a separate repository-icon setting.

Manual GitHub step: upload the prepared PNG under **Settings → General → Social preview**. Recommended description: “Approachable open-source loudspeaker DSP design, measurement and safe simulated deployment for the Beocreate 4-Channel Amplifier.” Recommended topics: `audio`, `dsp`, `loudspeaker`, `speaker-design`, `beocreate`, `raspberry-pi`, `electron`, `nodejs`, `open-source`.

## Dead code, duplicates and dependencies

One definite backup artifact, `BeocreateConnect/main.js.bak`, was removed. It was referenced nowhere, had existed only since the initial import and was superseded by the active `main.js` loaded from `start.js`.

Two empty files in the experimental Interact-O extension are referenced by its own menu declaration, so they remain placeholders. The production extension loader discovers directories dynamically; active or experimental extension directories were not deleted based only on static reference searches. Packaging images under `BeocreateConnect/build` and the HiFiBerry touch icon remain build/runtime assets.

No dependency was removed. The active server dependencies have runtime consumers, and the many extension-local manifests describe dynamically loaded or separately packaged inherited components. Broad deduplication or lockfile normalization would be a dependency-upgrade project, not conservative release hygiene. Beocreate Connect's obsolete native dependency chain remains documented and outside this candidate boundary.

## Documentation hierarchy

The README is the public entry point. `GETTING_STARTED.md`, `DESIGN_WORKFLOW.md` and `USER_GUIDE.md` form the user path; focused feature guides supply detail. `PROJECT_CHARTER.md`, `ROADMAP.md`, `CURRENT_STATUS.md`, `TESTING.md`, `ARCHITECTURE.md` and decision records form maintainer memory. Historical reference material stays in its inherited top-level directories rather than being presented as current setup guidance.

No documentation file was removed: apparent overlap is purposeful separation between task-oriented guidance, technical contracts and durable decisions. Link verification remains part of `npm run verify`.

## Security and privacy scan

The repository-local scan covered common private-key headers, GitHub/AWS-style token patterns, absolute personal paths, tracked runtime directories and common test/build artifacts. No real secret was found. Matches in tests use deliberate example values and validate redaction behavior. `/home/pi` paths are target-platform compatibility paths.

Four PDFs under `Guides/` exposed historical local `/Users/...` authoring paths through XMP metadata. Their catalog metadata streams were removed with no page content change; a second binary scan finds no remaining `/Users/` path in tracked PDFs. This was a local scan only and made no external submission.

## Master-readiness gate

| Criterion | Status | Evidence or remaining action |
| --- | --- | --- |
| 1. Candidate branch and remote policy correct | Pass | `develop`; `origin` is `Heineb/speakerlab` |
| 2. Working tree scoped and reviewable | Pass | Changes limited to hygiene, presentation, tests and status |
| 3. Public README accurately describes the product | Pass | Product-first structure and explicit preview limits |
| 4. Independence and upstream attribution clear | Pass | README, licence and upstream policy retained |
| 5. Canonical branding assets defined | Pass | `docs/BRANDING.md` and branding test |
| 6. Social preview prepared | Pass | SVG source and 1280×640 PNG; manual upload documented |
| 7. Dead files removed only with strong evidence | Pass | Only the unreferenced `.bak` file removed |
| 8. Dynamic loaders and legacy boundaries preserved | Pass | Experimental and extension trees retained |
| 9. Dependencies audited without broad upgrades | Pass | No unjustified dependency or lockfile change |
| 10. Documentation hierarchy and links coherent | Pass | README map and documentation link test |
| 11. Repository-local secret/privacy scan clean | Pass | PDF XMP paths removed; no credential pattern found |
| 12. Physical DSP safety boundary unchanged | Pass | Physical Apply remains blocked |
| 13. Focused tests green | Pass | Branding and documentation-link suites pass |
| 14. Full hardware-free verification green | Pass | On `865db8542786255295faef8b6649d538108c97fb`, GitHub Actions run `31547428307` passed the authoritative `npm run verify` step on Ubuntu and macOS |
| 15. Candidate-head CI green on supported runners | **Pending for new documentation HEAD** | The previous candidate passed Ubuntu and macOS; push this documentation-only commit and obtain green checks on its exact new SHA |

Criterion 15 keeps the formal verdict at **NOT READY FOR MASTER** until CI evaluates the exact new documentation HEAD. This does not reopen feature work or any resolved Critical or High finding.

## Safe integration path after the blocker clears

Do not treat the verified previous candidate as CI evidence for the new documentation commit. First publish the documentation-only `develop` commit using the user's normal authenticated workflow, wait for green Ubuntu and macOS GitHub Actions checks on that exact new SHA, and repeat the final `develop...master` readiness review. If those checks pass without new changes, the repository can be reconsidered for a `develop` → `master` pull request. No push, pull request, merge, tag or release was performed by this update.
