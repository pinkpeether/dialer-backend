# FreePBX CDR Event Hook — PTDT Dialer

## Purpose

PTDT billing must use PBX-authoritative call outcome data, not browser timers. This hook posts FreePBX/Asterisk CDR data to:

```text
POST https://dialer-api.ptdt.taxi/api/recordings/ingest/freepbx/cdr
```

The backend requires an exact PTDT `callId` or exact persisted provider reference before it will update call state or settle billing.

## Files

Copy this repository file to the FreePBX server:

```bash
sudo install -o asterisk -g asterisk -m 0750 \
  ops/scripts/freepbx/ptdt-cdr-hook.php \
  /var/lib/asterisk/agi-bin/ptdt-cdr-hook.php
```

Create a secret config file on the FreePBX server:

```bash
sudo mkdir -p /etc/ptdt-dialer
sudo install -o asterisk -g asterisk -m 0750 -d /etc/ptdt-dialer
sudo tee /etc/ptdt-dialer/freepbx-cdr-hook.env >/dev/null <<'EOF'
PTDT_DIALER_API_BASE=https://dialer-api.ptdt.taxi/api
PTDT_FREEPBX_INGEST_SECRET=REPLACE_WITH_RAILWAY_FREEPBX_INGEST_SECRET
EOF
sudo chown asterisk:asterisk /etc/ptdt-dialer/freepbx-cdr-hook.env
sudo chmod 0640 /etc/ptdt-dialer/freepbx-cdr-hook.env
```

Do not commit or paste the real secret into git.

## Asterisk Dialplan Hook

PTDT AMI originate already sends these inherited channel variables:

```text
__PTDT_CALL_ID
__PTDT_CAMPAIGN_ID
__PTDT_AGENT_ID
__PTDT_AGENT_EXTENSION
__PTDT_DYNAMIC_CALLER_ID
__PTDT_SELECTED_CALLER_ID
```

In FreePBX, add a reusable AGI hook context to `/etc/asterisk/extensions_custom.conf`:

```asterisk
[ptdt-cdr-hook]
exten => s,1,NoOp(PTDT CDR hook callId=${PTDT_CALL_ID} uniqueid=${UNIQUEID} linkedid=${CHANNEL(linkedid)})
 same => n,AGI(ptdt-cdr-hook.php)
 same => n,Return()
```

Then push this hangup handler before the outbound `Dial()` in the PTDT two-leg context:

```asterisk
same => n,Set(CHANNEL(hangup_handler_push)=ptdt-cdr-hook,s,1)
```

For the current backend default, the two-leg context name is:

```text
ptdt-dynamic-callerid
```

The handler must be added before the call leaves through the trunk so `PTDT_CALL_ID` is still available.

## Example Two-Leg Context Shape

Keep your existing trunk/outbound-route logic. The important part is the hangup handler before `Dial()`:

```asterisk
[ptdt-dynamic-callerid]
exten => _X.,1,NoOp(PTDT dynamic caller-id callId=${PTDT_CALL_ID} dst=${EXTEN})
 same => n,Set(CHANNEL(hangup_handler_push)=ptdt-cdr-hook,s,1)
 same => n,Set(CALLERID(num)=${PTDT_SELECTED_CALLER_ID})
 same => n,Dial(PJSIP/${EXTEN}@illyvoip-out,60)
 same => n,Hangup()
```

If the production context is already customized, do not replace it blindly. Add only the `CHANNEL(hangup_handler_push)` line before the existing `Dial()`.

## Reload

```bash
sudo asterisk -rx "dialplan reload"
sudo asterisk -rx "dialplan show ptdt-cdr-hook"
sudo asterisk -rx "dialplan show ptdt-dynamic-callerid"
```

## Smoke Test

1. Place one short PTDT Dialer Dynamic Caller ID call.
2. Hang up after answer.
3. On FreePBX:

```bash
sudo tail -n 50 /var/log/ptdt-freepbx-cdr-hook.log
```

Expected log shape:

```text
OK CDR post callId=123 uniqueid=... linkedid=... billsec=8 http=200
```

4. In backend logs, confirm `/api/recordings/ingest/freepbx/cdr` returned success.
5. In the PTDT database/UI, confirm the call has PBX-derived:

- `connectedAt`
- `endedAt`
- `duration`
- `COMPLETED` or `NO_ANSWER`
- billing authorization settled or released

## Failure Behavior

- Missing `PTDT_CALL_ID` and provider reference: hook skips or backend rejects.
- Ambiguous provider reference: backend returns `409`.
- Number/time-only matching: disabled by design for billing safety.
- Backend settlement failure: backend returns an error instead of silently reporting success.
