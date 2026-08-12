# Stop and Validate v1

## Validated workflow

Stop and Validate v1 treated SpeakerLab as one product rather than a collection of extensions. The representative project is a conventional left-channel two-way loudspeaker with a woofer on Output A and tweeter on Output B, both routed from the left input. It uses 2.2 kHz Linkwitz–Riley crossover filters, ordinary level/delay/polarity edits, one peaking EQ band and sourced 8-ohm/50-watt woofer protection assumptions.

Measurements are project-owned synthetic FRD data: 121 logarithmically spaced points from 400 Hz to 8 kHz, shaped woofer/tweeter magnitude, useful phase with a 0.2 ms tweeter offset, a shared declared timing group and a separate woofer nearfield response. The nearfield and gated woofer responses produce a magnitude-only derived merge. No private data, audio, hardware or physical DSP write is involved.

The exercised evidence combines the focused Node/model suites and real Chromium journeys. It covers first setup, two-way configuration, routing, crossover, level/timing, Parametric EQ, measurement import/inspection/assignment/merge, driver alignment, assisted crossover, assisted EQ, Driver Protection, Review, Save, backup/restore, server restart, reload, context restoration and Deployment Preview. Separate journeys cover beginner, experienced, assisted, keyboard-only, semantic accessibility, reconnect and desktop/tablet/mobile use. The in-app browser was unavailable, so a separate unscripted visual walkthrough could not be completed; Playwright remained the available real-browser evidence.

Final `npm run verify` passes: 26 documentation files have valid local links, the complete Node/model/contract suite passes, 247 JavaScript files pass syntax verification and all 95 Chromium journeys pass in 15.1 minutes. The previously fragile integrated assisted journey also passes three consecutive focused repetitions after the render fix. GitHub Actions run `31487716136` is green on Ubuntu and macOS for the preceding committed `develop` head `68f141b`; this local slice has not been pushed or exercised by CI.

Interaction counts below use one deliberate click, selection, field change or submission as one interaction; typing characters and passive waiting are excluded. Counts describe the representative path, not targets.

| Step | Interactions | Navigation changes | Decisions / knowledge | Observation |
| --- | ---: | ---: | --- | --- |
| Start SpeakerLab | 1 | 0 | Know the documented launch command | Loopback and simulated-DSP state are explicit |
| Understand next step | 0 | 0 | None | Setup and Design copy provide a next action |
| Create/load design | 5 | 3 setup screens | Choose a matching preset or Other Speaker | Guided setup is coherent |
| Configure outputs | 10 | 2 output switches | Driver role, side and label | One selected output limits competing controls |
| Route inputs | 2 | 0 | Choose left input | Routing is colocated with output identity |
| Configure crossover | 8 | 2 accordion changes | Filter type, family, slope and cutoff | Standard terms; electrical preview is qualified |
| Inspect measurements | 6 per source | 1 workspace change | Confirm format, phase and assignment | Preview-before-confirm is clear |
| Align drivers | 7 | 1 contextual route | Honest timing basis, source pair, apply/reject | Timing input now remains outside Advanced |
| Adjust level/delay/polarity | 4 | 1 accordion change | Values must be justified | Canonical Level & timing language is consistent |
| Configure Parametric EQ | 5 | 1 accordion change | Band type/frequency/gain/Q | Ordinary editable state remains primary |
| Optionally Suggest EQ | 5 | 1 contextual route | Target, selected suggestion, acceptance | Bounded result becomes normal unsaved EQ |
| Configure Driver Protection | 5 | 1 accordion change | Sourced impedance/power assumptions | Limitations and lack of guarantees stay visible |
| Optionally suggest crossover | 4 | 1 contextual route | Pair, alternative, acceptance | At most three alternatives; no parallel saved state |
| Review complete design | 1 | 1 workspace change | Resolve errors and warnings | Review answers coherence and next context without becoming a dashboard |
| Save | 1 | 0 | Commit the whole validated draft | Saved remains distinct from deployed |
| Export backup | 3 | 2 global navigation changes | Choose download | Authoritative action remains in System Tools and is linked from Review |
| Restart/reload | 1 | 0 | None | Authoritative design survives; useful editor context now survives tab reload |
| Reopen design | 1 | 1 global navigation change | None | Selected output and open section remain understandable |
| Confirm state | 1 | 1 workspace change | Compare Review summary | Saved state and measurements remain coherent |
| Inspect Deployment Preview | 1 | 0 | Decide whether to compile/simulate | Target, compilability, simulator and physical blocker lead; diagnostics remain Advanced |

