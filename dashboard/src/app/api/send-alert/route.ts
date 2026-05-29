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
      },
    };

    console.log("[FCM DISPATCHER] Dispatching payload to topic 'siaga_anak_hilang':", JSON.stringify(payload, null, 2));

    try {
      // Lazy load firebase-admin so it does not fail initialization if credentials are empty
      const firebaseAdmin = require("firebase-admin");
      
      const hasCredentials = process.env.FIREBASE_SERVICE_ACCOUNT || 
                             process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                             process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      if (hasCredentials) {
        if (firebaseAdmin.apps.length === 0) {
          firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert(
              process.env.FIREBASE_SERVICE_ACCOUNT 
                ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
                : undefined
            ),
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
          });
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
