# Measurement-Assisted EQ Suggestions v1

## Product and safety boundary

Assisted EQ analyses one assigned imported or derived magnitude response against an explicit Flat or Gentle downward tilt target. It returns at most five human-reviewed peaking-EQ suggestions by default. It is not automatic room correction, acoustic optimisation or a guarantee of improved perceived sound.

Suggestions are transient. Rejecting them changes nothing. Accepting selected suggestions creates ordinary enabled Parametric EQ bands in the existing unsaved Signal Flow draft; normal validation, stable IDs, band capacity, revision conflicts, Discard, optional pre-save undo and Save apply. The authoritative measurement points and integrity hash never change. No path writes physical DSP hardware.

## Eligibility and active range

The selected measurement must be assigned to the output, contain at least 12 valid integrity-protected points and use the supported imported or derived model. A stale derived merge, corrupt source, invalid source or unsupported assignment is blocked. In-room, listening-position, unknown, sparse, narrow, noisy and derived sources produce explicit cautions.

The default range is the intersection of measurement coverage, 10–20,000 Hz, output-role guidance and configured crossover. A tweeter starts no lower than 800 Hz; woofer and subwoofer ranges receive conservative upper bounds. Enabled high-pass and low-pass cutoffs move the correction boundary inside the intended passband by a factor of 1.1. Derived merge transition regions are visible and are never candidate centres. The active range is shown before acceptance and may be narrowed under `Advanced`, never extended outside usable coverage.

## Deterministic analysis

Algorithm `speakerlab-assisted-eq-v1` performs these steps for identical source, design, target and options:

1. Interpolate magnitude onto 121 logarithmically spaced points without extrapolation. Exact duplicate frequencies use their median.
2. Apply analysis-only fractional-octave smoothing. The default is 1/6 octave; `Advanced` offers none, 1/12, 1/6 and 1/3 octave. A raised-cosine log-frequency window is used. Raw source points remain unchanged.
3. Add the simulated transfer of existing enabled PEQ by default. `Advanced` can analyse without current EQ; existing bands are never removed or rewritten.
4. Derive the target reference from the median current estimated level unless the user enters a reference. Flat uses zero tilt. Gentle downward tilt defaults to −1 dB/octave referenced to 1 kHz.
5. Find contiguous broad errors of at least 1.5 dB for peaks or 2 dB for dips. Candidate centres use the largest error in each region. Bandwidth maps deterministically to Q 0.35–4.5.
6. Prefer cuts. Cuts are limited to −6 dB. Boost defaults to at most +3 dB and can be set no higher than +6 dB under `Advanced`.
7. Reject deep narrow dips below −6 dB and narrower than 0.35 octave as likely cancellations rather than attempting large boost.
8. Simulate each peaking candidate with the established 48 kHz RBJ model. Retain it only when the objective improves by at least 0.2, and stop at the configured limit or remaining standard PEQ capacity.

The objective is mean squared target error plus a 0.2 cost per filter, a high-Q penalty above Q 2 and a strong squared positive-boost penalty. The UI explains the result but keeps raw objective values and diagnostics under `Advanced`.

## Prediction and headroom

The preview labels four distinct curves: Measured, Target, Current estimated response and Predicted with suggestions. Prediction adds simulated electrical PEQ magnitude to preserved measured magnitude only. It is not a new measurement, phase-aware acoustic sum, enclosure/room model or audible result.

Every suggestion records a stable temporary ID, peaking type, frequency, gain, Q, reason, expected local improvement, confidence, headroom effect, source ID/hash, target, active range and algorithm version. Positive correction reports voltage-demand/headroom impact. Existing significant boost, large proposed boost, high Q and configured Driver Protection limits produce warnings; channel gain, crossover, limiter and protection settings are never changed automatically. The protection model remains an estimate and does not guarantee safety.

## Deliberate exclusions

V1 has no shelves, crossover suggestions, all-pass, FIR, delay, polarity, limiter changes, arbitrary target editor, ML, automatic save, automatic gain compensation or physical Apply. It does not correct time/phase, directivity, room modes, diffraction, thermal behavior or excursion. Quality still depends on measurement conditions, calibration, gating, source provenance and the validity of combining measurement magnitude with simulated electrical filters.

Assisted Crossover is a separate contextual workflow. It includes current EQ in its prediction but never changes EQ bands. Accepting a crossover suggestion invalidates open EQ-suggestion previews because their crossover/processing context changed; recalculate them before review.
