# SpeakerLab User Guide

SpeakerLab keeps loudspeaker work in **Speaker Design** with three local views: **Design**, **Measurements** and **Review**. All three operate on the same draft. **Save design** persists it; Save never means physical deployment.

New users should begin with [Getting Started](GETTING_STARTED.md).

## Designing a speaker

In **Design**, choose one of four outputs. Only the selected output and one expanded section are shown.

- **Output & routing** enables the path, names its driver, assigns role/side and routes an input.
- **Crossover** edits high-pass and low-pass filters. **Suggest setup** and **Align drivers** are contextual, optional assistance.
- **Level & timing** contains Level, Delay and Polarity. Phase and polarity are not synonyms.
- **Parametric EQ** contains ordinary peaking and shelf bands. **Suggest EQ** remains contextual.
- **Driver Protection** records sourced electrical assumptions. Required warnings remain visible; detailed limits and the normalized simulator are under **Advanced**.

Collapsed summaries show useful current values. Graphs answer the selected editing question and are electrical or predicted unless explicitly labelled measured.

See [Design Workflow](DESIGN_WORKFLOW.md) for the canonical hierarchy and terminology.

## Working with measurements

Open **Measurements** and choose **Import measurement**. Inspect detected columns, units, frequency range and phase availability before confirming. Name, classify and assign the response, then update the draft. Imported points are preserved and are never corrected automatically.

The selected measurement keeps metadata, assignment, timing reference, reference group, graph and contextual actions together. Declare a shared timing basis only when the captures genuinely share it. Source provenance and integrity are under **Advanced**; material validation and stale-state warnings remain visible.

For compatible nearfield/farfield observations, choose **Merge measurements**, review overlap and the suggested level offset, preview the transition, then save a **derived response**. Sources remain unchanged. A derived merge is magnitude-only and cannot support phase/time alignment. See [Measurement Import](MEASUREMENT_IMPORT.md) and [Measurement Merge](MEASUREMENT_MERGE.md).

## Crossover and driver alignment

**Suggest setup** compares up to three conservative crossover alternatives for two supported neighboring ways. It shows the current crossover baseline and labels results as phase-aware or magnitude-based. Explicit Apply creates ordinary unsaved crossover and any shown timing values; it does not change measurements, EQ or protection. See [Assisted Crossover](ASSISTED_CROSSOVER.md).

**Align drivers** requires phase-bearing measurements for different outputs, crossover overlap and an honest compatible timing-reference group. Review delay, polarity, confidence, warnings and the predicted complex sum. Apply creates ordinary unsaved Delay/Polarity values. Unknown timing, missing phase, stale derived responses and unsafe fits are blocked. See [Phase/Time Alignment](PHASE_ALIGNMENT.md).

## Parametric EQ and assisted design

Parametric EQ bands remain normal editable design fields. Watch the textual headroom estimate and use reset deliberately.

**Suggest EQ** uses an assigned response and a simple target to propose bounded peaking filters. Review Measured, Target, Current and Predicted curves, select suitable suggestions and choose **Accept selected suggestions**. Reject changes nothing. Accepted suggestions become ordinary unsaved bands. This is not room correction or a guarantee of audible improvement. See [Assisted EQ](ASSISTED_EQ.md).

## Driver Protection

Enter only manufacturer or measured driver/amplifier limits you can justify. SpeakerLab exposes conservative electrical estimates, headroom interactions and an optional normalized limiter sequence. It does not model excursion or thermal behavior, cannot guarantee protection, and does not map a limiter to physical hardware. See [Driver Protection](DRIVER_PROTECTION.md).

## Review, backup and Deployment Preview

**Review** derives a concise speaker-wide summary from the ordinary draft: configured/routed outputs, crossover coverage, non-default Level & timing, EQ, protection, measurements, errors, warnings and Saved/Unsaved/Error state. Its actions return to the relevant context; Review is not a separate stored model.

Use **General → System Tools → Configuration Backup & Restore** to export the complete configuration. Restore always shows a preview before confirmation.

**Preview deployment** compiles the current design for the current-Beocreate target. The primary view shows target, simulator state, blockers and what would be applied. **Advanced** contains mapping confidence, evidence provenance, compiler operations, transport/readback and recovery detail. Apply/read/compare actions affect only the simulator. No physical Apply action exists.

## Advanced and diagnostics

The standard **Advanced** disclosure starts collapsed and never changes the draft merely by opening. It holds algorithm options, confidence and raw metrics, provenance, mapping, compiler and transport detail. Validation errors, important safety warnings, stale measurements and physical-deployment blockers never depend on Advanced being open.

For engineering details, see [Testing](TESTING.md), [Architecture](ARCHITECTURE.md), [Current DSP Mapping](CURRENT_BEOCREATE_DSP_MAPPING.md) and [Physical Apply Blockers](PHYSICAL_APPLY_BLOCKERS.md).
