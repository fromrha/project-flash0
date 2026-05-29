## Changelog

All notable changes to this project will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning follows [Semantic Versioning](https://semver.org/)

## [Unreleased]
### Added
- Integrated native Android `MediaPlayer` inside `MainActivity.kt` to play raw resource audio files (e.g. `siren.aac` in `res/raw`) directly, bypassing Android notification channel caching bugs.
- Implemented `_lastProcessedTokenId` Case ID deduplication barrier in `main.dart` and `intent.removeExtra("alert_data")` cleanup inside `MainActivity.kt` to prevent manual launch replay loops when the app is restarted from Android history or launcher icon.
- Created native `EmergencyReceiver` Kotlin class to capture Android-level FCM broadcasts and immediately launch `MainActivity` to show the alert takeover screen when the phone is on/in-use.
- Implemented a native MethodChannel `com.lapang.emergency.sdk/overlay` to communicate incoming FCM alert payloads from Android context directly to the running Flutter UI.
- Built a back-navigable Form Pengaduan Saksi overlay within the takeover layout matching the citizens simulator design.
- Integrated `StreamController` to forward local notification click and launch payloads from `onDidReceiveNotificationResponse` to the Flutter UI state.
- Implemented a full-screen, high-fidelity visual emergency alert takeover overlay (`_buildEmergencyOverlay`) matching the POLRI simulator design to display critical information (victim name, age, last seen, clothing, suspect description, AI summary quote, and action buttons).
- Added background local notification app launch details check via `flutterLocalNotificationsPlugin.getNotificationAppLaunchDetails()` to restore and overlay alert states when waking up from lockscreen or deep background suspension.
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
- Added new private GitHub repository `https://github.com/fromrha/project-flash0` and pushed `master` and `feat/flutter-standalone-sdk` branches.
- Added monorepo restructuring: moved Next.js dashboard code to `/dashboard` subdirectory.
- Bootstrapped compile-ready Flutter Android standalone Client SDK application under `/mobile_sdk` using package `com.lapang.emergency.sdk`.
- Added location background geofencing with the mathematical Haversine Formula inside Flutter's `firebaseMessagingBackgroundHandler` background message listener in Dart.
- Added native system overlays (SYSTEM_ALERT_WINDOW), lockscreen screen wake (showWhenLocked), high-decibel audio alert siren resources, and location tracking permissions.

### Fixed
- Bumped notification channel ID to `lapang_emergency_channel_v4` in `AndroidManifest.xml`, `background_handler.dart`, and `main.dart` to bypass Android OS notification settings caching and force siren audio/vibration registration.
- Removed the top-right close "X" button from the alert overlay as per the simulator UI requirements.
- Configured "SIMPAN & SALIN" and "KIRIM LAPORAN ONLINE" buttons to copy the full alert details/reports to the clipboard and automatically exit/minimize the application (`SystemNavigator.pop()`) to improve user experience.
- Fixed telemetry logger view in the Dashboard UI by replacing hardcoded list elements with a dynamic `ListView.builder` bound to the reactive `_telemetryLogs` list.
- Fixed clipboard operations to copy the tactical link `https://lapang.polri.go.id/report/${secure_token_id}` to clipboards on both the main dashboard and the emergency alert screen.
- Fixed compileSdk, minSdk, and targetSdk Gradle compiler compatibility crash under AGP 4.1.3 by updating them to compileSdkVersion, minSdkVersion, and targetSdkVersion in `/mobile_sdk/android/app/build.gradle`.
- Updated buildscript ext.kotlin_version to '1.8.20' in `/mobile_sdk/android/build.gradle` for stability and Java 8 JVM compatibility.
- Fixed Firestore transaction freeze when offline by migrating to fire-and-forget `setDoc` promises.
- Fixed infinite polling loop on `/api/device-token` by increasing and synchronizing client/simulator intervals (4000ms on simulator, 6000ms on dashboard).
- Fixed `TypeError` on empty backend API token requests by adding fallback object validation (defaulting blank fields to "ANONIM" or "TIDAK DIKETAHUI").
- Fixed manual command dashboard re-fetching cycles by replacing them with real-time reactive event subscription updates.
- Fixed API dispatch security by executing rigorous model validators in the API PUT bridge before target message registration.
- Fixed `Illegal constructor` error on mobile browsers by wrapping and routing foreground notification dispatch via `navigator.serviceWorker.ready` with custom browser fallbacks.

