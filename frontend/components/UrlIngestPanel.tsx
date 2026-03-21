"use client";

import { useState, useEffect, useRef } from "react";
import { ingestContent, getContentStatus } from "@/lib/api";

type SaveState = "idle" | "saving" | "processing" | "ready" | "error";

export default function UrlIngestPanel() {
    const [url, setUrl] = useState("");
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (resetRef.current) clearTimeout(resetRef.current);
        };
    }, []);

    function startPolling(contentId: string) {
        setSaveState("processing");
        pollRef.current = setInterval(async () => {
            try {
                const status = await getContentStatus(contentId);
                if (status.status === "ready") {
                    if (pollRef.current) clearInterval(pollRef.current);
                    setSaveState("ready");
                    resetRef.current = setTimeout(() => setSaveState("idle"), 5000);
                } else if (status.status === "failed") {
                    if (pollRef.current) clearInterval(pollRef.current);
                    setErrorMsg(status.error_message || "Processing failed");
                    setSaveState("error");
                }
            } catch {
                // Transient poll failure — keep trying
            }
        }, 2000);
    }

    async function handleIngest() {
        const trimmed = url.trim();
        if (!trimmed) return;
        if (pollRef.current) clearInterval(pollRef.current);
        if (resetRef.current) clearTimeout(resetRef.current);

        setSaveState("saving");
        setErrorMsg("");
        try {
            const result = await ingestContent({ url: trimmed });
            setUrl("");
            startPolling(result.content_id);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Failed to ingest content");
            setSaveState("error");
        }
    }

    const buttonLabel = {
        idle: "Ingest Content",
        saving: "Saving...",
        processing: "Processing...",
        ready: "Ready ✓",
        error: "Ingest Content",
    }[saveState];

    const statusColor = {
        idle: "",
        saving: "text-accent/70",
        processing: "text-accent/70",
        ready: "text-green-400",
        error: "text-red-400",
    }[saveState];

    const statusText = {
        idle: "",
        saving: "Saving...",
        processing: "Processing — this takes a few seconds",
        ready: "Ready! Check your library.",
        error: errorMsg,
    }[saveState];

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
                disabled={saveState === "saving" || saveState === "processing"}
            />
            {statusText && (
                <p className={`text-xs ${statusColor}`}>{statusText}</p>
            )}
            <button
                className={`w-full py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-40 ${
                    saveState === "ready"
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-accent text-[#0f0f0f] hover:opacity-90"
                }`}
                onClick={handleIngest}
                disabled={saveState === "saving" || saveState === "processing" || saveState === "ready" || !url.trim()}
            >
                {buttonLabel}
            </button>
        </div>
    );
}
