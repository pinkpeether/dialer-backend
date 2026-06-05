# Public PBX / VPS Setup Guide — PTDT Dialer

## Goal

Move the FreePBX/Asterisk calling layer from local LAN testing to a public production pilot server so desktop clients and Android/browser clients can use a trusted WSS endpoint.

## Required outcomes

- `pbx.ptdt.taxi` points to the public VPS IP.
- FreePBX/Asterisk is installed and secured.
- Asterisk HTTP/WSS is reachable on `https://pbx.ptdt.taxi:8089/ws`.
- The endpoint uses a trusted SSL certificate, not a self-signed certificate.
- SIP trunk is registered and outbound route works.
- RTP range is open only as needed.
- Admin access is locked down by IP/VPN wherever possible.

## Suggested DNS

```text
Type: A
Host: pbx
Value: <PUBLIC_VPS_IP>
TTL: Auto / 300
```

## Important WSS note

Use lowercase path:

```text
wss://pbx.ptdt.taxi:8089/ws
```

Do **not** use:

```text
wss://pbx.ptdt.taxi:8089/WS
```

## Smoke commands

From Mac:

```bash
curl -vk https://pbx.ptdt.taxi:8089/ws
nc -vz pbx.ptdt.taxi 8089
```

From FreePBX server:

```bash
asterisk -rx "http show status"
asterisk -rx "pjsip show transports"
asterisk -rx "pjsip show endpoints"
```

## Security reminders

- Do not expose FreePBX admin panel publicly without IP restriction/VPN.
- Use strong admin passwords.
- Disable unused transports.
- Open only required SIP/RTP/WSS ports.
- Keep fail2ban/firewall enabled.
