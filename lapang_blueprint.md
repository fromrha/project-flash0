# 📋 PROJECT BRIEF & TECHNICAL BLUEPRINT: LAPANG (LAPoran Anak hilaNG)
## System Version: Pre-Beta v0.1.0 (Pre-Development / Vibe Coding Context)

---

## 1. CORE PROJECT OVERVIEW & PROBLEM STATEMENT
*   **Application Name:** LAPANG (LAPoran Anak hilaNG)
*   **Context:** High-impact submission for Google Juara Vibe Coding Competition (Jakarta, 2026).
*   **Target Stack:** Next.js (App Router), Node.js, Firebase Spark Plan (Free Tier).
*   **Problem Statement:** 
    [Public Safety Officials & POLRI Operators] can [trigger aggressive, localized emergency child abduction alerts bypassing heavily-polluted Class 0/Flash SMS channels] so that [citizens are mobilized instantly into active search units during the 3-hour golden window without downloading a standalone app].
*   **The Rationale:** 
    Class 0 / Flash SMS in Indonesia has suffered deep carrier-side pollution (gambling ads, subscription spam), leading to instantaneous consumer "dismiss fatigue". LAPANG bypasses this by leveraging Firebase Cloud Messaging (FCM) High-Priority Full-Screen Intents (Android) and iOS Critical Alerts, providing visual rich-media context (photos, geo-radius) locked behind strict state verification.

---

## 2. DUAL-PURPOSE ARCHITECTURE & ROADMAP
*   **Hackathon MVP Objective:** 
    A dual-component setup. Part A is the verified POLRI Operator Dashboard. Part B is a Mobile Client Emulator (built inside Next.js/Flutter) mimicking OS-level lock screen takeovers with custom high-decibel alarm ringtones.
*   **SDK Production Vision:** 
    The mobile engine codebase is explicitly written as a pluggable, low-overhead SDK framework. Municipal applications (e.g., JAKI in Jakarta, Sapawarga in West Java) can integrate the LAPANG monitoring service with a single programmatic initialization line (`FlashZeroSDK.initialize();`), circumventing the need for standalone citizen installations.

---

## 3. USER ROLES & PERMISSION MATRIX
*   **Role 1: POLRI Operator (Web Admin Dashboard):**
    *   *Access Level:* Strictly authenticated government endpoint.
    *   *Capabilities:* Intake case drafting, live map coordinate triangulation, Gemini AI summary parsing, dispatching multi-tier alerts, tracking resolution status, and executing absolute system purges.
*   **Role 2: Citizen / Device Owner (SDK Mobile Viewport Layer):**
    *   *Access Level:* Sandbox client application/SDK inside native municipal apps.
    *   *Capabilities:* Lockscreen full-screen intent interception, clipboard data caching, dynamic client-side caching, offline local stash and forward reporting queue, and automated cache wiping.

---

## 4. RUTHLESS FEATURE CLASSIFICATION (TIERING)

### 🥇 Tier 1: Core MVP Architecture (Built First)
*   **POLRI Emergency Intake Module:** High-fidelity input workflow catching victim name, age, last known clothing description, dynamic vehicle descriptor string, and raw canvas coordinates.
*   **FCM Core HTTP v1 Dispatcher:** Backend pipeline compiling raw payload objects. Forces `priority: high`, registers full-screen intent targets for Android background workers, and hooks into Apple Push Notification system (APNs) volume override parameters.
*   **Dynamic Hybrid Media Broadcast:** Multi-state fallback operational handler. If photo assets are omitted at intake, the system shoots a high-priority text-only card layout. If images are appended by family immediately, it automatically fires a rich media card container carrying native CDN link arrays.
*   **AEAD Symmetrical Anti-Fraud Tokenizer:** Security shielding mechanism. Real integer database indices are strictly barred from public routing. Case IDs are obfuscated on the fly into short, cryptographically secure tokens (via AES-256-GCM or customized salt Hashids), rendering public URLs resistant to malicious enumeration or fishing proxies.
*   **Ergonomic Dual-Action Overlay UX:** Human-engineered lock screen pop-up tailored around natural thumb resting metrics:
    *   *Right Action Button ("Simpan"):* Positions closest to primary thumb movement. Closes the alert window while natively copying an unformatted rich-text contextual copy string and a secure report URL to the clipboard.
    *   *Left Action Button ("Lapor"):* Fires an immediate internal modal reporting interface mapped to the secure token ID.
