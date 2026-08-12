# Current Beocreate DSP Parameter Mapping

## Scope and evidence

This document describes only `Beocreate2/beo-dsp-programs/beocreate-universal-10.xml` and the current legacy `channels`, `equaliser`, `dsp-programs` and `beocreate_essentials/dsp.js` implementations.

Compatible identity requires the shipped evidence to agree:

- program ID: `beocreate-universal`
- profile: `Beocreate Universal`
- profile version: `10`
- model ID: `beocreate-4ca-mk1`
- checksum: `40FB6C92F57ABB70177CE053C73F54DC`
- sample rate: 48,000 Hz

The XML filename is `beocreate-universal-10.xml`; filename alone is not identity. Available metadata includes profile/program/model names and IDs, profile version, checksum and sample rate. There is no exposed parameter-map hash, build register or independent build identifier. The minimum safe identity remains exact program ID, profile version and checksum obtained freshly after connection; a future apply must additionally bind the compiled mapping to the shipped XML evidence.

The existing DSP Programs extension requests checksum and XML, parses `<beometa>`, and falls back to stored metadata only after an exact checksum match. Unknown programs can remain GPIO-muted. SpeakerLab compilation uses the same fail-closed principle and never guesses from register names alone.

The legacy `volume-limit` extension writes linear source-level controls for Raspberry Pi, SPDIF and I2S2 through metadata registers 74/77. It is not a per-output driver limiter. The shipped XML metadata exposes no per-output limiter threshold, attack, release, RMS detector or limiter readback. Driver Protection therefore has unknown mapping confidence, unavailable physical readback and simulator-only compilation; no register is inferred.

## Strongly evidenced parameter map

The addresses below agree between shipped XML metadata and current legacy application code. They are **strongly evidenced**, not physically verified: no committed capture or readback proves that a write changed the intended DSP block.

Parametric EQ v1 compiles enabled peaking, low-shelf and high-shelf bands after crossover sections in the same 80-word/16-biquad output bank. Design coefficients use normalized `{b0,b1,b2,a1,a2}` form; target words use legacy `[b2,b1,b0,-a2,-a1]` order and signed 5.23 quantization. The conservative 12-band limit reserves four sections for crossover. Stable band IDs accompany simulator operations and mismatch reports. This does not promote the map to physically verified or authorize physical Apply.

| Output | Route selector | Polarity | IIR bank | Gain | Delay |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 4860 | 4866 | 691/80 | 781 | 786 |
| B | 4861 | 4865 | 611/80 | 778 | 785 |
| C | 4862 | 4864 | 531/80 | 775 | 784 |
| D | 4859 | 4863 | 451/80 | 772 | 783 |

Route metadata lists `left,right,mono,side` with multiplier 1. SpeakerLab v1 compiles Left=0, Right=1 and Mono=2. `side` is not a SpeakerLab design source. Disabled outputs retain a deterministic selector and compile gain to zero.

Mono is a metadata-defined selector; its summing implementation and headroom have not been physically verified. Multiple sources per output, arbitrary summing, `side`, daisy-chain/slave output and external routes are unsupported. There is no verified individual output-mute parameter: disabled output is represented by zero linear gain, so safe deployment still depends on the unverified all-output GPIO mute.

Each IIR bank contains 80 words: 16 five-word sections. Legacy equaliser application writes `[b2,b1,b0,-a2,-a1]` by software safeload. A flat section is `[0,0,1,0,0]`. SpeakerLab uses the same sign/order convention and fills unused sections flat.

Gain is a linear multiplier in signed 5.23 format. Legacy channel application proves unity, zero/mute and negative-dB attenuation using `10^(dB/20)`. Positive gain is not established by that path and is compilation-blocking even though the design editor can record it with a headroom warning.

Delay is an unsigned whole-sample parameter. Legacy code uses nearest-integer `round(milliseconds / 1000 * sampleRate)`. XML declares 2,000 samples maximum for every output. Polarity is a dedicated integer parameter: normal=0, inverted=1.

