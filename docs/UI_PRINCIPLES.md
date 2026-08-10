# SpeakerLab UI Principles

## Baseline

The existing Beocreate 2 browser interface is SpeakerLab's product baseline. M0 does not redesign it. The current architecture assembles one view from extension markup, scripts and styles, with client/server messages over the `beocreate` WebSocket protocol. Beocreate Connect is a separate Electron discovery/launcher utility, not the loudspeaker-control UI itself.

Local development must remain visually unmistakable without changing normal product navigation. The current local server adds a small persistent “Local development · simulated DSP” badge only when the explicit local-development switch is active. Production markup has no badge. Future simulated/disconnected states should remain subtle, readable and distinct from real connected hardware.

## Principles to preserve

- Keep the default interface clear, calm, approachable and easy to navigate.
- Preserve familiar main navigation, extension screens and responsive browser behaviour.
- Use loudspeaker concepts in user-facing language; hide register addresses, SigmaDSP implementation terms and raw coefficients unless an advanced workflow specifically requires them.
- Use progressive disclosure. Advanced mode must not add friction or visual noise to ordinary tasks.
- Prefer the existing standard components and extension patterns to one-off controls.
- Retain light and dark schemes, the restrained monochrome visual language, and colour mainly for channel identity, status, warnings, artwork and illustrations.
- Use concise British English, title case for interactive labels and sentence case elsewhere.
- Provide safe defaults and explain consequences before gain, routing, crossover, polarity, delay, limiter, protection or DSP-program changes.
- Make destructive or audible changes reversible and show whether a change is pending, applied, failed or disconnected.
- Distinguish a saved design, simulated state and verified hardware state. “Saved” must never imply “playing” or “deployed”.
- Label simulated electrical graphs as electrical rather than acoustic predictions, state what physical behaviour is excluded, and provide a textual summary that does not depend on the graph or colour.
- Design loading, empty, disconnected, partial-failure and recovery states as first-class states.
- Keep setup guided. A user should not need to understand the underlying DSP to commission an existing Beocreate system.

## Product simplicity and progressive complexity

Optimise for the repeated loudspeaker workflow: define outputs, route signals, set crossover, adjust level/delay/polarity, EQ, inspect measurements, protect drivers and verify the design. Frequently used controls belong in that context. Specialised controls, implementation details, diagnostics and rarely used parameters belong under contextual `Advanced` disclosure. A model capability alone does not justify a control.

A primary navigation item, permanent major panel, dashboard, toolbar section, persistent graph or additional workflow step must earn its space by supporting frequent work. Otherwise integrate it into an existing workflow, show it only when relevant, place it under `Advanced` or omit it from v1. Prefer fewer strong workflows to many narrow features.

Preserve the B&O-inspired qualities of the baseline: calm, visually clean, restrained and understandable; generous spacing, clear hierarchy, meaningful defaults, few simultaneous decisions and low cognitive load. The default UI should feel like a product rather than an engineering console. Raw DSP addresses, coefficients, transport details, mapping hashes, protocol state, compiler operations and advanced numerical diagnostics stay in `Advanced` or Diagnostics unless required for the current decision.

Sensible safe presentation defaults should remove mandatory configuration without hiding material safety decisions. Advanced users retain control through progressive disclosure. Aim for roughly 80–90% of ordinary loudspeaker-design work to fit the small coherent primary interface; specialist FIR, cardioid, detailed phase, directivity and unusual target workflows must not dominate it.

Every user-visible slice is reviewed by asking: Is it frequent? Does it reduce work or improve an important decision? Does it belong in an existing workflow? Can defaults hide complexity? Which controls belong under `Advanced`? Can any proposed UI be removed without reducing the outcome?

## Safety feedback

UI acknowledgement is not proof that a DSP write succeeded. Safety-sensitive workflows must distinguish request sent, transport accepted, state verified and rollback/recovery outcomes once those backend capabilities exist. Until then, the UI must not overstate success.

Preset previews should continue to disclose unsupported content and fallback DSP requirements. Future recovery work must protect the last-known-good configuration and present a clear way back.

Configuration restore establishes a reusable destructive-workflow pattern: selecting a file or resource performs validation only; the interface then shows a plain-language change summary and warnings, requires a separate explicit confirmation, prevents duplicate submission, and waits for server verification. Failure states must distinguish successful automatic rollback from critical incomplete recovery. Raw JSON and filesystem paths remain hidden from the default flow.

## Change rules

