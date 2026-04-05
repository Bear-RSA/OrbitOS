import { NextRequest, NextResponse } from "next/server";

// Tasks API is handled client-side via Firestore SDK for MVP
// This route exists for future server-side task operations

export async function GET(req: NextRequest) {
  return NextResponse.json({ message: "Tasks API - use client SDK for MVP" });
}
