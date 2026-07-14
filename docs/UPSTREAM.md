# Historical Code Origin and Repository Policy

## Independent development repository

SpeakerLab is independently developed in `Heineb/speakerlab`. This is the only development and push destination for SpeakerLab branches, issues, releases and pull requests.

The original Bang & Olufsen Beocreate repository is the historical code origin only. SpeakerLab has its own roadmap, governance and release process. No ongoing synchronisation with the original repository is planned, and no SpeakerLab pull requests are intended for it.

## Local clone policy

A normal SpeakerLab development clone should contain only the `origin` remote, pointing to `https://github.com/Heineb/speakerlab.git` or the equivalent SSH URL. No Beocreate remote is required.

Agents and contributors must not add, remove, rename or modify remotes as part of ordinary project work. If `origin` does not identify `Heineb/speakerlab`, work must stop before files are edited. Historical repository names must not be used as destinations for future development, pushes or pull requests.

All pull requests, when used, are internal SpeakerLab pull requests. Both the base and head repository must be `Heineb/speakerlab`.

## Historical provenance

SpeakerLab retains the Git history inherited from the original Beocreate codebase. At the initial M0 documentation audit, the historical Beocreate baseline immediately below the SpeakerLab foundation work was commit `1afe3d7`.

This provenance records where the code came from; it does not create an endorsement, support relationship or future contribution path.

## Attribution and licence

The root `LICENSE` is the MIT License with Bang & Olufsen copyright. Existing source files also carry original copyright and licence headers. Applicable notices, attribution and repository history must be preserved.

SpeakerLab must not imply that it is developed, endorsed or supported by Bang & Olufsen. User-facing branding and application identifiers inherited from the historical codebase need a separate legal and branding review before public distribution.

Third-party assets, fonts, speaker data, DSP project files and dependencies may carry obligations not fully inventoried by the root licence. A licence and notice inventory remains required before release. Do not assume the root MIT licence alone resolves every bundled asset or trademark question.

## Source-of-truth boundaries

The repository contains legacy documentation under `Documentation/`. It is useful historical evidence for extension, preset and design contracts, but `docs/` is SpeakerLab's durable project memory. Where legacy prose and code differ, executable code is the baseline until tests and a deliberate SpeakerLab change establish a new contract.
