import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_SECRET = process.env.INTERNAL_API_SECRET || "dev-secret-change-me";

/**
 * Proxy POST /api/upload-pdf → backend POST /upload-pdf
 *
 * Forwards multipart/form-data directly — do NOT set Content-Type manually,
 * the browser/fetch sets it with the correct boundary.
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();

        const response = await fetch(`${API_URL}/upload-pdf`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${API_SECRET}`,
                // Do NOT set Content-Type — fetch sets it automatically with boundary
            },
            body: formData,
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: unknown) {
        return NextResponse.json(
            { detail: error instanceof Error ? error.message : "Upload failed" },
            { status: 500 }
        );
    }
}
