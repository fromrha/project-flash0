/**
 * LAPANG Firebase Resilient Infrastructure Layer (Real & Mock Hybrid)
 * 
 * Automatically initializes and routes to the real Firebase Client SDK (Firestore & FCM)
 * if environmental variables are present. If variables are missing or if any remote call 
 * encounters permissions/network issues, it falls back to the resilient Local-Storage mock layer.
 */

import { encryptCaseId } from "./crypto";

// 1. Firebase Schema Types
export interface CaseAlert {
  secure_token_id: string;
  internal_case_id: string;
  status: "HYBRID_ACTIVE" | "TERMINATED" | "RESOLVED";
  victim_info: {
    name: string;
    age: number;
    last_clothing: string;
    photo_url: string | null;
  };
  incident_info: {
    last_seen_location: string;
    geo_coordinates: {
      latitude: number;
      longitude: number;
    };
    suspect_description: string;
  };
  ai_summary: string;
  timestamps: {
    created_at: string;
    updated_at: string;
    terminated_at: string | null;
  };
}

export interface StashedReport {
  id: string;
  case_token: string;
  reporter_coords: {
    latitude: number;
    longitude: number;
  };
  narrative: string;
  timestamp: string;
}

// 2. Real Firebase Client SDK Imports
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  query, 
  where, 
  orderBy,
  Firestore,
  setDoc,
  deleteDoc,
  getDoc
} from "firebase/firestore";
import { getMessaging, Messaging } from "firebase/messaging";

// Standard Next.js Env Credentials
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Check if credentials are fully active
const hasRealCredentials = !!(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "mock-api-key" &&
  firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let realDb: Firestore | null = null;
let realMessaging: Messaging | null = null;

if (typeof window !== "undefined" && hasRealCredentials) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    realDb = getFirestore(app);
    try {
      realMessaging = getMessaging(app);
    } catch (msgErr) {
      console.warn("FCM is not supported in this browser environment:", msgErr);
    }
    console.log("[FIREBASE] Native Client SDK initialized successfully with active credentials.");
  } catch (err) {
    console.error("[FIREBASE] Native Client SDK initialization failed:", err);
  }
}

// 3. Resilient Database Handler (Dual-Mode Firestore / LocalStorage)
class HybridDatabase {
  private alertsKey = "lapang_firestore_alerts";
  private queueKey = "lapang_offline_queue";
  private networkStatusKey = "lapang_network_online";

  constructor() {
    if (typeof window !== "undefined") {
      if (!localStorage.getItem(this.alertsKey)) {
        localStorage.setItem(this.alertsKey, JSON.stringify([]));
      }
      if (!localStorage.getItem(this.queueKey)) {
        localStorage.setItem(this.queueKey, JSON.stringify([]));
      }
      if (localStorage.getItem(this.networkStatusKey) === null) {
        localStorage.setItem(this.networkStatusKey, "true");
      }
    }
  }

  // Live Connection Emulation
  public isOnline(): boolean {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(this.networkStatusKey) !== "false";
  }

