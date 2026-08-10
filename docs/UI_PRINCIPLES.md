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

## Accessibility baseline to establish

Focused browser accessibility smoke checks now protect labelled native channel-processing controls, keyboard editing order, focus preservation across reactive rendering, live validation and semantic disabled Save state. Full legacy-navigation traversal, automated screen-reader output, contrast, reduced-motion behavior and visual regression remain to be established. Accessibility fixes should preserve the established visual and navigation model.

Deployment previews must lead with target identity and plain-language state, keep raw registers in an optional technical disclosure, distinguish requested/compiled/actual values, and never use “Active” or “Verified” without “simulator” or “physical” context. Stale state, errors and warnings must remain textual and live-announced; actions must be native buttons with truthful disabled state.

Readiness must be textual, distinguish strong evidence from verification, name exact blockers and never imply that transmitted or simulated values were physically applied. Mapping, transport and recovery summaries must stack at narrow widths without requiring a raw-register table.

Evidence status must distinguish repository-backed, unreviewed physical and reviewed physical sources. Provenance disclosures must name the schema/revision and review status, state read-only versus write-unverified conclusions in text, omit device identifiers and remain keyboard accessible. Evidence collection alone must never display physical readiness.

Parametric EQ follows the same progressive-disclosure rule. Compact band rows expose selection and enabled/bypassed state in text and semantics; editors use loudspeaker terms and explicitly distinguish peaking Q from RBJ shelf slope S. The graph always retains the combined result, distinguishes EQ contribution without relying on colour, and has a textual electrical/headroom summary. Destructive whole-output reset requires confirmation. Controls stack at narrow widths and remain native keyboard controls.

Measurement import follows preview then confirm. Detection, units, point count, range, phase availability and calibration uncertainty remain textual. Measured response and relative electrical overlays use distinct labels and scales; they never imply an acoustic sum, calibration or automatic correction. File selection, assignment and removal remain keyboard reachable at narrow widths.
