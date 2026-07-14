# Upstream Relationship and Provenance

## Repository history

SpeakerLab is an independent continuation of Bang & Olufsen's Beocreate project. The current branch begins from upstream repository `bang-olufsen/create` and adds SpeakerLab foundation documentation.

At the M0 audit point:

- audited commit: `64dc331` (`docs: define focused SpeakerLab roadmap`)
- upstream baseline immediately below it: `1afe3d7` (`Merge pull request #138 ... electron-9.4.0`)
- `upstream` remote: `https://github.com/bang-olufsen/create.git`
- `origin` remote: `https://github.com/Heineb/speakerlab.git`
- working branch: `docs/speakerlab-foundation`

Remote URLs are historical development metadata, not an endorsement or support relationship.

## Attribution and licence

The root `LICENSE` is the MIT License with Bang & Olufsen copyright. Existing source files also carry upstream copyright/licence headers. These notices and the repository history must be preserved.

SpeakerLab must not imply that it is developed, endorsed or supported by Bang & Olufsen. User-facing branding and application identifiers inherited from upstream need a separate legal/branding review before public distribution; M0 does not alter them.

Third-party assets, fonts, speaker data, DSP project files and dependencies may carry obligations not fully inventoried by the root licence. A licence/notice inventory remains required before release. Do not assume the root MIT licence alone resolves every bundled asset or trademark question.

## Upstream contribution policy

Focused bug fixes and documentation improvements may be offered upstream when practical. SpeakerLab-specific roadmap, naming and project-governance changes should remain downstream. Contributions must preserve authorship and avoid rewriting upstream history.

When importing later upstream work:

1. Record the upstream commit range.
2. Review licence and attribution changes.
3. Keep the import separate from SpeakerLab feature or dependency work.
4. Run the complete available baseline verification.
5. Document conflicts, behavioural differences and any audible risk.

## Source-of-truth boundaries

The repository contains legacy documentation under `Documentation/`. It is valuable evidence for the current extension, preset and design contracts, but `docs/` is SpeakerLab's durable project memory and should record verified current behaviour. Where legacy prose and code differ, executable code is the baseline until tests and a deliberate change establish a new contract.