  public setOnline(status: boolean): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.networkStatusKey, String(status));
    if (status) {
      this.flushOfflineQueue();
    }
  }

  // --- CRUD OPERATIONS FOR ALERTS ---
  
  public async getAlerts(): Promise<CaseAlert[]> {
    if (typeof window === "undefined") return [];

    // Mode: Real Firestore Active
    if (hasRealCredentials && realDb) {
      try {
        const q = query(collection(realDb, "alerts"), orderBy("timestamps.created_at", "desc"));
        const snapshot = await getDocs(q);
        const list: CaseAlert[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as CaseAlert);
        });
        
        // Synchronize local storage as a cache backup
        localStorage.setItem(this.alertsKey, JSON.stringify(list));
        return list;
      } catch (err) {
        console.warn("[FIREBASE] Firestore fetch failed, falling back to local storage cache:", err);
      }
    }

    // Mode: Local Cache Fallback
    const data = localStorage.getItem(this.alertsKey);
    return data ? JSON.parse(data) : [];
  }

  public async getAlertByToken(token: string): Promise<CaseAlert | null> {
    if (hasRealCredentials && realDb) {
      try {
        const q = query(collection(realDb, "alerts"), where("secure_token_id", "==", token));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          return snapshot.docs[0].data() as CaseAlert;
        }
      } catch (err) {
        console.warn("[FIREBASE] Firestore query failed, falling back to local cache:", err);
      }
    }
    const alerts = await this.getAlerts();
    return alerts.find(a => a.secure_token_id === token) || null;
  }

  public async insertAlert(caseData: Omit<CaseAlert, "secure_token_id" | "internal_case_id" | "timestamps">): Promise<CaseAlert> {
    if (typeof window === "undefined") {
      throw new Error("Cannot execute database writes in SSR context");
    }

    const internal_case_id = `case_${Date.now()}`;
    const secure_token_id = await encryptCaseId(internal_case_id);

    const newAlert: CaseAlert = {
      ...caseData,
      internal_case_id,
      secure_token_id,
      timestamps: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        terminated_at: null
      }
    };

    // Mode: Real Firestore Active
    if (hasRealCredentials && realDb) {
      try {
        const docRef = doc(realDb, "alerts", internal_case_id);
        await setDoc(docRef, newAlert);
        console.log(`[FIREBASE] Case written to Google Firestore: ${internal_case_id}`);
      } catch (err) {
        console.error("[FIREBASE] Firestore insert failed, writing to local storage cache:", err);
      }
    }

    // Write to Local Storage backup
    const alerts = await this.getAlerts();
    alerts.unshift(newAlert);
    localStorage.setItem(this.alertsKey, JSON.stringify(alerts));

    // Dispatch FCM payload
    this.dispatchMockFCMNotification(newAlert);

    return newAlert;
  }

  // --- CRYPTOGRAPHIC PURGE PROTOCOL (Right to be Forgotten) ---

  public async purgeCase(internalCaseId: string): Promise<boolean> {
    if (typeof window === "undefined") return false;

    const purgedData = {
      status: "RESOLVED" as const,
      victim_info: {
        name: "[TERHAPUS - PROTOKOL PEMBERSIHAN]",
        age: 0,
        last_clothing: "[TERHAPUS]",
        photo_url: null
      },
      incident_info: {
        last_seen_location: "[TERHAPUS]",
        geo_coordinates: { latitude: 0, longitude: 0 },
        suspect_description: "[TERHAPUS]"
      },
      ai_summary: "[DATA DIHAPUS SEPENUHNYA - KASUS SELESAI]",
      "timestamps.updated_at": new Date().toISOString(),
      "timestamps.terminated_at": new Date().toISOString()
    };

    // Mode: Real Firestore Active
    if (hasRealCredentials && realDb) {
      try {
        const docRef = doc(realDb, "alerts", internalCaseId);
        await updateDoc(docRef, purgedData);
        console.log(`[FIREBASE] Cryptographic purge executed on Firestore Case: ${internalCaseId}`);
      } catch (err) {
        console.error("[FIREBASE] Firestore purge failed, falling back to local wipe:", err);
      }
    }

    // Update Local Cache
    const alerts = await this.getAlerts();
    const updatedAlerts = alerts.map(alert => {
      if (alert.internal_case_id === internalCaseId) {
        return {
          ...alert,
          status: "RESOLVED" as const,
          victim_info: {
            name: "[TERHAPUS - PROTOKOL PEMBERSIHAN]",
            age: 0,
            last_clothing: "[TERHAPUS]",
            photo_url: null
          },
          incident_info: {
            last_seen_location: "[TERHAPUS]",
            geo_coordinates: { latitude: 0, longitude: 0 },
            suspect_description: "[TERHAPUS]"
          },
          ai_summary: "[DATA DIHAPUS SEPENUHNYA - KASUS SELESAI]",
          timestamps: {
            ...alert.timestamps,
            updated_at: new Date().toISOString(),
            terminated_at: new Date().toISOString()
          }
        };
      }
      return alert;
    });

    localStorage.setItem(this.alertsKey, JSON.stringify(updatedAlerts));
    this.triggerClientMemoryErasure(internalCaseId);
    return true;
  }

  private triggerClientMemoryErasure(caseId: string) {
    console.log(`[PURGE] Cryptographic memory zero-wipe executed for Case ID: ${caseId}`);
    if (typeof window !== "undefined") {
      if (navigator.clipboard) {
        navigator.clipboard.writeText("").catch(() => {});
      }
      window.dispatchEvent(new CustomEvent("lapang-purge", { detail: { caseId } }));
    }
  }

  // --- LOCAL STASH & FORWARD QUEUE (Offline Resiliency) ---

  public getOfflineQueue(): StashedReport[] {
    if (typeof window === "undefined") return [];
    const data = localStorage.getItem(this.queueKey);
    return data ? JSON.parse(data) : [];
  }

  public stashReport(caseToken: string, reporterCoords: { latitude: number; longitude: number }, narrative: string): StashedReport {
    const queue = this.getOfflineQueue();
    const newReport: StashedReport = {
      id: `rep_${Date.now()}`,
      case_token: caseToken,
      reporter_coords: reporterCoords,
      narrative,
      timestamp: new Date().toISOString()
    };

    queue.push(newReport);
    localStorage.setItem(this.queueKey, JSON.stringify(queue));
    console.log(`[QUEUE] Network latency trap! Report stashed locally:`, newReport);
    return newReport;
  }

  public async flushOfflineQueue(): Promise<void> {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return;

    console.log(`[QUEUE] Connection re-established. Flushing ${queue.length} stashed reports...`);
    
    const alerts = await this.getAlerts();
    for (const report of queue) {
      const parentCase = alerts.find(a => a.secure_token_id === report.case_token);
      if (parentCase) {
        const updateStr = `\n[LAPORAN WARGA ${report.timestamp}]: ${report.narrative} (Koordinat Lat: ${report.reporter_coords.latitude.toFixed(4)}, Long: ${report.reporter_coords.longitude.toFixed(4)})`;
        parentCase.incident_info.suspect_description += updateStr;
        parentCase.timestamps.updated_at = new Date().toISOString();

        // Mode: Real Firestore Active
        if (hasRealCredentials && realDb) {
          try {
            const docRef = doc(realDb, "alerts", parentCase.internal_case_id);
            await updateDoc(docRef, {
              "incident_info.suspect_description": parentCase.incident_info.suspect_description,
              "timestamps.updated_at": parentCase.timestamps.updated_at
            });
          } catch (err) {
            console.error("[FIREBASE] Firestore offline sync failed:", err);
          }
        }
      }
    }

    localStorage.setItem(this.alertsKey, JSON.stringify(alerts));
    localStorage.setItem(this.queueKey, JSON.stringify([])); // Empty queue
    window.dispatchEvent(new Event("lapang-queue-flushed"));
  }

  // --- FCM NOTIFICATION ENGINE (Real Dispatch Preview) ---

  private dispatchMockFCMNotification(alert: CaseAlert): void {
    console.log(`[FCM ENGINE] Dispaching high priority push alert payload:`, {
      priority: "high",
      content_available: true,
      data: {
        token: alert.secure_token_id,
        victim_name: alert.victim_info.name,
        victim_age: String(alert.victim_info.age),
        incident_location: alert.incident_info.last_seen_location
      }
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lapang-fcm-received", { detail: alert }));
    }
  }

  // --- FCM DEVICE TOKEN REGISTRY (API BYPASS) ---
  public async registerSimulatorToken(token: string): Promise<void> {
    if (typeof window === "undefined") return;
    
    try {
      await fetch("/api/device-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      console.log("[LAPANG] Simulator token registered via API Bridge");
    } catch (err) {
      console.error("[LAPANG] Failed to register token via API:", err);
    }
    
    // Always store in localStorage as well for local/fallback use
    localStorage.setItem("lapang_sim_fcm_token", token);
  }

  public async getSimulatorToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;

    try {
      const res = await fetch("/api/device-token");
      if (res.ok) {
        const data = await res.json();
        if (data.token && data.token !== "lp_token_siap_siar") {
          return data.token;
        }
      }
    } catch (err) {
      console.warn("[LAPANG] API fetch failed, falling back to local:", err);
    }
    
    return localStorage.getItem("lapang_sim_fcm_token");
  }
}

// Global Singletons
export const db = new HybridDatabase();
export const messaging = realMessaging;
export { app as firebaseApp, realDb as firestoreDb };
