# SIP Trunk Production Checklist — PTDT Dialer

## Provider account

- SIP trunk provider account created.
- KYC/account verification completed if required.
- Prepaid balance topped up.
- International/local calling routes enabled for target countries.
- Fraud limits configured.

## PBX configuration

- Trunk registered or IP-auth trunk configured.
- Outbound route created.
- Caller ID rules applied.
- At least one DID/CLI verified.
- Test call from PBX CLI passes.
- Test call from PTDT Dialer desktop app passes.

## Caller ID / spoofing note

Only use caller IDs/DIDs that are allowed by the provider and local telecom rules. Some providers will reject arbitrary CLI spoofing unless numbers are verified or contractually authorized.

## Smoke

```bash
asterisk -rx "pjsip show registrations"
asterisk -rx "pjsip show endpoints"
asterisk -rvvvvv
```

Then place a short outbound call and verify:

- Call connects.
- Correct CLI appears.
- Audio works both ways.
- Recording is ingested after hangup.
- Call disposition flow works.
