import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { alert, radius } = body;

    if (!alert) {
      return NextResponse.json({ success: false, error: "No alert provided" }, { status: 400 });
    }

    const payload = {
      topic: "siaga_anak_hilang",
      android: {
        priority: "high",
        ttl: 0,
        notification: {
          clickAction: "FLASHzeroSDK.LOCKSCREEN_TAKEOVER",
          sound: "tactical_alarm.mp3",
        },
      },
      data: {
        victim_name: alert.victim_info?.name || "ANONIM",
        victim_age: String(alert.victim_info?.age || 0),
        victim_photo: alert.victim_info?.photo_url || "null",
        incident_location: alert.incident_info?.last_seen_location || "TIDAK DIKETAHUI",
        latitude_tkp: String(alert.incident_info?.geo_coordinates?.latitude || -6.2088),
        longitude_tkp: String(alert.incident_info?.geo_coordinates?.longitude || 106.8456),
        radius_km: String((radius || 2000) / 1000),
        victim_clothing: alert.victim_info?.last_clothing || "Pakaian tidak didetailkan",
        suspect_description: alert.incident_info?.suspect_description || "Mencari petunjuk kendaraan...",
        ai_summary: alert.ai_summary || "SIAGA 1: Penculikan Anak!",
        secure_token_id: alert.secure_token_id || "",
        created_at: alert.timestamps?.created_at || new Date().toISOString()
      },
    };

    console.log("[FCM DISPATCHER] Dispatching payload to topic 'siaga_anak_hilang':", JSON.stringify(payload, null, 2));

    try {
      // Lazy load firebase-admin so it does not fail initialization if credentials are empty
      const firebaseAdmin = require("firebase-admin");
      
      const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT;
      const hasCredentials = hasServiceAccount || 
                             process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                             process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      if (hasCredentials) {
        if (firebaseAdmin.apps.length === 0) {
          const config: any = {};
          if (hasServiceAccount) {
            try {
              config.credential = firebaseAdmin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!));
            } catch (err) {
              console.error("[FCM DISPATCHER] Failed to parse service account JSON:", err);
            }
          }
          config.projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
          firebaseAdmin.initializeApp(config);
        }
        
        const response = await firebaseAdmin.messaging().send(payload);
        console.log("[FCM DISPATCHER] Success sending to topic:", response);
        return NextResponse.json({ success: true, messageId: response, payload });
      } else {
        console.log("[FCM DISPATCHER] No Firebase Admin credentials found. Operating in Mock mode.");
      }
    } catch (adminErr: any) {
      console.error("[FCM DISPATCHER] Firebase Admin SDK send failed, falling back to mock:", adminErr.message);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Peringatan darurat disiarkan (Mode Mock/Simulasi)", 
      payload 
    });
  } catch (err: any) {
    console.error("[FCM DISPATCHER] Error in send-alert route:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
