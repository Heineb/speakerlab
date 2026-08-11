# SpeakerLab

<p align="center">
  <img src="Beocreate2/beo-system/common/speakerlab-mark.svg" alt="SpeakerLab speaker mark" width="96">
</p>

SpeakerLab is an approachable open-source environment for designing and validating loudspeaker DSP configurations. It brings routing, crossover, timing, equalisation, measurements, protection assumptions, backup and simulated deployment into one guided browser workflow.

The current development preview is hardware-free by default and intentionally conservative: designs can be saved, inspected and exercised against a simulator, while physical DSP deployment remains blocked until its safety prerequisites are verified.

## Capabilities

The hardware-free workflow can:

- configure four outputs, driver roles and signal routing;
- design crossover filters and adjust level, delay and polarity;
- create ordinary Parametric EQ bands;
- import and inspect REW text and FRD measurements;
- derive magnitude-only nearfield/farfield merged responses;
- review phase/time alignment, assisted crossover and bounded assisted EQ suggestions;
- record Driver Protection assumptions and run a normalized limiter simulation;
- save, back up, preview and restore the complete design; and
- compile a current-Beocreate DSP plan, apply it to the local simulator and compare simulated readback.

## Typical workflow

1. Complete setup, then open **Speaker Design**.
2. In **Design**, select each output and work through **Output & routing**, **Crossover**, **Level & timing**, **Parametric EQ** and **Driver Protection**.
3. In **Measurements**, import, inspect and assign responses. Merge suitable nearfield/farfield observations when useful.
4. Use contextual **Align drivers**, **Suggest setup** and **Suggest EQ** actions when measurement evidence supports them.
5. In **Review**, resolve issues, save the design and inspect **Deployment Preview**.
6. Use System Tools to download a backup before important changes.

Start with [Getting Started](docs/GETTING_STARTED.md), then use the task-oriented [Design Workflow](docs/DESIGN_WORKFLOW.md) and [User Guide](docs/USER_GUIDE.md).

## Quick start

Prerequisites: Node.js 24 and npm. The server lockfile was generated with npm 11.6.2.

```sh
npm ci --prefix Beocreate2/beo-system
npm run dev
```

Open the loopback URL printed by the command (normally `http://127.0.0.1:3000/`). The local runtime uses isolated state and a simulated DSP target. It does not write to real `/opt` or `/etc`, require root or contact physical hardware.

Run all documented hardware-free verification with:

```sh
npm run verify
```

## Documentation

For users:

- [Getting Started](docs/GETTING_STARTED.md)
- [Designing a Speaker](docs/DESIGN_WORKFLOW.md)
- [User Guide](docs/USER_GUIDE.md)
- [Measurement Import](docs/MEASUREMENT_IMPORT.md), [Measurement Merge](docs/MEASUREMENT_MERGE.md) and [Phase/Time Alignment](docs/PHASE_ALIGNMENT.md)
- [Assisted Crossover](docs/ASSISTED_CROSSOVER.md), [Assisted EQ](docs/ASSISTED_EQ.md) and [Driver Protection](docs/DRIVER_PROTECTION.md)

For contributors and maintainers:

- [Project Charter](docs/PROJECT_CHARTER.md), [Roadmap](docs/ROADMAP.md) and [Current Status](docs/CURRENT_STATUS.md)
- [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md) and [UI Principles](docs/UI_PRINCIPLES.md)
- [Repository Hygiene](docs/REPOSITORY_HYGIENE.md), [Branding](docs/BRANDING.md), [Upstream Relationship](docs/UPSTREAM.md) and [Stop and Validate report](docs/VALIDATION.md)

## Current limitations

- Physical DSP deployment and physical Apply controls remain blocked.
- Timing references can be user-declared; that metadata is not acoustic verification.
- Driver Protection has no thermal or excursion model and is not a safety guarantee.
- Predictions depend on measurement calibration, gating, placement, phase quality, overlap and source integrity.
- Assisted crossover, alignment and EQ are conservative suggestions, not automatic optimization or guarantees of audible improvement.
- Simulator readback is not hardware evidence.

## Hardware target and safety boundary

SpeakerLab currently targets the existing Beocreate 4-Channel Amplifier and inherited software platform. Saved, predicted and simulated states must not be interpreted as audible or physically deployed behavior. Physical Apply controls remain unavailable pending hardware identity, mute, readback, reconnect and rollback evidence.

## Origins and independence

SpeakerLab continues the strongest ideas of the original Bang & Olufsen Beocreate software: an intuitive interface that makes loudspeaker DSP approachable. The original project, contributors and retained source history are acknowledged with respect.

SpeakerLab is independently developed in `Heineb/speakerlab`. It is not an official Bang & Olufsen project and is not developed, endorsed or supported by Bang & Olufsen. The historical `bang-olufsen/create` repository is source material only.

## Development

The project is under active development and is not yet a production-ready replacement image. Routine work is performed on `develop`; `master` is the stable integration and release branch. Read [AGENTS.md](AGENTS.md), the [Project Charter](docs/PROJECT_CHARTER.md) and [Testing](docs/TESTING.md) before contributing.

## License

The repository is distributed under the [MIT License](LICENSE) and retains applicable copyright, licence notices and attribution from the original Beocreate project.
