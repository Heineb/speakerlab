# SpeakerLab

SpeakerLab is an independent open-source continuation of the Bang & Olufsen Beocreate software. It currently targets the existing Beocreate 4-Channel Amplifier and inherited software platform. SpeakerLab is not developed, endorsed or supported by Bang & Olufsen.

The project is under active development and is not yet a production-ready replacement image. Today the hardware-free design workflow can configure routing, crossover, gain, delay, polarity, Parametric EQ and driver-protection assumptions; import and merge measurements; review bounded measurement-assisted EQ and phase/time-alignment suggestions; preview current-Beocreate DSP compilation in a simulator; and back up or restore the complete design. Physical DSP deployment remains deliberately blocked.

## Local development

Use Node.js 24. The server lockfile was generated with npm 11.6.2.

```sh
npm ci --prefix Beocreate2/beo-system
npm run dev
```

The development command prints a loopback URL and starts an isolated SpeakerLab instance with temporary or workspace-local state and a current-Beocreate DSP simulator. It does not write to real `/opt` or `/etc`, require root or communicate with physical hardware.

Run all repository verification with:

```sh
npm run verify
```

Focused commands and known coverage gaps are documented in [Testing](docs/TESTING.md). The normal suite is hardware-free; simulation is not evidence of audible output, GPIO mute behaviour, physical DSP deployment or driver safety.

## Main design workflow

1. Complete the guided setup and open **Signal Flow**.
2. Name and enable outputs, assign driver roles and route inputs.
3. Configure crossover, gain, delay, polarity and Parametric EQ.
4. Import measurements and optionally merge compatible nearfield/farfield magnitude responses.
5. Review measurements, assisted EQ and crossover-region phase/time-alignment suggestions, and driver-protection estimates without automatic changes.
6. Save the design, inspect **Deployment Preview**, and use backup/restore to protect working state.

See the concise [SpeakerLab User Guide](docs/USER_GUIDE.md) for task-oriented instructions and feature limitations.

## Development workflow

Routine work is performed on `develop`; `master` is the stable integration and release branch. Changes should be focused, tested, documented and committed locally for review. See [AGENTS.md](AGENTS.md), the [Project Charter](docs/PROJECT_CHARTER.md) and [Current Status](docs/CURRENT_STATUS.md) before contributing.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Current status](docs/CURRENT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [UI principles](docs/UI_PRINCIPLES.md)
- [Branding and attribution boundary](docs/BRANDING.md)
- [Phase/time alignment](docs/PHASE_ALIGNMENT.md)
- [Upstream relationship](docs/UPSTREAM.md)

## Licence and upstream attribution

The repository is distributed under the [MIT License](LICENSE). It retains code, history, copyright and licence notices inherited from the original Beocreate project. SpeakerLab development belongs to `Heineb/speakerlab`; the original Bang & Olufsen repository is historical source material only.
