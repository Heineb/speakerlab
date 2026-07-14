# SpeakerLab UI Principles

## Baseline

The existing Beocreate 2 browser interface is SpeakerLab's product baseline. M0 does not redesign it. The current architecture assembles one view from extension markup, scripts and styles, with client/server messages over the `beocreate` WebSocket protocol. Beocreate Connect is a separate Electron discovery/launcher utility, not the loudspeaker-control UI itself.

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
- Design loading, empty, disconnected, partial-failure and recovery states as first-class states.
- Keep setup guided. A user should not need to understand the underlying DSP to commission an existing Beocreate system.

## Safety feedback

UI acknowledgement is not proof that a DSP write succeeded. Safety-sensitive workflows must distinguish request sent, transport accepted, state verified and rollback/recovery outcomes once those backend capabilities exist. Until then, the UI must not overstate success.

Preset previews should continue to disclose unsupported content and fallback DSP requirements. Future recovery work must protect the last-known-good configuration and present a clear way back.

## Change rules

- Add or update end-to-end tests for navigation and important workflows.
- Characterize the existing UI before changing legacy behaviour.
- Do not replace the UI framework solely because it is old.
- Do not change visual identity or main navigation without a documented usability need.
- Keep refactoring, dependency upgrades and user-visible behaviour changes in separate pull requests.
- Verify at representative narrow and wide viewport sizes and in both colour schemes.

## Accessibility baseline to establish

The repository has no automated accessibility checks. M0/M1 should record keyboard navigation, focus visibility, semantic labels, contrast, reduced-motion behaviour and screen-reader announcements for status/error changes before substantial UI work. Accessibility fixes should preserve the established visual and navigation model.
