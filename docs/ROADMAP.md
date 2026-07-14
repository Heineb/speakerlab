# SpeakerLab Roadmap

## Product direction

SpeakerLab is an incremental, open-source continuation of the existing Beocreate software.

The current product target is the existing Beocreate hardware platform.

The project will preserve Beocreate's intuitive user interface and gradually improve reliability, maintainability and loudspeaker-design functionality.

Future hardware platforms are explicitly outside the current roadmap. Architectural abstractions must be justified by current Beocreate requirements, testing needs or clearly identified defects.

---

# Phase 1 — Stabilise the foundation

## M0 — Establish a reproducible baseline

### Goals

* Understand the existing application before changing it.
* Document the current runtime and build architecture.
* Make development reproducible on supported systems.
* Establish the current behaviour as a testable baseline.

### Work

* Document installation, build and startup commands.
* Identify supported and historically assumed Node.js versions.
* Document the Electron application and server processes.
* Map extensions, configuration storage and DSP communication.
* Record current dependency problems.
* Identify Apple Silicon compatibility issues.
* Add repository-level development instructions.
* Add continuous integration with the parts of the project that can currently run.
* Add characterization tests around selected high-risk existing behaviour.

### Non-goals

* No user-visible features.
* No broad dependency upgrade.
* No DSP-program changes.
* No UI redesign.
* No major folder restructuring.

### Completion criteria

* A clean checkout can be prepared using documented commands.
* Existing runnable tests execute through one documented command.
* CI executes the available verification steps.
* Important unknowns are recorded.
* The first safe modernization task has been identified.

---

## M1 — Establish the test framework

### Goals

* Make ordinary development possible without physical Beocreate hardware.
* Protect existing behaviour before refactoring.
* Detect regressions in every pull request.

### Work

* Select and configure the unit-test framework appropriate to the current code.
* Add characterization tests for:

  * preset loading
  * configuration serialization
  * DSP parameter conversion
  * channel selection
  * extension loading
  * default settings
* Add a simulated Beocreate DSP transport.
* Add fixtures representing successful, disconnected and invalid hardware states.
* Add contract tests between the existing application and DSP communication layer.
* Add test coverage reporting.
* Define separate commands for:

  * unit tests
  * integration tests
  * UI tests
  * hardware-in-the-loop tests
  * full verification
* Ensure the normal test suite does not require physical hardware.

### Simulator scope

The simulator represents the current Beocreate hardware and protocol.

It is not a generic abstraction for future hardware.

### Completion criteria

* Core configuration logic is tested without hardware.
* DSP writes can be captured and verified.
* Common hardware errors can be reproduced deterministically.
* Pull requests cannot be merged when required tests fail.

---

## M2 — Modernise Node.js, Electron and dependencies

### Goals

* Make the application buildable and maintainable with currently supported tooling.
* Remove known security and compatibility problems.
* Preserve existing behaviour and appearance.

### Approach

Modernisation must be divided into small upgrade waves.

Do not update all dependencies in one pull request.

### Upgrade sequence

1. Pin and document the currently working runtime.
2. Add tests around affected behaviour.
3. Upgrade development-only tooling.
4. Upgrade patch and minor dependencies.
5. Upgrade Node.js one supported step at a time.
6. Upgrade Electron separately from the server runtime.
7. Address major framework or API changes individually.
8. Remove obsolete compatibility code only after the new baseline is stable.

### Requirements for every upgrade

* Existing tests remain green.
* A clean install is tested.
* Startup is tested.
* Relevant UI flows are tested.
* Packaging is tested when Electron is affected.
* Behaviour changes are documented.
* Dependency upgrades are not mixed with unrelated feature work.

### Completion criteria

* Supported runtime versions are documented and reproducible.
* The application installs and starts on Apple Silicon.
* CI uses the supported runtime.
* Known critical dependency vulnerabilities have been addressed.
* Existing UI and DSP behaviour remain compatible.

---

## M3 — Configuration export, import and recovery

### Goals

* Make complete system configurations portable and recoverable.
* Prevent users from losing a working loudspeaker setup.
* Establish a safe foundation for later editing tools.

