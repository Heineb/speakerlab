# SpeakerLab Design Workflow

SpeakerLab keeps the complete loudspeaker workflow inside **Speaker Design**. Three local views organise the work without adding global navigation:

1. **Design** — configure outputs and routing, then work through Crossover, Level & timing, Parametric EQ and Driver Protection for one selected output.
2. **Measurements** — import, inspect and assign measurements; merge compatible observations; return to contextual crossover, alignment or EQ assistance.
3. **Review** — check the whole design, resolve errors/warnings, save, back up and preview deployment.

The views are not separate configuration stores. They edit or review the same ordinary design draft.

## Design

Choose an output from the compact output list. Each item names its role, routed input and enabled state. Only the selected output editor is shown.

The editor follows the normal processing order:

- **Output & routing**
- **Crossover**
- **Level & timing**
- **Parametric EQ**
- **Driver Protection**

One section is expanded at a time. Collapsed summaries state the current design instead of hiding it: crossover frequencies/family, level/delay/polarity, enabled EQ count and protection configuration. Missing crossover, EQ and protection states include a useful next step.

**Suggest setup**, **Driver alignment** and **Suggest EQ** remain contextual. They create no parallel persistent state: explicit acceptance converts a result to ordinary unsaved fields.

## Measurements

**Import measurement** is the primary action. The selected measurement keeps inspection, assignment and its graph together. **Merge measurements** appears as a contextual secondary action. Source integrity, stale state and material quality warnings remain visible; detailed provenance and timing metadata use `Advanced`.

Assigned measurements offer contextual routes back to Crossover, Driver alignment and Parametric EQ. These actions navigate and open the relevant editor; they do not apply suggestions or change the design.

## Review

Design Review is a concise derived summary, not a new stored model or engineering dashboard. It reports:

- configured and routed outputs;
- crossover coverage;
- non-default level/timing state;
- enabled Parametric EQ bands;
- Driver Protection configuration;
- measurement availability;
- errors and warnings;
- Saved, Unsaved or Error state;
- deployment as Simulated or Blocked.

Each summary links back to the relevant context. **Save design** remains the authoritative primary action. Backup/restore remains in System Tools and is linked rather than duplicated.

Deployment Preview leads with target, simulator status, blockers and proposed per-output scope. Mapping confidence, evidence provenance, compiler operations, target identity detail, transport/readback and recovery diagnostics remain reachable through one collapsed **Advanced** disclosure. Physical deployment remains unavailable.

## Canonical language

- **Output** is the hardware/design path. **Driver** describes its acoustic role or measured transducer.
- **Crossover** contains high-pass and low-pass filters.
- **Level & timing** contains Level, Delay and Polarity. Phase and polarity are not synonyms.
- **Driver alignment** is the measurement-assisted phase/time workflow.
- **Measurement** is an imported observation; **derived response** is a merged result.
- **Driver Protection** contains user-entered electrical limits and limiter assumptions.
- **Predicted** describes model output. **Measured** describes imported observations. **Simulated** describes local DSP state.
- Design state is **Saved**, **Unsaved** or **Error**. Measurement state is **Valid**, **Warning** or **Stale**. Deployment is **Simulated** or **Blocked** unless a physical claim is explicitly qualified.

## Disclosure and safety

All `Advanced` disclosures start collapsed, expose `aria-expanded`, preserve the current workspace/output context and do not change the authoritative draft merely by opening. Advanced holds diagnostics, algorithm settings, confidence metrics, provenance, optimiser scores, mapping, compiler and transport detail.

Validation errors, important warnings, stale measurements, protection limitations and physical-deployment blockers never depend on Advanced being open.
