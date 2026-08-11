# SpeakerLab UI Inventory

Status: completed before UI Workflow Consolidation v1 implementation.

## Current structure

The assembled Beocreate-derived shell exposes Home, Sound, Sources, Network, General, Interact and Feedback. SpeakerLab's loudspeaker-design functionality is reached through **Sound → Adjustments → Signal Flow**. Setup is a separate guided first-run path. Configuration backup/restore remains under **General → System Tools**.

Signal Flow is one long page: runtime state, Inputs, four complete output cards, Design check, Measurements, Deployment Preview, Save/Discard/Reset. Each output card permanently renders output identity/routing, Crossover, Driver Alignment entry, Parametric EQ, Channel Processing and Driver Protection. This preserves reachability but creates repeated controls, simultaneous graphs and a weak sense of the normal sequence.

## Feature inventory

| Feature | Current place and route | Common use | Frequency | Duplication / terminology | Placement decision |
| --- | --- | --- | --- | --- | --- |
| Setup | Hidden setup screens on first launch | Required initially | Once/rare | “Speaker Preset” is a hardware/profile choice, not a design | Keep separate and guided; link users into Design when finished |
| Inputs | Signal Flow page before output cards | Required context | Frequent review, rare edit | “Inputs” is consistent | Keep in Design as a compact routing-source summary |
| Output configuration | Top of every always-expanded output card | Required | Frequent early, occasional later | “Output channel”, “driver label” and “output” overlap | Canonical **Output** for the path and **Driver** only for role/measurement; make selected-output context primary |
| Signal routing | Output card input selector plus Inputs overview | Required | Frequent early | Same connection is described in two places | Keep Inputs read-only summary; edit routing once inside selected output |
| Crossover | Large permanent section in every output card | Required for multi-way designs | Frequent | “Filter” is correctly subordinate to Crossover | Compact summary; expand for editing; keep **Suggest setup** contextual |
| Assisted Crossover | Inside Crossover | Optional assistance | Occasional | No duplicate destination | Keep contextual; never primary navigation; diagnostics under Advanced |
| Driver alignment | Separate entry immediately after each Crossover | Optional but common in measured designs | Occasional | “Alignment”, “phase/time alignment” vary | Canonical **Driver alignment**; keep contextual to Crossover/Level & timing and collapsed until invoked |
| Gain | Permanent Channel Processing panel | Common | Frequent | “Gain” and “level” overlap | Canonical section **Level & timing**, control **Level (dB)**; compact summary |
| Delay | Permanent Channel Processing panel | Common | Frequent | Delay/timing terms are consistent | Keep under Level & timing with milliseconds visible |
| Polarity | Permanent Channel Processing panel | Common | Occasional | Phase and polarity must remain distinct | Keep **Polarity** under Level & timing; never rename it phase |
| Parametric EQ | Large permanent section and graph per output | Common | Frequent | Legacy separate Equaliser extension can look duplicative | Canonical **Parametric EQ** in Speaker Design; compact summary and one graph only when expanded |
| Assisted EQ | Inside Parametric EQ | Optional assistance | Occasional | Correctly contextual | Keep contextual as **Suggest EQ**; optimiser detail under Advanced |
| Measurement import | Long Measurements section after all outputs | Common for measured workflows | Occasional | “response” and “measurement” sometimes overlap | Dedicated Measurements workspace; primary action **Import measurement** |
| Measurement inspect / assign | Same Measurements section | Common after import | Occasional | Output assignment is consistent | Keep selected-measurement summary, graph and assignment together |
| Measurement merge | Button and embedded form inside Measurements | Specialist contextual action | Rare | “Merge Measurements” title case differs | Use **Merge measurements**; keep contextual and collapsed until invoked |
| Measurement alignment metadata | Timing reference controls in measurement detail | Specialist prerequisite | Rare | Can be confused with Driver alignment | Put provenance/timing metadata under Advanced, but keep incompatibility warnings visible |
| Driver Protection | Large permanent panel per output | Important safety context | Occasional | “limiter”, “protection” and “safety” risk overclaim | Canonical **Driver Protection**; compact status, visible missing/critical warning, detailed assumptions and simulator under Advanced |
| Design check | Separate list after output cards | Required feedback | Frequent | “validation”, “warning”, “ready” vary | Fold into Design Review and persistent concise status; errors/warnings remain live and linked |
| Simulator | Controls inside Deployment Preview | Developer/review aid | Occasional | “Apply” can resemble physical deployment | Keep **Apply to simulator** explicitly simulated; group with Deployment Preview |
| Deployment Preview | Large permanent section below Measurements | Review step | Occasional | Prepared/compiled/matched/verified proliferate | Move into Review; primary **Preview deployment**; default shows target, simulated state, blockers and proposed scope |
| Mapping readiness | Permanent Deployment Preview region | Specialist diagnostic | Rare | Many evidence/confidence states | Advanced only; safety blockers stay visible outside disclosure |
| Transport/readback/recovery | Several readiness regions and actions | Specialist diagnostic | Rare | Status vocabulary is dense | Advanced only, retaining exact blocker and recovery language |
| Technical operations | Existing details disclosure | Engineering diagnostic | Rare | Appropriate technical terminology | Retain under unified Advanced disclosure |
| Backup/restore | General → System Tools | Important lifecycle action | Occasional | Separate from Save and Review | Keep authoritative workflow in System Tools; add contextual Review link/next step, no duplicate form |
| Branding | SpeakerLab title, mark, setup/About; technical Beocreate target references | Always visible | Continuous | Remaining Beocreate terms are mostly hardware/protocol/history | Preserve SpeakerLab identity; keep legitimate current-Beocreate target and attribution references |

## Graph inventory

- Electrical crossover + EQ: currently repeated once per output; should appear only for the selected output and expanded Crossover/EQ question.
- Assisted Crossover: contextual current-versus-suggested graph; keep only while suggestions are open.
- Driver alignment: contextual source/sum graph; keep only while analysis is open.
- Assisted EQ: contextual measured/target/predicted graph; keep only while suggestions are open.
- Selected measurement: one appropriate primary graph in Measurements.
- Measurement merge: one contextual preview while merge is active.
- Protection simulator: textual first; specialist simulation detail under Advanced.
- Deployment per-output comparisons: summaries by default; mapping/operation detail under Advanced.

No permanent multi-graph dashboard is justified.

## Consolidation findings

The global shell does not need new top-level destinations. Signal Flow should become **Speaker Design** with three local workspace views: **Design**, **Measurements** and **Review**. These describe user outcomes rather than implementation modules and keep every assisted feature contextual.

Within Design, one selected output should expose an ordered accordion: **Output & routing**, **Crossover**, **Level & timing**, **Parametric EQ**, **Driver Protection**. Collapsed summaries must carry meaningful state. Measurements owns import, inspect, assign and contextual merge. Review owns the concise whole-design check, Save/backup next steps and simplified Deployment Preview.

Canonical status semantics:

- Design: **Saved**, **Unsaved**, **Error**.
- Measurement: **Valid**, **Warning**, **Stale**.
- Analysis output: **Predicted**.
- Deployment: **Simulated**, **Blocked**, and only explicitly qualified physical mapping verification.

Required safety warnings, validation errors and physical-deployment blockers remain visible. Algorithm metrics, provenance internals, mapping confidence, compiler operations, transport/readback and recovery detail belong under the shared collapsed **Advanced** pattern.
