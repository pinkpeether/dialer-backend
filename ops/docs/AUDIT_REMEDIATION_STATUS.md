# PTDT-Dialer Audit Remediation Status

Source report: `PTDT-Dialer-Unified-Architecture-Audit.md`

Branch: `audit-remediation/p0-p1-foundation`

Last updated: 2026-09-12

## Status Legend

- `Fixed`: Code change is implemented and local build verification passed.
- `Partial`: Risk is reduced, but the full audit release gate still needs tests, live validation, migrations, or broader route coverage.
- `Pending`: Not yet implemented in this remediation branch.
- `Evidence Needed`: Implementation may exist, but production-grade proof is still missing.

## Remediation Matrix

| Audit ID | Severity | Area | Current Status | Evidence / Notes |
| --- | --- | --- | --- | --- |
| AUD-01 | P0 | Public privileged registration | Fixed | Public registration now creates `AGENT` only; JWT secret fails closed. Commit `2199e7c`. |
| AUD-02 | P1 | Pro feature tenant isolation | Partial | Core Pro feature services were actor/account scoped in batches. Needs two-tenant denial suite across every read/export/mutation. Commits `f92f6b6`, `c9e79f1`. |
| AUD-03 | P1 | WebSocket dashboard leakage | Partial | Dashboard sockets now use platform/account rooms. Needs live multi-tenant socket test evidence. Commit `2199e7c`. |
| AUD-04 | P1 | Socket crash on malformed input | Fixed | Socket auth/status handling validates input and catches async failures. Commit `2199e7c`. |
| AUD-05 | P1 | AMI destructive channel guessing | Partial | False-success control paths reduced, but exact PBX channel/linkedid binding is still required for full closure. Commit `33e6fb7`. |
| AUD-06 | P1 | AMI unavailable/early-close false success | Fixed | AMI originate now fails closed on disabled config, errors, timeout, and early close. Commit `33e6fb7`. |
| AUD-07 | P1 | Hangup/DTMF false completion | Partial | Unified controls no longer report unsupported/no-match as completed. Full closure needs exact call ownership and terminal event confirmation. Commit `33e6fb7`. |
| AUD-08 | P1 | Billing concurrency safety | Partial | Serializable billing transactions and conditional state transitions added. Needs PostgreSQL parallel-connection verification. Commit `d568497`. |
| AUD-09 | P1 | Billing release/bypass | Partial | Missing billing state no longer silently authorizes in main flow; latest SIP guard also blocks direct UI outbound without registration. Needs PBX-plane duration cap/release proof. Commits `d568497`, `97ccd88`. |
| AUD-10 | P1 | Hold privacy | Fixed | Failed hold throws and keeps mic muted instead of reporting safe hold. Commit `f0ab3e9`. |
| AUD-11 | P1 | Logout/session/SIP cleanup | Partial | Frontend session cleanup and SIP clearing hardened; backend session-version revocation remains pending. Commits `f0ab3e9`, `13f2512`. |
| AUD-12 | P1 | Prisma migration replay | Partial | Runtime enum migration sync added. Full empty-database migration replay and schema drift proof still needed. Commit `c065aaf`. |
| AUD-13 | P1 | Live AI/notifications boundaries | Partial | Alerts scoped by commercial account. Live AI and all notification recipient routes still need full two-tenant proof. Commit `4987e95`. |
| AUD-14 | P1 | Authoritative call timing/billing | Partial | FreePBX call-event ingest exists and writes connected/end/duration. CDR matching is now strict; settlement errors propagate. Live PBX hook verified on call `618`: `COMPLETED`, `ANSWERED`, `duration=18`, connected/end timestamps written. Needs customer-account billing settlement proof. Commits `dee757f`, `b6db54d`, `76f5126`. |
| AUD-15 | P2 | SIP registration/DTMF ownership states | Partial | Backend now requires recent SIP presence for user outbound calls. SIP.js registerer/DTMF protocol correctness still needs PBX integration testing. Commit `97ccd88`. |
| AUD-16 | P2 | Frontend stale caches/identity data | Partial | Logout/session cache cleanup improved. Cache freshness model remains broader P2 work. Commit `f0ab3e9`. |
| AUD-17 | P2 | Campaign process-local execution | Pending | Durable queue, campaign leases, cancellation generations, and multi-instance tests not yet implemented. |
| AUD-18 | P2 | Recording ingest/retention correlation | Partial | Call-event billing ingest now avoids heuristic settlement. Recording file ingest still needs quarantine/exact PBX identity and retention deletion proof. |
| AUD-19 | P2 | Security/backup screens overstate guarantees | Pending | Requires middleware enforcement proof, revocation behavior, and tested backup/restore runbook. |
| AUD-20 | P2 | Exports/conversion/import accuracy | Pending | Requires export completeness contract, conversion vocabulary alignment, and supported XLSX decision. |
| AUD-21 | P2 | Health/readiness/shutdown | Pending | Requires readiness endpoint, dependency probes, graceful shutdown, and Railway healthcheck validation. |
| AUD-22 | P2 | Dependency/repository hygiene | Pending | Requires dependency review/update, tracked diagnostic cleanup, and secret/redaction policy. |
| AUD-23 | P2 | Role visibility/backend gate divergence | Partial | Some role gates were aligned during customer/SIP work; needs generated permission/API contract and role-route tests. |

## Current Release Gate

The branch has reduced the highest-risk P0/P1 surface, but the audit cannot be marked fully closed yet. Before promoting this branch as fully remediated, collect evidence for:

1. Two-tenant denial tests for Pro APIs, sockets, alerts, recordings, live AI, exports, and mutations.
2. Customer-account FreePBX CDR/CEL/webhook proof showing exact PTDT `callId`, billsec, and settled/released commercial authorization.
3. Real PBX tests for originate, answer, remote hangup, local hangup, DTMF, transfer, hold failure, and concurrent same-trunk calls.
4. PostgreSQL parallel billing tests for hold, release, and exactly-once settlement.
5. Empty-database migration replay against `schema.prisma`, plus existing-database backup/restore rehearsal.
6. Railway readiness/healthcheck and graceful shutdown validation.

## Next Batch

1. Run one Customer Admin/Supervisor Dynamic Caller ID call and verify billing authorization settlement from FreePBX `billsec`.
2. Persist exact PBX channel/uniqueid/linkedid mappings from events.
3. Bind hangup, transfer, and DTMF to the verified call mapping only.
4. Add automated two-tenant and billing-concurrency tests.