### Work

* Identify all configuration sources.
* Define a versioned export format.
* Export:

  * system settings
  * sound settings
  * DSP parameters
  * presets
  * listening modes
  * channel roles
  * applicable metadata
* Validate imports before applying them.
* Preview import contents and conflicts.
* Support automatic format migration.
* Use atomic writes.
* Preserve a last-known-good configuration.
* Add undo or rollback when configuration application fails.
* Add malformed and partial backup fixtures.
* Add round-trip tests:

  * export
  * clear state
  * import
  * verify equivalent state

### Completion criteria

* A full configuration can be exported and restored.
* Invalid imports cannot damage the active configuration.
* Existing configurations remain compatible.
* Recovery paths are documented and tested.

---

## M4 — Safe DSP deployment

### Goals

* Prevent invalid or incomplete DSP deployments.
* Verify that a deployment reached the DSP correctly.
* Recover automatically from failed deployments.

### Work

* Document the current DSP deployment sequence.
* Validate DSP programs and parameter metadata before deployment.
* Back up the last working DSP configuration.
* Upload to a temporary or staged state where possible.
* Verify written data through readback, checksum or equivalent verification.
* Add deployment health checks.
* Roll back after verification or startup failure.
* Provide a known-good rescue configuration.
* Add safe mute behaviour during deployment.
* Log deployment state and failure reasons.
* Simulate:

  * disconnected DSP
  * interrupted deployment
  * invalid parameter map
  * readback mismatch
  * restart after partial deployment

### Completion criteria

* Failed deployment cannot silently leave the loudspeaker in an unknown state.
* The previous working configuration can be restored.
* Deployment failures produce useful diagnostics.
* Safety-sensitive paths are covered by automated tests.

---

## M5 — Document the existing API

### Goals

* Make the current system understandable to contributors.
* Establish stable contracts before adding large new features.
* Reduce accidental coupling between UI, extensions and DSP control.

### Work

* Document existing server endpoints and socket messages.
* Document extension lifecycle and events.
* Document configuration objects.
* Document DSP-control functions.
* Document error behaviour.
* Add request and response examples.
* Add schema validation where practical.
* Add contract tests for stable API behaviour.
* Clearly mark:

  * public interfaces
  * internal interfaces
  * legacy interfaces
  * unstable interfaces

### Completion criteria

* Contributors can understand the current API without reverse engineering the complete application.
* Important contracts have automated tests.
* Breaking API changes require explicit migration notes.

---

# Phase 2 — Turn Beocreate into a serious loudspeaker tool

## M6 — Stereo-pair management

### Goals

Allow two Beocreate devices to behave as one coherent stereo loudspeaker system.

### Work

* Pair two devices.
* Assign left and right roles.
* Apply linked settings.
* Support mirrored routing.
* Retain independent trim where needed.
* Synchronise presets and listening modes.
* Show connection and synchronisation status.
* Handle one missing device gracefully.
* Test using two simulated Beocreate devices.

### UX principle

Pairing should feel like configuring one loudspeaker system, not administering two computers.

---

## M7 — Signal-flow and channel-routing editor

### Goals

Make the current signal path visible and editable without exposing raw DSP implementation details.

### Work

* Display inputs, processing and four amplifier outputs.
* Assign meaningful output roles such as woofer, midrange and tweeter.
* Support input-channel selection.
* Show mute, polarity, gain and delay.
* Validate dangerous or incomplete routing.
* Provide safe templates for common systems.
* Keep the normal view simple.
* Place unrestricted routing in an optional advanced mode.

---

## M8 — Crossover editor

### Goals

Provide a dedicated loudspeaker crossover workflow instead of requiring users to construct crossovers from generic parametric filters.

### Work

* High-pass and low-pass filters.
* Common Butterworth, Bessel and Linkwitz-Riley alignments.
* Supported filter orders.
* Gain trim.
* Polarity.
* Delay.
* All-pass filters where supported.
* Graphical electrical response.
* Combined simulated response.
* Coefficient validation.
* Golden coefficient tests.
* Safe parameter ranges.
* Simple and advanced views.

