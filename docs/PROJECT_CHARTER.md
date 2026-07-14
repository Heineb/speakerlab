# SpeakerLab Project Charter

## Purpose

SpeakerLab is an independent open-source continuation of the Bang & Olufsen Beocreate software project.

SpeakerLab aims to provide an intuitive and reliable software platform for designing, configuring and operating active loudspeakers.

The project begins with full focus on the existing Beocreate software and hardware platform.

Future custom hardware is not part of the current roadmap.

## Product vision

SpeakerLab should make sophisticated active loudspeaker design approachable without hiding important engineering constraints.

A user should be able to perform ordinary tasks without understanding SigmaDSP internals, register addresses or raw biquad coefficients.

Advanced users should be able to access deeper controls through optional advanced workflows.

SpeakerLab should initially improve and extend the existing Beocreate product rather than replace it with a new application or a generic hardware platform.

## Core values

### Simplicity

The normal user experience must remain clear, calm and easy to understand.

New functionality must not make ordinary tasks more difficult.

Advanced functionality should be introduced through progressive disclosure rather than by permanently exposing additional controls.

### Reliability

A loudspeaker configuration must behave predictably after every update, restart and configuration change.

Working configurations must be protected against failed imports, incomplete writes and unsuccessful DSP deployments.

### Safety

Routing, gain, crossover, polarity, delay, limiting and protection settings must fail safely.

Audio-safety-related changes require validation, testing and a defined recovery path.

### Incremental development

The existing system will be improved through small, tested and reversible changes rather than a complete rewrite.

Existing behaviour should be protected by characterization tests before poorly tested code is refactored.

### Open development

Software, documentation, design decisions, testing strategy and contribution processes should be publicly documented.

SpeakerLab will remain open source.

### Maintainable boundaries

SpeakerLab should isolate hardware communication where this improves reliability, testing or maintainability of the current Beocreate platform.

The project will not introduce speculative abstractions for hardware that does not yet exist.

A new abstraction must solve a concrete problem in the current software, support automated testing or enable an approved roadmap feature.

## Current scope

* Existing Beocreate software.
* Existing Beocreate amplifier and DSP hardware.
* Reproducible installation and builds.
* Modern, supported development tooling.
* Incremental Node.js, Electron and dependency updates.
* Automated unit, integration, contract and user-interface tests.
* Simulated Beocreate hardware for development and testing.
* Continuous integration.
* Configuration export, import, backup and recovery.
* Safe DSP deployment, verification and rollback.
* Documentation of the existing API and extension architecture.
* Improvements to existing loudspeaker configuration workflows.
* Stereo-pair management.
* Signal-flow and channel-routing tools.
* Dedicated crossover editing.
* Delay, polarity and all-pass controls.
* Measurement import from formats such as REW, FRD and ZMA.
* Resource-aware short FIR support.
* Headroom, limiter and protection tools.
* Live meters and system diagnostics.
* Advanced loudspeaker-design tools after the foundation is stable.

## Current non-goals

* Designing new amplifier or DSP hardware.
* Supporting hypothetical future boards.
* Creating generic hardware capability models for boards that do not exist.
* Creating DSP backends for hardware other than the current Beocreate platform.
* Building a universal loudspeaker operating system before the existing product is stable.
* Rewriting the complete application.
* Replacing the existing user interface solely to adopt a newer framework.
* Restructuring the repository around speculative future requirements.
* Building full room correction before configuration, testing and deployment are reliable.
* Guaranteeing compatibility with every Raspberry Pi audio product.
* Providing safety certification for commercial loudspeakers.
* Changing the visual identity or primary navigation without a clear usability benefit.

## User experience principle

SpeakerLab must preserve the strongest characteristic of Beocreate: a user interface that is intuitive, approachable and easy to navigate.

The existing Beocreate interface is the product baseline.

New functionality should:

* use loudspeaker terminology rather than implementation jargon
* present safe and useful defaults
* keep advanced controls optional
* avoid overcrowding existing screens
* provide clear feedback
* make potentially dangerous or destructive actions reversible
* include understandable loading, error and disconnected states

The ordinary user should not need to understand the underlying DSP implementation.

## Development approach

Development should follow this sequence:

1. Establish a reproducible baseline.
2. Create a reliable test framework and simulated Beocreate hardware.
3. Modernise Node.js, Electron and dependencies incrementally.
4. Implement complete configuration export, import and recovery.
5. Make DSP deployment verifiable and recoverable.
6. Document and protect the existing API.
7. Improve the loudspeaker-design functionality.
8. Add distinctive advanced functionality only after the foundation is stable.

Each change should normally be delivered as a small, focused pull request.

Dependency upgrades, architectural refactoring and user-visible features should not be mixed into the same pull request unless technically inseparable.

## Testing principle

Every behaviour change must have appropriate automated tests.

The normal automated test suite must run without physical Beocreate hardware.

Testing should include, where applicable:

* unit tests for pure logic
* characterization tests for existing legacy behaviour
* contract tests between application components
* integration tests for complete workflows
* end-to-end tests for important user journeys
* golden fixtures for DSP coefficients and configurations
* explicit failure and recovery tests

Hardware-in-the-loop testing may be added separately for operations that cannot be verified reliably through simulation.

A change is not complete until the applicable tests and verification commands pass.

## Compatibility

Existing Beocreate configurations and workflows should continue to work whenever reasonably possible.

When compatibility cannot be maintained:

* the difference must be documented
* migration should be automated where possible
* users should be warned before an audible or irreversible change
* rollback should remain available
* audible changes must never be hidden
* the last known working configuration should be preserved

## Relationship to upstream

SpeakerLab is based on the Bang & Olufsen Beocreate project but is an independent project.

Original upstream copyright and licence notices must be preserved.

General bug fixes and documentation improvements may be proposed back to the upstream project when practical.

SpeakerLab must not imply that it is developed, endorsed or supported by Bang & Olufsen.

## Open-source position

SpeakerLab will remain open source.

The project should favour licences that preserve users' ability to inspect, modify and distribute the software.

Original upstream licence obligations must remain intact.

New licence decisions must be documented before substantial new code is introduced under different terms.

Third-party dependencies and bundled components must retain their applicable notices and licences.

## Definition of success for Phase 1

Phase 1 is successful when:

* a clean checkout can be installed and built using documented commands
* supported Node.js and Electron versions are documented
* the application can be developed on Apple Silicon
* automated tests run without physical hardware
* important existing behaviours are covered by tests
* continuous integration protects the default branch
* complete configurations can be exported and restored
* failed configuration changes cannot silently destroy a working setup
* DSP deployment can be verified and rolled back
* the existing API and extension architecture are documented
* project documentation allows a new contributor or coding agent to resume work without repeating previous analysis
* incremental improvements can be delivered without destabilising the current product

## Long-term direction

After the existing Beocreate software is stable, tested and maintainable, SpeakerLab may add more advanced capabilities, including:

* cardioid loudspeaker design
* measurement-based filter optimisation
* automatic nearfield and farfield measurement merging
* power- and excursion-aware limiting
* multi-angle and directivity optimisation
* guided speaker commissioning

These capabilities must build on the stable foundation rather than bypass it.
