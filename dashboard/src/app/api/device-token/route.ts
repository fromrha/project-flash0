import { NextResponse } from "next/server";

// Simple in-memory store for the hackathon simulator token
let globalSimulatorToken = "lp_token_siap_siar";
let latestAlert: any = null;

export async function GET() {
  return NextResponse.json({ token: globalSimulatorToken, alert: latestAlert });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (body.alert) {
      const alert = { ...body.alert };
      if (!alert.victim_info) alert.victim_info = {};
      if (typeof alert.victim_info.name !== "string" || !alert.victim_info.name.trim()) {
        alert.victim_info.name = "ANONIM";
      }
      if (typeof alert.victim_info.age !== "number" || isNaN(alert.victim_info.age) || alert.victim_info.age < 0) {
        alert.victim_info.age = 0;
      }
      if (typeof alert.victim_info.last_clothing !== "string" || !alert.victim_info.last_clothing.trim()) {
        alert.victim_info.last_clothing = "Pakaian tidak didetailkan";
      }

      if (!alert.incident_info) alert.incident_info = {};
      if (typeof alert.incident_info.last_seen_location !== "string" || !alert.incident_info.last_seen_location.trim()) {
        alert.incident_info.last_seen_location = "TIDAK DIKETAHUI";
      }
      if (!alert.incident_info.geo_coordinates) {
        alert.incident_info.geo_coordinates = { latitude: -6.2088, longitude: 106.8456 };
      }
      if (typeof alert.incident_info.suspect_description !== "string" || !alert.incident_info.suspect_description.trim()) {
        alert.incident_info.suspect_description = "Mencari petunjuk kendaraan...";
      }

      if (typeof alert.ai_summary !== "string" || !alert.ai_summary.trim()) {
        alert.ai_summary = `SIAGA: ${alert.victim_info.name} (${alert.victim_info.age > 0 ? `${alert.victim_info.age}th` : "Anak"}), diculik dekat ${alert.incident_info.last_seen_location}!`;
      }

      latestAlert = alert;
      return NextResponse.json({ success: true, alert: latestAlert });
    }
    return NextResponse.json({ success: false, error: "No alert provided" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.token) {
      globalSimulatorToken = body.token;
      return NextResponse.json({ success: true, token: globalSimulatorToken });
    }
    return NextResponse.json({ success: false, error: "No token provided" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
}
