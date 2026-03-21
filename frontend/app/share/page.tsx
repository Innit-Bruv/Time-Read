"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ingestContent } from "@/lib/api";

function ShareContent() {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState("Saving shared content...");

    useEffect(() => {
        const handleShare = async () => {
            const sharedUrl = searchParams.get("url") || "";
            const sharedTitle = searchParams.get("title") || "";
            const sharedText = searchParams.get("text") || "";

            const url = sharedUrl || extractUrl(sharedText) || "";

            if (!url) {
                setStatus("error");
                setMessage("No URL found in shared content.");
                return;
            }

            try {
                const result = await ingestContent({
                    url,
                    title: sharedTitle || undefined,
                });
                setStatus("success");
                setMessage(`Saved! ${result.message}`);
                setTimeout(() => { window.location.href = "/"; }, 1500);
            } catch (err: unknown) {
                setStatus("error");
                setMessage(err instanceof Error ? err.message : "Failed to save content.");
            }
        };

        handleShare();
    }, [searchParams]);

    return (
        <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
                TimeRead
            </h1>
            <div className="card p-6">
                {status === "loading" && <div className="text-accent">⏳ Saving...</div>}
                {status === "success" && <div style={{ color: "var(--success)" }}>✓ {message}</div>}
                {status === "error" && <div style={{ color: "var(--danger)" }}>✕ {message}</div>}
            </div>
            {status === "error" && (
                <Link href="/" className="text-sm text-muted hover:text-accent">← Go Home</Link>
            )}
        </div>
    );
}

export default function SharePage() {
    return (
        <main className="min-h-screen flex items-center justify-center px-4">
            <Suspense fallback={<div className="text-muted">Loading...</div>}>
                <ShareContent />
            </Suspense>
        </main>
    );
}

function extractUrl(text: string): string | null {
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : null;
}
