"use client";

import { useState } from "react";
import { ingestContent } from "@/lib/api";

export default function UrlIngestPanel() {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    async function handleIngest() {
        const trimmed = url.trim();
        if (!trimmed) return;

        setLoading(true);
        setMessage(null);
        try {
            const result = await ingestContent({ url: trimmed });
            setMessage({ text: result.message || "Content queued for processing", type: "success" });
            setUrl("");
        } catch (err) {
            setMessage({
                text: err instanceof Error ? err.message : "Failed to ingest content",
                type: "error",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 text-accent">
                <span className="material-symbols-outlined">link</span>
                <h3 className="font-bold">Paste URL</h3>
            </div>
            <p className="text-sm text-accent/50">Save articles, newsletters, or blog posts instantly.</p>
            <input
                className="w-full bg-[#1f1b13] border border-accent/10 rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none text-slate-100"
                placeholder="https://example.com/article"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIngest()}
            />
            {message && (
                <p className={`text-xs ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
                    {message.text}
                </p>
            )}
            <button
                className="w-full bg-accent text-[#0f0f0f] py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                onClick={handleIngest}
                disabled={loading || !url.trim()}
            >
                {loading ? "Ingesting..." : "Ingest Content"}
            </button>
        </div>
    );
}
