import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_SECRET = process.env.INTERNAL_API_SECRET || "dev-secret-change-me";

/** Proxy POST /api/session/manual → backend /session/manual */
export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const response = await fetch(`${API_URL}/session/manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_SECRET}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Proxy error" },
      { status: 500 }
    );
  }
}
