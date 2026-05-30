## Changelog

All notable changes to this project will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning follows [Semantic Versioning](https://semver.org/)

## [Unreleased]
### Added
- Dynamic Telemetry permission cards: GPS, Overlay, Lockscreen — all read real device state via MethodChannel
- Smart permission button in Telemetry tab: turns red and opens system settings if any permission is denied
- `WidgetsBindingObserver` on DashboardScreen to refresh permission states when app resumes from background
- `checkOverlayPermission`, `openOverlaySettings`, `checkLockscreenPermission`, `openNotificationSettings` MethodChannel handlers in MainActivity.kt
- Audio focus request (`AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE`) in siren so volume isn't reduced during WhatsApp calls
- `setLockscreenActive` MethodChannel handler — forces lockscreen bypass & screen wake when alert comes in from foreground (not just cold start)
- Restored pill/ring concentric circle animation around `Icons.new_releases` icon in emergency overlay header
- Looping alert audio in web simulator via `useRef<HTMLAudioElement>` — audio stops on dismiss

### Changed
- Alert overlay icon reverted to layered ring design (outermost faint ring → middle ring → filled core circle with glow)
- Removed "PERINGATAN DITERIMA: AREA RADIUS SIAGA 1" subtitle from overlay header
- Age badge (`X TH`) font size increased from 10 to 14px with larger padding
- Siren volume raised to 1.0f (full) with audio focus lock to bypass call ducking
- `_setIncomingAlert` now calls `setLockscreenActive` + `immersiveSticky` for foreground alert coverage

## [v0.3.0] - 2026-05-30
### Added
- Overhauled Tab Tentang: removed all box wrappers, borders, and rigid backgrounds for content. Extended typography and scrollable layouts.
- Dynamic Mobile Banner: Integrated the high-definition `gdc-jvc-mobile-banner.jpg` asset directly at the top of the Flutter client.
- Google Vibe Coding Event Direct Links: Configured direct launch action using `url_launcher` on Flutter and simple hyperlinks on web.
- Material Symbols Outlined stylesheet integration on Web and `flutter_svg` package on mobile client.
- Google Material Symbol `zone_person_urgent` as primary alert card icon.
- Balanced vertical centering layout: dynamically centers the standby radar using flex/Expanded column spacers.
- Indonesian translation for Side Navigation Drawer footers (Waktu Server and Koordinat Sekarang).
- Unified Android App Name: standard compilation target changed to `LAPANG` in Android manifest.

### Changed
- Bushed version globally to `v0.3.0`.
- Corrected creator credits to "Rahman Hanafi".

## [v0.2.0] - 2026-05-29
### Added
- Created 80%-width Side Navigation Drawer overlays on both Next.js Web Simulator and Flutter Standalone Client, containing identical tabs (Beranda, Sistem Telemetri, Cara Kerja, Lisensi Kode, Tentang & Kontes).
- Embedded live real-time clock stream and current GPS coordinates in Drawer Footers.
- Implemented custom `CyberGridPainter` grid backdrop in Flutter for a glowing tactical blueprint effect.
- Added automatic full-screen immersive mode (`SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky)`) in Flutter when an emergency alert is active, restoring edge-to-edge system navigation on exit.
- Collapsible Telemetry Sheet interface inside the Flutter client SDK (`main.dart`) mirroring the Next.js web simulator.
- Integrated official white logomark logo as central focus in Next.js standby section.

### Changed
- Synchronized Status Bar Mockups: Burger Menu toggle button on the left, capsule badge "SISTEM AKTIF" with a glowing pulsing green neon dot animation on the right.
- Perfectly centered the standby layouts vertically and horizontally on both platforms with bold uppercase "LAPANG" title, "Laporan Anak Hilang" subtitle, centered white logomark, and geocoded sector status text.
- Re-routed the Collapsible Telemetry Sheet into the new drawer-based system telemetri view for a clean production interface.
- Reworked bottom alert cards to display: "Melihat indikasi atau percobaan penculikan anak? [ LAPOR SEGERA ]", mapped to launch the respective reporting modals.
- Synchronized design, layout, and copywriting between Next.js Simulator and Flutter SDK to feature "LAPANG POLRI // JALUR UTAMA" and glowing "PERLINDUNGAN AKTIF GEOFENCE".
- Adopted Brand Guideline safety tagline: "Keterbukaan Informasi, Kecepatan Penyelamatan" and radius monitoring subtext.
- Moved the Collapsible Telemetry Panel inside the simulated phone screen layout frame on Next.js.
- Removed mock Wi-Fi icon button from status bar.
- Replaced central radar visual in Flutter dashboard screen with white `LapangLogomarkPainter`.

### Fixed
- Fixed compilation and syntax parsing errors in Next.js web simulator layout.
- Fixed APK build and Kotlin gradle asset bundling compatibility.
- Fixed compilation and analyzer errors in `main.dart` (removed invalid `audioStreamType` and fixed `maxHeight` container constraints).

### Added (Previous)
- Complete README rewrite with banner, shields.io badges, mermaid architecture diagrams, sequence diagrams, structured tables, and zero-emoji tactical tone.
- Apache 2.0 LICENSE file with patent protection for public safety SDK adoption.
- CONTRIBUTING.md with development setup, branching model, and commit conventions.
- SECURITY.md with vulnerability disclosure policy and data handling scope.
- CODE_OF_CONDUCT.md tailored for child safety project sensitivity.
- `.env.example` template for dashboard Firebase credentials.
- Open Graph and Twitter Card metadata in `layout.tsx` for social media link previews using the LAPANG banner.
- Organized `docs/` directory with blueprint and logo assets.

### Changed (Previous)
- Moved technical blueprint to `docs/`.
- Removed stale `android_winusb.inf` and publication recommendation file from root.

### Fixed
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

