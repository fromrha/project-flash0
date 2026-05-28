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
      latestAlert = body.alert;
      return NextResponse.json({ success: true });
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
