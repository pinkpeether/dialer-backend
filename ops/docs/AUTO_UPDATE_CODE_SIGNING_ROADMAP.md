# Auto-update / Code Signing Roadmap — PTDT Dialer

## Pilot position

For the current hand-deployed pilot, auto-update and code signing are optional. They should not block delivery.

## When to add code signing

Add signing when:

- The app is distributed to many clients remotely.
- Clients install without your physical/on-site support.
- Windows SmartScreen warnings become a sales/support issue.
- macOS Gatekeeper warnings become a sales/support issue.

## When to add auto-update

Add auto-update only after:

- macOS and Windows releases are signed.
- A stable release channel exists.
- Rollback process is tested.
- Client version compatibility with backend API is tracked.

## Recommended future variables

```env
ELECTRON_UPDATE_URL=
GH_TOKEN=
APPLE_TEAM_ID=
APPLE_ID=
APPLE_APP_SPECIFIC_PASSWORD=
CSC_LINK=
CSC_KEY_PASSWORD=
WINDOWS_CERTIFICATE_PASSWORD=
```

## Linux

Linux AppImage/deb support can be added later if a client requires it.