*   **Offline Resiliency Engine (Stash & Forward Queue):** Fail-secure networking middleware. If a citizen hits "Lapor" in low-signal corridors or cellular deadzones, the SDK grabs active GPS lat/long markers, caches the report block locally into encrypted storage arrays, and dispatches the payload to Firestore automatically upon network recovery.
*   **Cryptographic Purge Protocol (Right to be Forgotten):** Immediate situational decommissioning pipeline. Changing case statuses to "RESOLVED" triggers a remote zero-cache wipe script, blowing out encrypted data indices, media reference links from cloud containers, and calling device-level memory erasures on active client wrappers.

### 🥈 Tier 2: Next Release Cycle
*   **Gemini AI Log Parser:** Integration with Google AI Studio (Gemini 1.5 Flash API) to parse messy bystander narrative texts into structured, rapid-read alert bullet points.
*   **Dynamic Rolling Geofence Vectoring:** Automated tracking adjusts broadcast radiuses dynamically along suspect vehicle trajectories.

---

## 5. UI/UX CREATIVE DIRECTION & PALETTE GUIDELINES
*   **Core Skill Dependency:** `skills import https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`
*   **Visual Persona:** Hyper-professional, high-trust, elite tactical command interface. No outdated, cluttered government aesthetics. Minimalist layout utilizing spacious grids, distinct asymmetric bounding blocks, and high-tech typography.
*   **Color Palette Specification (Trust, Emergency, Clarity):**
    *   *Primary Trust Blue:* `#052698` (Deep, commanding dark blue representing security and law enforcement authority).
    *   *Electric Alert Blue:* `#116BF8` (High-contrast bright blue for focal text, interactive elements, and structural highlights).
    *   *Cyan Beacon Accent:* `#21BCEE` (Vibrant accent color for secondary markers, active geofence visualization, and critical states).
    *   *Clean Dark / Light Bounds:* Neutral background rendering surfaces via `#FFFFFF`, soft slate grays (`#878EA0`), light background cards (`#DCE3EB`), and pure absolute blacks (`#000000`) for clear textual legibility.
*   **Atmospheric Stylings:** Subtle radial glassmorphic gradients blending electric blue glow layers behind crisp, clean-cut micro-borders, geometric layouts, and distinct status indicators.

---

## 6. DATA MATRIX & ENTITY SCHEMAS (FIRESTORE)

### `alerts` Collection (Document per Abduction Instance)
```json
{
  "secure_token_id": "String (AES-256-GCM encrypted public index identifier)",
  "internal_case_id": "String (Auto-generated Firestore document identifier)",
  "status": "String (HYBRID_ACTIVE | TERMINATED)",
  "victim_info": {
    "name": "String (Defaults to 'ANONIM' if unidentified)",
    "age": "Number (Estimated)",
    "last_clothing": "String",
    "photo_url": "String (Null if text-only alert, filled with CDN reference path if media available)"
  },
  "incident_info": {
    "last_seen_location": "String (Human-readable landmark context)",
    "geo_coordinates": "GeoPoint (Latitude & Longitude anchor for localized geofencing)",
    "suspect_description": "String (License plates, vehicular identifiers, clothing notes)"
  },
  "ai_summary": "String (Gemini-compiled short text optimized for lockscreen render buffers)",
  "timestamps": {
    "created_at": "Timestamp",
    "updated_at": "Timestamp",
    "terminated_at": "Timestamp | Null"
  }
}

```

---

## 7. CODING AGENT WORKSPACE INSTRUCTIONS

When executing code generation inside the Antigravity workspace, the following configurations must be pulled from global environment context:

```bash
# Required global agent module instructions
skills import next-best-practices
skills import react-components
skills import shadcn-ui
skills import vercel-react-best-practices
skills import web-design-guidelines

```

* **Architecture Constraints:** Ensure all application state logic enforces clean separation between data models (Entities) and visual presentation layers (Features). No hardcoded credentials. All API routes executing crypto computations must utilize verified, authenticated middleware channels.

```
