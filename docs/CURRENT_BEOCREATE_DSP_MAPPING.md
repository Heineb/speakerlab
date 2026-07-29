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

The existing DSP Programs extension requests checksum and XML, parses `<beometa>`, and falls back to stored metadata only after an exact checksum match. Unknown programs can remain GPIO-muted. SpeakerLab compilation uses the same fail-closed principle and never guesses from register names alone.

## Verified parameter map

| Output | Route selector | Polarity | IIR bank | Gain | Delay |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 4860 | 4866 | 691/80 | 781 | 786 |
| B | 4861 | 4865 | 611/80 | 778 | 785 |
| C | 4862 | 4864 | 531/80 | 775 | 784 |
| D | 4859 | 4863 | 451/80 | 772 | 783 |

Route metadata lists `left,right,mono,side` with multiplier 1. SpeakerLab v1 compiles Left=0, Right=1 and Mono=2. `side` is not a SpeakerLab design source. Disabled outputs retain a deterministic selector and compile gain to zero.

Each IIR bank contains 80 words: 16 five-word sections. Legacy equaliser application writes `[b2,b1,b0,-a2,-a1]` by software safeload. A flat section is `[0,0,1,0,0]`. SpeakerLab uses the same sign/order convention and fills unused sections flat.

Gain is a linear multiplier in signed 5.23 format. Legacy channel application proves unity, zero/mute and negative-dB attenuation using `10^(dB/20)`. Positive gain is not established by that path and is compilation-blocking even though the design editor can record it with a headroom warning.

Delay is an unsigned whole-sample parameter. Legacy code uses nearest-integer `round(milliseconds / 1000 * sampleRate)`. XML declares 2,000 samples maximum for every output. Polarity is a dedicated integer parameter: normal=0, inverted=1.

## Numeric and transport representation

`dsp.js` uses four-byte big-endian SigmaTCP writes. Integer parameters are sent directly. Decimal values are multiplied by 2^24, have 0.5 added and are truncated during byte extraction, producing the legacy signed 5.23 representation (including its asymmetric negative-value rounding). Read responses decode four bytes as a signed big-endian integer and divide by 2^24.

SigmaTCP command 0x09 writes and 0x0a reads. The header is 14 bytes and contains big-endian length/address fields. DSPToolkit is used for XML/profile/checksum-related host operations, EEPROM installation/store/reset and is not used by this compilation slice.

The legacy read queue supports parameter and multi-address reads, but its framing, timeout, reconnect and partial-response behavior is not changed or claimed safe here. Simulator readback normalizes values by compiled operation index and retains raw encoded diagnostics in the compilation plan.

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

These gaps block Safe Physical DSP Apply v1.
