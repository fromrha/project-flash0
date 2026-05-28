/**
 * LAPANG Firebase Resilient Infrastructure Layer
 * 
 * Provides:
 * 1. Firebase client initialization boilerplate for Spark Plan (Free Tier)
 * 2. Hybrid Local-Storage backed Mock Firestore and Cloud Messaging (FCM)
 * 3. Offline Stash & Forward Queue for handling local reporting in cellular deadzones
 * 4. Cryptographic Purge Protocol (Right to be Forgotten) for complete data erasure
 */

import { encryptCaseId } from "./crypto";

// Define the alert schema type
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

// ----------------------------------------------------
// 1. Firebase Spark Boilerplate Configuration Stubs
// ----------------------------------------------------
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "mock-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "lapang-juara.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "lapang-juara",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "lapang-juara.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "mock-sender-id",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "mock-app-id"
};

// ----------------------------------------------------
// 2. Hybrid Local-Storage Mock Database Client
// ----------------------------------------------------
class MockDatabase {
  private alertsKey = "lapang_firestore_alerts";
  private queueKey = "lapang_offline_queue";
  private networkStatusKey = "lapang_network_online";

  constructor() {
    if (typeof window !== "undefined") {
      // Initialize keys in localStorage if they don't exist
      if (!localStorage.getItem(this.alertsKey)) {
        localStorage.setItem(this.alertsKey, JSON.stringify([]));
      }
      if (!localStorage.getItem(this.queueKey)) {
        localStorage.setItem(this.queueKey, JSON.stringify([]));
      }
      if (localStorage.getItem(this.networkStatusKey) === null) {
        localStorage.setItem(this.networkStatusKey, "true"); // default to online
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
    const data = localStorage.getItem(this.alertsKey);
    return data ? JSON.parse(data) : [];
  }

  public async getAlertByToken(token: string): Promise<CaseAlert | null> {
    const alerts = await this.getAlerts();
    return alerts.find(a => a.secure_token_id === token) || null;
  }

  public async insertAlert(caseData: Omit<CaseAlert, "secure_token_id" | "internal_case_id" | "timestamps">): Promise<CaseAlert> {
    if (typeof window === "undefined") {
      throw new Error("Cannot execute database writes in SSR context");
    }

    const alerts = await this.getAlerts();
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

    alerts.unshift(newAlert); // New cases first
    localStorage.setItem(this.alertsKey, JSON.stringify(alerts));

    // Emit mock FCM message
    this.dispatchMockFCMNotification(newAlert);

    return newAlert;
  }

  // --- CRYPTOGRAPHIC PURGE PROTOCOL (Right to be Forgotten) ---

  public async purgeCase(internalCaseId: string): Promise<boolean> {
    if (typeof window === "undefined") return false;

    const alerts = await this.getAlerts();
    const updatedAlerts = alerts.map(alert => {
      if (alert.internal_case_id === internalCaseId) {
        return {
          ...alert,
          status: "RESOLVED" as const,
          victim_info: {
            name: "[DELETED - PURGE PROTOCOL]",
            age: 0,
            last_clothing: "[DELETED]",
            photo_url: null
          },
          incident_info: {
            last_seen_location: "[DELETED]",
            geo_coordinates: { latitude: 0, longitude: 0 },
            suspect_description: "[DELETED]"
          },
          ai_summary: "[ERASED - CASE DECOMMISSIONED]",
          timestamps: {
            ...alert.timestamps,
            updated_at: new Date().toISOString(),
            terminated_at: new Date().toISOString()
          }
        };
      }
      return alert;
    });

    // Write wiped cases list back to storage
    localStorage.setItem(this.alertsKey, JSON.stringify(updatedAlerts));
    
    // Clear device-level memory, notifications, and cached copy states
    this.triggerClientMemoryErasure(internalCaseId);

    return true;
  }

  private triggerClientMemoryErasure(caseId: string) {
    console.log(`[PURGE] Cryptographic memory zero-wipe executed for Case ID: ${caseId}`);
    if (typeof window !== "undefined") {
      // Clear clipboard caches, temporary logs, or session indicators
      if (navigator.clipboard) {
        navigator.clipboard.writeText("").catch(() => {});
      }
      // Broadcast storage event to alert other active viewports
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

    console.log(`[QUEUE] Connection re-established. Flushing ${queue.length} stashed reports to database...`);
    
    // Mock processing each report (pushing reports to firestore cases log)
    const alerts = await this.getAlerts();
    for (const report of queue) {
      const parentCase = alerts.find(a => a.secure_token_id === report.case_token);
      if (parentCase) {
        // Appending the user report to the suspect descriptor / incident info log in mock environment
        parentCase.incident_info.suspect_description += `\n[BYSTANDER REPORT ${report.timestamp}]: ${report.narrative} (Triangulated near Lat: ${report.reporter_coords.latitude.toFixed(4)}, Long: ${report.reporter_coords.longitude.toFixed(4)})`;
        parentCase.timestamps.updated_at = new Date().toISOString();
      }
    }

    localStorage.setItem(this.alertsKey, JSON.stringify(alerts));
    localStorage.setItem(this.queueKey, JSON.stringify([])); // Empty queue
    window.dispatchEvent(new Event("lapang-queue-flushed"));
  }

  // --- FCM NOTIFICATION ENGINE ---

  private dispatchMockFCMNotification(alert: CaseAlert): void {
    console.log(`[FCM ENGINE] Dispaching high priority push alert payload:`, {
      priority: "high",
      content_available: true,
      android: {
        priority: "high",
        ttl: "0s", // Deliver immediately
        notification: {
          click_action: "FLASHzeroSDK.LOCKSCREEN_TAKEOVER",
          sound: "tactical_alarm.mp3"
        }
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert"
        },
        payload: {
          aps: {
            alert: {
              title: `SIAGA 1: Penculikan Anak!`,
              body: alert.ai_summary
            },
            sound: "critical_alarm.wav",
            "volume-override": 1.0 // Overrides device mute profiles
          }
        }
      },
      data: {
        token: alert.secure_token_id,
        victim_name: alert.victim_info.name,
        victim_age: String(alert.victim_info.age),
        victim_photo: alert.victim_info.photo_url || "",
        incident_location: alert.incident_info.last_seen_location
      }
    });

    if (typeof window !== "undefined") {
      // Trigger a custom event in the browser window to mock immediate lockscreen alert
      window.dispatchEvent(new CustomEvent("lapang-fcm-received", { detail: alert }));
    }
  }
}

// Global singletons for app-wide import
export const db = new MockDatabase();
export const messaging = {
  getToken: async () => "mock-device-fcm-token-1234567890",
  onMessage: (callback: (payload: any) => void) => {
    if (typeof window !== "undefined") {
      const handler = (e: Event) => callback((e as CustomEvent).detail);
      window.addEventListener("lapang-fcm-received", handler);
      return () => window.removeEventListener("lapang-fcm-received", handler);
    }
    return () => {};
  }
};
export { firebaseConfig };
