## Changelog

All notable changes to this project will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning follows [Semantic Versioning](https://semver.org/)

## [Unreleased]
### Added
- Initial project brief and technical blueprint mapping.
- Changelog initialized for project tracking.
- Bootstrapped Next.js App Router workspace with TypeScript and Tailwind CSS v4.
- Created `globals.css` with a high-fidelity dark military tactical command design.
- Built a secure, browser-and-node-compatible AES-256-GCM cipher tokenizer utility in `crypto.ts`.
- Developed `firebase.ts` infrastructure modeling Spark Plan collections, mock Firestore/FCM systems, offline "Stash & Forward" queues, and cryptographic wiping protocols.
- Implemented `page.tsx` displaying the POLRI Command Dashboard with safety triggers, map triangulation vectors, and simulated network offline queue controls.
- Created `route.ts` API endpoint integrating Google Gemini 1.5 Flash parsing with fallback heuristic regex parsers.
- Successfully verified and compiled production build (`npm run build`).
- Integrated real Firebase Client SDK (Firestore & Messaging) dynamically mapped to environments in `firebase.ts`.
- Automated Web app registration in Google Cloud project `mockuplens` and credentials population in `.env.local` via Firebase MCP server.
- Fully localized the POLRI Command Dashboard interface (`page.tsx`) into Indonesian formal, tactical language.
- Built a mobile-optimized public citizen device simulator page at `/simulator` (`src/app/simulator/page.tsx`) using Notification permissions and VAPID FCM registration.
- Added `public/firebase-messaging-sw.js` service worker background listener to stabilize client FCM token fetches.
- Added network status toggle button in the simulator header to simulate online/offline device states.
- Added "SIMPAN & SALIN" overlay button to copy case summaries and encrypted reporting links.
- Added "LAPOR PETUNJUK" reporting modal with local offline queuing (`lapang_sdk_offline_queue` local storage cache) for low-connectivity environments.
- Added `messaging.onBackgroundMessage` implementation in background service worker `public/firebase-messaging-sw.js` to parse push payloads.
- Added emergency audio player to play `/alert.aac` siren using `new Audio().play()` in both simulator foreground listener and background service worker wrapper.
- Added real-time Firestore synchronization on Dasbor POLRI utilizing `onSnapshot` SDK listener.

### Fixed
- Fixed Firestore transaction freeze when offline by migrating to fire-and-forget `setDoc` promises.
- Fixed infinite polling loop on `/api/device-token` by increasing and synchronizing client/simulator intervals (4000ms on simulator, 6000ms on dashboard).
- Fixed `TypeError` on empty backend API token requests by adding fallback object validation (defaulting blank fields to "ANONIM" or "TIDAK DIKETAHUI").
- Fixed manual command dashboard re-fetching cycles by replacing them with real-time reactive event subscription updates.
- Fixed API dispatch security by executing rigorous model validators in the API PUT bridge before target message registration.

