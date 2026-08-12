# ADR 0014: Driver Protection Model v1

- Status: Accepted
- Date: 2026-08-10
- Milestone: M11 – Headroom and limiter panel

## Context

SpeakerLab needs portable driver and amplifier limit metadata plus deterministic limiter-design behavior. The existing Beocreate `volume-limit` extension controls input-source level and does not establish a per-output limiter, voltage threshold, attack, release or readback mapping.

## Decision

Store `org.speakerlab.driver-protection` version 1 inside the atomic signal-flow design. Volts peak is the authoritative limiter threshold. Driver power and impedance derive explanatory sine-wave RMS/peak values. A visible −12 to 0 dB safety margin modifies the raw threshold. Headroom uses the existing crossover/EQ response grid and channel gain.

Use a deterministic first-order normalized level-envelope simulator when amplifier maximum peak voltage supplies an explicit 0 dBFS reference assumption. Compiler output may contain simulator-only diagnostic operations, but no protection value receives a physical address or write authorization. Current-Beocreate physical mapping remains unknown and readback unavailable.

## Consequences

Protection settings are revisioned, validated, portable, recoverable and visible in simulator/deployment preview without overstating hardware capability. Existing designs migrate in memory to disabled defaults. Thermal, excursion, acoustic, multiband, lookahead, automatic correction and physical application remain outside v1.
