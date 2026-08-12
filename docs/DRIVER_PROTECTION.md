# Limiter and Driver Protection Foundation v1

## Purpose and safety boundary

Driver Protection is a design and simulator workflow for reasoning about user-entered electrical limits. It does not guarantee driver safety, thermal protection, excursion protection, acoustic SPL, clipping prevention or damage prevention. Manufacturer ratings are metadata supplied by the user, not certified safe limits.

The feature is stored inside the complete `org.speakerlab.signal-flow` version 1 design as `org.speakerlab.driver-protection` version 1. Existing designs without the section receive disabled conservative defaults in memory and change only after a deliberate save.

## Evidence classification

| Capability | Status |
| --- | --- |
| 48 kHz design/sample-rate context | Strong repository evidence |
| Existing `volume-limit` source-level registers | Strong repository evidence; not a per-output limiter |
| Per-output limiter threshold | Unsupported/unverified |
| Per-output attack and release | Unsupported/unverified |
| Voltage-to-DSP threshold conversion | Unresolved |
| Physical limiter readback | Unavailable |
| Synthetic level-envelope simulation | Verified by hardware-free tests |
| Physical limiter write/apply | Prohibited |

`volume-limit` writes linear level controls for Raspberry Pi, SPDIF and I2S2 inputs. It is not reused or presented as driver protection. No limiter, compressor, threshold, attack, release or RMS block is identified in the shipped current-Beocreate XML metadata.

## Stored fields and units

Each output records:

- optional driver manufacturer, model and notes;
- nominal impedance in ohms;
- continuous and optional short-term power in watts;
- amplifier maximum RMS and peak voltage, optional gain in dB and channel assignment;
- explicit peak-voltage limiter enabled state and mode;
- raw threshold in volts peak and optional average limit in volts RMS;
- visible safety margin in dB;
- attack and release in milliseconds;
- user-entered source labels for driver, amplifier and limiter data.

No unqualified `power` or `voltage` field is stored.

## Electrical calculations

Pure functions use:

- `Vrms = sqrt(P × R)`
- `P = Vrms² / R`
- `Vpeak = Vrms × sqrt(2)`
- voltage ratio `= 10^(dB/20)`
- voltage dB `= 20 × log10(ratio)`

The safety margin is applied visibly to the raw peak threshold with the voltage-ratio formula. Both raw and post-margin thresholds are shown. These conversions describe a sine-wave electrical relationship; music, reactive impedance, amplifier behavior and driver temperature/excursion differ.

## Headroom and crossover interaction

The server evaluates the existing 121-point logarithmic crossover and Parametric EQ grid. The summary reports channel gain, maximum positive EQ contribution, their potential net boost and the maximum combined crossover/EQ/channel-gain value on that grid. Crossover attenuation is descriptive and is never treated as guaranteed protection. Tweeters without a high-pass and woofers/subwoofers without an expected low-pass receive textual design-risk warnings; settings are not altered automatically.

A normalized simulator threshold is available only when the user enters amplifier maximum peak voltage. It uses the explicit assumption that this value represents the unclipped 0 dBFS output reference. Optional amplifier gain alone cannot resolve the mapping.

## Limiter simulator

The simulator consumes `{levelDbfs, durationMs}` steps and produces no audio. For each step it calculates required gain reduction above the normalized threshold, then moves the current reduction toward that target using:

`coefficient = 1 - exp(-duration / timeConstant)`

Attack is used while required reduction increases; release is used while it decreases. Each result reports input level, required and applied reduction, duration and output level. This deterministic first-order level-envelope model demonstrates below-threshold behavior, threshold crossing, attack, sustained limiting, overshoot and release. It is not a model of every property of a SigmaDSP limiter or real program material.

## Compiler and deployment preview

The compiler includes configured and derived protection summaries per output. When normalized simulation is possible it emits a `simulator-protection` diagnostic operation and expected simulator readback. The operation has no numeric hardware target and `physicalWriteAllowed: false`. All configured protection fields are listed as unsupported physical design elements. Mapping confidence is unknown, readback unavailable, and physical apply remains blocked by limiter mapping plus every pre-existing transport, mute, identity and rollback prerequisite.

## Persistence, backup and recovery

Protection participates in complete-design validation, canonical revision hashing, atomic save, readback verification, rollback, backup export/import validation, restore preview and last-known-good restore. Warnings allow deliberate save; validation errors block the entire design save. Restore does not deploy settings to the DSP, and a stale browser draft cannot silently overwrite a restored revision.

## Deliberate exclusions

V1 does not implement thermal voice-coil simulation, excursion or Thiele/Small modeling, frequency-dependent or multiband limiting, compressor behavior, predictive lookahead, SPL prediction, automatic gain/EQ/crossover changes, physical DSP deployment or future-hardware abstractions.
