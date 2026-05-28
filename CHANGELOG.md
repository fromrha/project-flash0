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