## Numeric and transport representation

`dsp.js` uses four-byte big-endian SigmaTCP writes. Integer parameters are sent directly. Decimal values are multiplied by 2^24, have 0.5 added and are truncated during byte extraction, producing the legacy signed 5.23 representation (including its asymmetric negative-value rounding). Read responses decode four bytes as a signed big-endian integer and divide by 2^24.

SigmaTCP command 0x09 writes and 0x0a reads. The header is 14 bytes and contains big-endian length/address fields. DSPToolkit is used for XML/profile/checksum-related host operations, EEPROM installation/store/reset and is not used by this compilation slice.

The generic legacy read API can request each mapped address, but physical readability and verification are not proven per operation. See `SIGMATCP_PROTOCOL.md`.

## Readiness matrix

| Design field | Confidence | Writable evidence | Physical readback | Verifiable | Blocker |
| --- | --- | --- | --- | --- | --- |
| Routing A–D | Strongly evidenced | XML plus `channels` writes | Generic API only | No | No capture/readback |
| Crossover banks A–D | Strongly evidenced | XML plus `equaliser` safeload | Generic API only | No | Safeload/application and response unverified |
| Gain A–D, 0..1 linear | Strongly evidenced | XML plus `channels` writes | Generic API only | No | Physical readback absent |
| Delay A–D, 0..2,000 samples | Strongly evidenced | XML plus `channels` writes | Generic API only | No | Physical quantization/readback absent |
| Polarity A–D | Strongly evidenced | XML plus `channels` writes | Generic API only | No | Physical readback absent |
| Driver protection A–D | Unknown | No per-output mapping | Unavailable | No | Threshold conversion, attack/release and readback unsupported |
| GPIO 27 all-output safe state | Strong command evidence | `dsp-programs` `pigs` commands | Unavailable | No | Physical mute cannot be confirmed |

All compiled parameter operations can be represented and current code can generate writes. None is ready for physical deployment.

## Safe state and ordering

The deployed application’s verified amplifier safe state is GPIO 27 mute. Although XML includes `muteRegister`, current DSP Programs code does not use it for amplifier mute, so it is not a verified deployment control.

The proposed ordering is:

1. enter GPIO amplifier mute;
2. routing;
3. all filter sections, including explicit flat sections;
4. gain;
5. delay;
6. polarity;
7. complete readback and comparison;
8. leave mute only after every required item matches.

Simulator failure, unavailable/invalid/mismatching readback, stale design revision or connection loss leaves the simulated safe state muted.

## Unknown or unsupported

- physical GPIO mute confirmation/readback and failure detection;
- physical program-identity timing and stale-metadata behavior during application;
- safe positive output gain and headroom;
- physical readback reliability, tolerances and register caching;
- atomic multi-register application and rollback after connection loss;
- verified physical coefficient response after 5.23 quantization;
- use of XML `muteRegister` or `muteInvertRegister`;
- daisy-chain `side` routing and external/slave outputs;
- physical restart persistence and EEPROM/flash behavior.

These gaps block Safe Physical DSP Apply v1. Recovery requirements are defined in `DSP_RECOVERY_PREREQUISITES.md`; no hardware rollback is implemented.

## Read-only evidence review

The version 1 read-only capture contract allowlists only the checksum request and the exact parameter reads in this document. The sanitized fixture is repository-backed and confirms deterministic request construction, response decoding, integrity checking and redaction behavior. It is not a physical capture.

No confidence changed in this review. Routing, crossover, gain, delay, polarity and safe state remain strongly evidenced rather than verified. A future promotion requires a reviewed compatible-hardware capture with fresh matching identity, two agreeing observations, deterministic decoding, repository/metadata corroboration, known units and tolerances, and no contradictory evidence. See `PHYSICAL_APPLY_BLOCKERS.md` and `READONLY_CAPTURE_FORMAT.md`.
