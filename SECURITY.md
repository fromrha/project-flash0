# Security Policy

## Supported Versions

| Version | Supported |
|:--------|:----------|
| 0.x (Pre-Beta) | Active development, security patches applied |

## Reporting a Vulnerability

LAPANG handles sensitive data related to child safety operations. If you discover a security vulnerability, **do not open a public GitHub issue**.

### Disclosure Process

1. Send a detailed report to the project maintainer via GitHub private vulnerability reporting
2. Include steps to reproduce, affected components, and potential impact
3. Allow up to 72 hours for an initial response
4. A fix will be developed and released before public disclosure

### Scope

The following components are in scope for security reports:

- **Token Encryption** -- AES-256-GCM secure token generation and validation in `dashboard/src/lib/crypto.ts`
- **FCM Payload Integrity** -- Data payload construction in `dashboard/src/app/api/send-alert/route.ts`
- **Firebase Admin SDK** -- Server-side authentication and Firestore access controls
- **Client-Side Geofencing** -- Coordinate calculation logic in `mobile_sdk/lib/background_handler.dart`

### Out of Scope

- Firebase infrastructure vulnerabilities (report to Google directly)
- Social engineering attacks
- Denial of service against third-party services

## Data Handling

LAPANG implements a **Cryptographic Purge Protocol** (Protokol Flash Wipe) that ensures all case-related data, media references, and device-level caches are wiped when a case status transitions to `TERMINATED`. This is a core privacy guarantee of the framework.
