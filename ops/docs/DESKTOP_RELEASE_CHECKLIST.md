# Desktop Release Checklist — PTDT Dialer

## Build order

```bash
cd /Volumes/iMac_Zee_HD2/dialer-frontend

git checkout main
git pull origin main
npm run lint
npm run build
npm run electron:build:mac
npm run electron:build:win
```

## Mac DMG smoke

- Install from DMG.
- Login as Admin.
- Login as Supervisor.
- Login as Agent.
- Visit all primary pages.
- Open About PTDT Dialer dialog.
- Confirm logout works.
- Confirm responsive web production still works after build.

## Windows EXE smoke

Use:

```text
PTDT Dialer Setup 1.0.0.exe
```

`win-unpacked/PTDT Dialer.exe` is a portable/unpacked build output for testing/debugging. Client install should use the setup EXE.

Smoke:

- Install setup EXE.
- Login as Admin/Supervisor/Agent.
- Visit all primary pages.
- Confirm dashboard/dialer pages render correctly.
- Confirm logout works.

## Code signing

For the 1-month hand-deployed pilot, unsigned builds are acceptable if the client is informed. For public distribution later:

- Apple Developer Program for macOS signing/notarization.
- Windows code signing certificate to reduce SmartScreen warnings.
