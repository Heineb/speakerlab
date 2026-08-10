# Measurement Alignment and Nearfield/Farfield Merge Foundation v1

SpeakerLab can create one derived magnitude response from a low-frequency source, normally nearfield, and a high-frequency source, normally farfield or gated. Imported source points, metadata and integrity hashes remain unchanged.

Version 1 accepts directly imported REW text and FRD measurements using hertz and decibels. Nearfield plus farfield/gated is the intended pairing. Unknown, room and other imported types remain selectable only with explicit warnings; a derived merge cannot be used as another v1 merge source.

## Alignment

The suggested offset is the median of `high magnitude − low magnitude` at the union of source frequencies inside their overlap, after deterministic interpolation. The median absolute deviation from that offset is reported as overlap variation. The user sees the suggestion and must explicitly copy or enter an offset; it is never applied invisibly and performs no baffle-step or geometry correction.

## Interpolation and blend

Magnitude is linearly interpolated against natural-log frequency. Exact duplicate frequencies use their median value. Interpolation never extrapolates beyond a source range.

The stored transition width is octaves. Boundaries are `centre / 2^(width/2)` and `centre × 2^(width/2)`. Within the region, the high-source weight is `0.5 − 0.5 cos(πt)` for log-frequency position `t`; the low weight is `1 − high`. Below and above the region the applicable source has unit weight. The result grid is the sorted union of source frequencies across the valid low-to-high coverage.

## Phase policy

Version 1 never interpolates or averages wrapped phase and never generates minimum phase. When both sources provide phase, compatibility is summarized only at exact common frequencies using the shortest wrapped difference in ±180°. The derived response is always magnitude-only.

## Persistence and dependencies

Each derived response stores a versioned recipe, stable source IDs and hashes, algorithm identifiers, transition, manual offset, name/notes, provenance and its own point hash. Source rename is safe because identity uses IDs. Changed source hashes make a merge stale until regeneration. Source removal is blocked while a dependent merge exists. Removing the derived response first is reversible through the existing draft and backup/restore workflow.

Merge recipes and derived points live in `signal-flow.json`, sharing optimistic concurrency, atomic write/readback, rollback and portable backup/restore. No merge data enters DSP compilation, EQ generation or crossover editing.

Backup export/import validates the complete source/recipe/result graph and both source and derived hashes. A missing source or corrupt derived payload is rejected. Restore preview identifies a changed `signal-flow.json`; confirmed restore and rollback replace the complete merge relationship as one settings item. The browser journey proves export, edit, preview, restore, restart and integrity relationship recovery without absolute paths.

## Visible workflow

The Measurements region exposes labelled native source selectors with type, assignment, coverage and phase availability. Review shows overlap, selected and suggested offsets, variation, usable point count, phase compatibility, merge centre and transition boundaries. The graph separately labels original low/high observations, level-adjusted low preview and derived result. Derived measurements can be assigned to an output and inspected beside crossover, EQ and combined electrical overlays, which remain explicitly separate rather than an acoustic sum.
