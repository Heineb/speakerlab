# Current Beocreate DSP Recovery Prerequisites

Physical application is not implemented. This matrix defines minimum future behavior.

| Failure stage | State after failure | Rollback today | Required future behavior |
| --- | --- | --- | --- |
| Before first write | Prior DSP state should remain known | Not needed | Confirm mute and identity |
| After safe-state command | Physical mute and DSP state may be unknown | None | Remain muted; require confirmation |
| Routing write | Routing may be partial | None | Read back or restore verified prior plan |
| Filter writes | Driver protection may be partial | None | Remain muted; restore complete bank |
| Gain/delay/polarity | Output behavior may be partial | None | Remain muted; restore and verify |
| Readback mismatch | Intended and actual state differ | None | Never unmute; retain diagnostics |
| Connection loss | Applied prefix is unknown | None | Invalidate work; do not auto-resume |
| DSP or server restart | Runtime state/persistence unknown | None | Reacquire identity and readback |
| Identity mismatch | Register meaning is untrusted | Prohibited | Stop while muted |
| Mute cannot be confirmed | Audio safety is unknown | Prohibited | No parameter writes |
| Rollback failure | Intended and restored state unknown | Failed | Stay muted; manual intervention |

A future rollback requires a compiled last-known-good plan for the same freshly verified program identity, complete readable mappings, confirmed all-output mute, ordered apply and complete readback while muted. EEPROM persistence is outside rollback v1.

User status must distinguish preparation, transported bytes, partial/unknown DSP state, verified state and rollback failure. Any unknown safety-critical state remains muted and may require manual intervention.
