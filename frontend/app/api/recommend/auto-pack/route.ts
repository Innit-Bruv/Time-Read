import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_SECRET = process.env.INTERNAL_API_SECRET || "dev-secret-change-me";

/** Proxy POST /api/recommend/auto-pack → backend POST /recommend/auto-pack */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const response = await fetch(`${API_URL}/recommend/auto-pack`, {
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