## What works well

- Design, Measurements and Review share one draft and form a recognizable normal workflow.
- One output and one section at a time prevent duplicated editors and graphs from dominating the screen.
- Assisted results are few, optional and become ordinary editable unsaved fields only after explicit acceptance.
- Review distinguishes Saved/Unsaved/Error, Simulated and Blocked and links back to the relevant editor.
- Important safety limitations, stale state and physical-deployment blockers do not depend on Advanced.
- Basic editing remains reachable and free of horizontal overflow at desktop, tablet and 390-pixel mobile widths.

## Friction found

### Critical

None demonstrated in the hardware-free normal workflow.

### High

| Finding | Classification | Resolution |
| --- | --- | --- |
| The active Feedback page sent SpeakerLab users to Bang & Olufsen and `@beocreate`, risking feedback to the historical upstream project | Branding, navigation | Replaced with the independent SpeakerLab issue tracker and explicit independence wording |
| Driver alignment required timing-reference input hidden with provenance under Advanced | Information architecture, required technical knowledge | Moved timing reference/group into normal measurement metadata; kept source filename/format/hash under Advanced |

### Medium

| Finding | Classification | Resolution |
| --- | --- | --- |
| Full reload reset selected output and accordion section, causing context loss although saved design state remained correct | State persistence, navigation | Store only selected output and active section in tab-scoped session storage; validate it against current outputs/sections |
| A late measurement-overlay response could re-render the selected measurement between field edits and discard unsubmitted text | Test fragility, product logic, accessibility | Preserve values that differ from the authoritative measurement across renders for the same stable ID, regardless of current focus; expose overlay loading with `aria-busy` and remove duplicate workspace renders |
| The inherited global extension navigation still exposes legacy destinations and makes backup require two global navigation changes | Information architecture, navigation | Deferred; Review keeps a direct System Tools link and a broad shell rewrite is not justified by this slice |

### Low

| Finding | Classification | Resolution |
| --- | --- | --- |
| Empty Review said “No routing-model issues found”, leaking an implementation concept | Terminology | Changed to “No design issues found” |
| UI inventory still named the user-facing destination Signal Flow and placed timing metadata under Advanced | Documentation | Updated to Speaker Design and the validated timing placement |

## Changes made

- Added a first-time two-way Save journey that never opens Advanced.
- Extended the integrated assisted-design journey through Driver Protection, Review and Save.
- Added reload coverage for selected output and active design section.
- Stabilized the selected-measurement editor across asynchronous overlay renders without sleeps or retries.
- Kept workspace, assistant analyses, Advanced disclosures and draft data transient.
- Removed stale upstream feedback actions and added branding regression assertions.
- Promoted required timing-reference inputs from Advanced while retaining provenance there.
- Removed one implementation-oriented status phrase and corrected affected guides/inventory.

## Deferred issues

- The inherited global extension navigation remains visibly broader than the Speaker Design workflow. Changing it requires evidence from external use, not an internal redesign.
- Backup/restore remains authoritative in System Tools. Duplicating the form in Review would create two lifecycle surfaces; the existing link is the bounded compromise.
- A competent user still needs to understand whether two phase captures genuinely share a timing basis. SpeakerLab cannot infer or verify that fact.
- A separate unscripted in-app-browser walkthrough remains unavailable in this environment.

