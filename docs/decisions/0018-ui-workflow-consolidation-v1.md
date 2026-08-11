# ADR 0018: UI Workflow Consolidation v1

- Status: Accepted
- Date: 2026-08-11
- Milestone: UI Workflow Consolidation v1

## Context

SpeakerLab's current capabilities are correctly concentrated in Signal Flow but render as one long page with four complete output editors, Measurements, design validation and Deployment Preview. The result exposes repeated controls and graphs simultaneously, while internal feature boundaries are more visible than the common loudspeaker-design sequence. Adding global destinations for every feature would increase rather than reduce fragmentation.

## Decision

Retain the inherited global shell and replace the Signal Flow presentation with **Speaker Design**, organised into three local views: **Design**, **Measurements** and **Review**. These views share one ordinary draft and are outcome-oriented rather than implementation-module navigation.

Design shows a compact output selector and one selected output editor. Use a single-open accordion ordered Output & routing, Crossover, Level & timing, Parametric EQ and Driver Protection. Collapsed sections expose meaningful summaries. Assisted Crossover, Driver alignment and Assisted EQ remain contextual.

Measurements consolidates import, inspect, assign and merge. Detailed provenance/timing fields move under a standard collapsed Advanced disclosure while stale/quality warnings remain visible. Context actions return to the relevant selected-output editor without mutating settings.

Review derives a concise whole-design summary with links to the relevant context. It owns the visible validation summary, Save/backup next steps and Deployment Preview. Deployment defaults to target, simulator state, important blockers and proposed output scope; mapping, evidence, operations, transport/readback and recovery diagnostics move under one Advanced disclosure.

Standardise terminology and status semantics as recorded in `docs/DESIGN_WORKFLOW.md`. Keep existing data models, message contracts, persistence, backup and physical-deployment prohibition unchanged.

## Consequences

The common interface exposes fewer simultaneous controls and graphs without removing capability. Existing specialist functions remain reachable after an additional contextual expansion. Local workspace selection, selected output and disclosure state are browser-only presentation state and are never serialized. Tests must verify reachability, keyboard/semantic behavior, clean defaults, responsive layouts and unchanged ordinary design persistence.

The legacy shell, Vue dependency and extension assembly remain. This is not a framework rewrite, global navigation redesign or physical DSP change.
