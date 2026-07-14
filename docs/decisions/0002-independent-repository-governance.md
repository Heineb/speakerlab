# ADR 0002: Independent SpeakerLab Repository Governance

- Status: Accepted
- Date: 2026-07-14
- Milestone: M0 – Reproducible Baseline

## Context

SpeakerLab inherited code and Git history from Bang & Olufsen's Beocreate project. Historical provenance must remain clear without suggesting that the original repository is an active development destination or that Bang & Olufsen endorses SpeakerLab.

## Decision

SpeakerLab is independently developed in `Heineb/speakerlab`, which is the sole destination for project branches, issues, releases, pushes and pull requests. The original Beocreate repository is historical source material only. No ongoing synchronisation or contribution-back workflow is planned.

Normal development clones should contain only an `origin` remote pointing to `Heineb/speakerlab`. Project automation and agents do not modify remotes or perform remote Git operations unless the user explicitly requests that exact operation. When pull requests are used, both base and head repositories are `Heineb/speakerlab`.

Applicable original copyright, licence notices, attribution and Git history remain preserved. SpeakerLab must not imply that it is developed, endorsed or supported by Bang & Olufsen.

## Consequences

- SpeakerLab has an unambiguous repository, roadmap, issue tracker, release process and review workflow.
- Historical provenance remains documented without creating a future integration obligation.
- Documentation and tooling must never recommend the original Beocreate repository as a push or pull-request destination.
- Any future change to this policy requires an explicit project decision.