## Advanced and UI placement recommendations

| Area | Recommendation | Reason |
| --- | --- | --- |
| Crossover filters and Suggest setup entry | Keep primary/contextual | Frequent design decision and bounded assistance |
| Alignment source/timing selection and recommendation | Keep contextual | Necessary to make the optional decision |
| Phase-fit metrics, samples and manual range | Keep in Advanced | Diagnostic rather than required for normal acceptance |
| Parametric EQ bands and Suggest EQ entry | Keep primary/contextual | Frequent editable design state |
| Smoothing, optimizer settings and raw scores | Keep in Advanced | Specialist controls with safe defaults |
| Measurement timing reference/group | Keep primary in selected measurement | Required evidence input for alignment, not a diagnostic |
| Measurement source format, timestamp and integrity hash | Keep in Advanced | Useful provenance without supporting the immediate decision |
| Merge | Keep contextual | Valuable only when suitable nearfield/farfield sources exist |
| Protection limitations and blockers | Keep primary | Safety-relevant |
| Normalized limiter diagnostics and mapping detail | Keep in Advanced | Engineering evidence, not a normal configuration decision |
| Compiler, transport, mapping and recovery detail | Keep in Advanced | Deployment diagnostics; default Preview already answers the product questions |

## Documentation findings

README answers product identity, capability, independence, launch, normal workflow, limitations and guide entry points without becoming an architecture document. Getting Started matches real control names and can be completed without Advanced. Design Workflow and User Guide now place timing references consistently with the UI. No user-guide screenshots exist, so there are no stale screenshots to correct. Link and documented-command checks remain part of `npm run verify`.

## Branding findings

The title, manifest, mark, setup and About surfaces use SpeakerLab. Current-Beocreate names that remain in the design path identify the supported DSP/hardware target or inherited compatibility. The Feedback page was the one demonstrated misdirection and is corrected. Package names, source notices and historical attribution remain untouched.

## Warning and terminology findings

Canonical Output, Driver, Measurement, derived response, Crossover, Level & timing, Delay, Polarity, Parametric EQ, Driver Protection, Predicted, Measured, Simulated and Deployment Preview terms are consistent in the validated screens and guides. Safety warnings remain textual and outside Advanced. The stale-merge warning gives a recompute action; missing measurement warnings direct the user to import/assign; physical deployment blockers state what remains unavailable. No duplicate safety warning was removed.

## Accessibility, responsive and performance findings

Native buttons, tabs, fields and disclosures remain keyboard reachable; focus and edited measurement form values survive reactive rendering for the same stable measurement ID, overlay loading exposes `aria-busy`, Advanced is not a focus trap and required timing fields no longer require opening a disclosure. Semantic status/error regions and disabled Save state remain covered. Desktop, tablet and narrow mobile journeys show readable content, reachable primary actions, visible safety status and no document-level horizontal overflow.

One duplicate Measurements/Review render on every workspace switch was removed while resolving the active-form race. No repeated request loop, duplicate listener registration, large redundant measurement transfer or panel-opening regression was otherwise demonstrated. Measurement graphs are scoped to the selected context, and this slice does not begin a broader optimization project.

## Known product limitations

- Timing references are user-declared metadata; SpeakerLab cannot acoustically verify shared capture timing.
- Driver Protection has no thermal driver model and no excursion model and is not a safety guarantee.
- Predictions and suggestions depend on measurement quality and are not audible truth.
- Physical DSP deployment and physical Apply remain blocked by identity, mute confirmation, readback/tolerances, reconnect invalidation and verified rollback prerequisites.
- Simulator results are hardware-free and are not physical deployment evidence.

## Next recommendation

**Stop Feature Development and Conduct External User Testing.** The demonstrated high and bounded internal frictions are corrected, the representative workflows are coherent, and the remaining navigation/timing questions depend more on observing real users than on adding capability.