- Add or update end-to-end tests for navigation and important workflows.
- Characterize the existing UI before changing legacy behaviour.
- Do not replace the UI framework solely because it is old.
- Do not change visual identity or main navigation without a documented usability need.
- Keep refactoring, dependency upgrades and user-visible behaviour changes in separate pull requests.
- Verify at representative narrow and wide viewport sizes and in both colour schemes.

## SpeakerLab identity

Project-owned UI uses the SpeakerLab name and neutral SpeakerLab geometric artwork. The Beocreate logo, wordmark and Bang & Olufsen trademarks are not SpeakerLab branding. Keep Beocreate references that truthfully identify the supported hardware, inherited protocol/API, upstream code, original speaker products or required copyright/licence attribution. Identity cleanup must preserve the existing calm layout and must not become a navigation or visual redesign. See `docs/BRANDING.md`.

## Accessibility baseline to establish

Focused browser accessibility smoke checks now protect labelled native channel-processing controls, keyboard editing order, focus preservation across reactive rendering, live validation and semantic disabled Save state. Full legacy-navigation traversal, automated screen-reader output, contrast, reduced-motion behavior and visual regression remain to be established. Accessibility fixes should preserve the established visual and navigation model.

Deployment previews must lead with target identity and plain-language state, keep raw registers in an optional technical disclosure, distinguish requested/compiled/actual values, and never use “Active” or “Verified” without “simulator” or “physical” context. Stale state, errors and warnings must remain textual and live-announced; actions must be native buttons with truthful disabled state.

Readiness must be textual, distinguish strong evidence from verification, name exact blockers and never imply that transmitted or simulated values were physically applied. Mapping, transport and recovery summaries must stack at narrow widths without requiring a raw-register table.

Evidence status must distinguish repository-backed, unreviewed physical and reviewed physical sources. Provenance disclosures must name the schema/revision and review status, state read-only versus write-unverified conclusions in text, omit device identifiers and remain keyboard accessible. Evidence collection alone must never display physical readiness.

Parametric EQ follows the same progressive-disclosure rule. Compact band rows expose selection and enabled/bypassed state in text and semantics; editors use loudspeaker terms and explicitly distinguish peaking Q from RBJ shelf slope S. The graph always retains the combined result, distinguishes EQ contribution without relying on colour, and has a textual electrical/headroom summary. Destructive whole-output reset requires confirmation. Controls stack at narrow widths and remain native keyboard controls.

Measurement import follows preview then confirm. Detection, units, point count, range, phase availability and calibration uncertainty remain textual. Measured response and relative electrical overlays use distinct labels and scales; they never imply an acoustic sum, calibration or automatic correction. File selection, assignment and removal remain keyboard reachable at narrow widths.

Measurement merging keeps sources, level-adjusted preview and derived result explicitly distinct. Suggested alignment is visible and requires deliberate adoption. Merge centre, octave transition, overlap, phase limitation, stale state and significant reliability warnings are textual and semantic. Derived magnitude must never be presented as anechoic truth, a phase-aligned response or an automatic correction.

Driver Protection uses progressive per-output disclosure. Driver metadata, amplifier assumptions, limiter settings, calculated limits, warnings, mapping status and simulator output remain separate named regions. Every unit and limiting factor is textual. Raw and post-margin thresholds are both visible; channel gain and EQ contribution are never applied automatically. Wording uses “configured limit”, “estimated electrical limit”, “potential headroom risk” and “simulator estimate”, and never claims guaranteed safety, thermal/excursion protection or physical deployment.

Measurement-Assisted EQ stays inside the existing Parametric EQ context rather than adding navigation or a dashboard. The primary flow contains reference measurement, Flat or Gentle downward tilt target, visible active range, Suggest EQ and a short selectable result list. Smoothing, range, reference, tilt, boost/filter limits and algorithm diagnostics remain under `Advanced`. Measured, Target, Current estimated and Predicted with suggestions are named in text; prediction is never presented as measured or guaranteed improvement. Acceptance creates ordinary unsaved PEQ bands, while reject leaves the design and source unchanged.

Driver phase/time alignment stays directly after Crossover in each output and adds no navigation or dashboard. The compact flow shows two named measurements, automatic crossover region, one delay/polarity recommendation, confidence, cautions and explicit Apply/Close actions. Timing-reference incompatibility and missing phase are textual blocking states. Phase-fit, samples and manual range controls start under `Advanced`. The graph must say **Predicted acoustic sum**, name both sources and distinguish current from suggested summation without relying on colour. Acceptance creates ordinary unsaved delay/polarity values; analysis and rejection change nothing.
