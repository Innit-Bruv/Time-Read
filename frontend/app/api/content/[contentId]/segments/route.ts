import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_SECRET = process.env.INTERNAL_API_SECRET || "dev-secret-change-me";

/** Proxy GET /api/content/[contentId]/segments → backend */
export async function GET(
  _request: NextRequest,
  { params }: { params: { contentId: string } }
) {
  try {
    const response = await fetch(
      `${API_URL}/content/${params.contentId}/segments`,
      { headers: { Authorization: `Bearer ${API_SECRET}` } }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Proxy error" },
      { status: 500 }
    );
  }
}
