import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_SECRET = process.env.INTERNAL_API_SECRET || "dev-secret-change-me";

/** Proxy DELETE /api/content/[contentId]/delete → backend DELETE /content/{id} */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;
  try {
    const response = await fetch(
      `${API_URL}/content/${contentId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${API_SECRET}` },
      }
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