### UX principle

The primary controls should use loudspeaker terminology rather than biquad terminology.

---

## M9 — Measurement import

### Goals

Allow existing measurement workflows to feed directly into SpeakerLab.

### Initial formats

* REW text export
* FRD
* ZMA
* documented CSV format

### Work

* File validation.
* Unit and frequency detection.
* Measurement metadata.
* Magnitude and phase display.
* Target-curve overlay.
* Multiple measurements.
* Clear distinction between measured and simulated data.
* Export for use in external tools.
* Fixtures and parser tests for valid and malformed files.

### Non-goal

Automatic filter optimisation is not part of this milestone.

---

## M10 — Delay, all-pass and polarity workflow

### Goals

Make acoustic alignment understandable and safe.

### Work

* Delay in milliseconds, samples and distance.
* Polarity inversion.
* All-pass filters.
* Phase display.
* Relative alignment between drivers.
* Automatic compensation for processing latency where possible.
* Warnings for inconsistent sample rates or excessive delays.
* Unit tests for conversions and coefficient generation.

This functionality may share components with the crossover editor but must have its own testable processing model.

---

## M11 — Headroom and limiter panel

### Goals

Help users understand the electrical consequences of filters and protect loudspeaker drivers.

### Work

* Digital headroom calculation.
* Peak gain through the processing chain.
* Warnings for excessive EQ boost.
* Configurable output-voltage limits.
* Peak limiting.
* RMS or thermal limiting where supported.
* Gain-reduction display.
* Conservative defaults.
* Explicit distinction between estimated and measured values.
* Safety tests for invalid and missing parameters.

---

## M12 — Live meters and diagnostics

### Goals

Make faults and signal flow observable.

### Work

* Input activity.
* Output activity.
* Clipping indication.
* Limiter activity.
* DSP connection state.
* Current input source.
* Relevant temperature or voltage data when available.
* Configuration and deployment health.
* Structured diagnostic logs.
* Exportable support bundle.
* Disconnected and partial-failure states.

### UX principle

The normal status view should answer: “Is the system working?” Advanced detail should be available separately.

---

# Phase 3 — Distinctive SpeakerLab functionality

Phase 3 begins only after the configuration, crossover, measurement and diagnostic foundations are stable.

## M13 — Cardioid designer

* Front and rear driver geometry.
* Delay, gain and polarity calculation.
* Frequency-dependent optimisation.
* Front, side and rear measurement comparison.
* Clear operating-range and excursion warnings.

## M14 — Measurement-based filter optimiser

* Target-curve optimisation.
* Maximum boost and Q constraints.
* Filter-count constraints.
* Multiple measurement positions.
* Reproducible optimisation settings.
* Preview and manual approval before deployment.

## M15 — Nearfield and farfield merge

* Baffle-step handling.
* Level alignment.
* Phase-aware merging.
* Gating metadata.
* Reproducible merge parameters.
* Visual validation.

## M16 — Power- and excursion-aware limiting

* Driver sensitivity, impedance, Sd and Xmax data.
* Frequency-dependent voltage constraints.
* Thermal and excursion estimates.
* Conservative protection profiles.
* Clear warnings that estimates do not replace physical validation.

## M17 — Multi-angle and directivity optimisation

* Multiple angular measurements.
* Listening-window analysis.
* Early-reflections analysis.
* Directivity-index calculations.
* Weighted optimisation objectives.
* Exportable results.

## M18 — Guided speaker commissioning

* Hardware and channel verification.
* Driver-by-driver test.
* Polarity verification.
* Level calibration.
* Measurement guidance.
* Crossover verification.
* Protection setup.
* Final configuration backup.
* Plain-language completion report.

---

# General delivery rules

Every milestone must be delivered through small pull requests.

Each behaviour change requires automated tests.

A pull request must not combine:

* dependency upgrades and new features
* architectural refactoring and UI redesign
* DSP behaviour changes and unrelated cleanup
* multiple roadmap milestones

The existing Beocreate interface remains the product baseline.

New advanced functionality must use progressive disclosure and must not make ordinary configuration harder to understand.
