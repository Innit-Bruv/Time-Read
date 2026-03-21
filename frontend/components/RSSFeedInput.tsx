"use client";

import { useState } from "react";
import { ingestContent, getContentStatus } from "@/lib/api";
import { getDomain } from "@/lib/utils";

interface RSSEntry {
    title: string;
    link: string;
    pubDate: string;
}

export default function RSSFeedInput() {
    const [feedUrl, setFeedUrl] = useState("");
    const [entries, setEntries] = useState<RSSEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState<Set<string>>(new Set());
    const [saved, setSaved] = useState<Set<string>>(new Set());
    const [processing, setProcessing] = useState<Set<string>>(new Set());
    const [ready, setReady] = useState<Set<string>>(new Set());

    async function handleFetch() {
        if (!feedUrl.trim()) return;
        setLoading(true);
        setError("");
        setEntries([]);

        try {
            // Use our server-side proxy to avoid CORS issues
            const res = await fetch(`/api/rss?url=${encodeURIComponent(feedUrl.trim())}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch feed");
            }

            setEntries(data.entries);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch RSS feed");
        } finally {
            setLoading(false);
        }
    }

    async function pollStatus(link: string, contentId: string) {
        setProcessing((prev) => new Set(prev).add(link));
        const interval = setInterval(async () => {
            try {
                const status = await getContentStatus(contentId);
                if (status.status === "ready" || status.status === "failed") {
                    clearInterval(interval);
                    setProcessing((prev) => { const n = new Set(prev); n.delete(link); return n; });
                    if (status.status === "ready") {
                        setReady((prev) => new Set(prev).add(link));
                    }
                }
            } catch { /* transient — keep polling */ }
        }, 2000);
    }

    async function handleSave(entry: RSSEntry) {
        setSaving((prev) => new Set(prev).add(entry.link));
        try {
            const result = await ingestContent({ url: entry.link, title: entry.title });
            setSaved((prev) => new Set(prev).add(entry.link));
            pollStatus(entry.link, result.content_id);
        } catch (err) {
            console.error("Failed to save article:", err);
        } finally {
            setSaving((prev) => {
                const next = new Set(prev);
                next.delete(entry.link);
                return next;
            });
        }
    }

    async function handleSaveAll() {
        const unsaved = entries.filter((e) => !saved.has(e.link));
        await Promise.allSettled(unsaved.map((entry) => handleSave(entry)));
    }

    function formatDate(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        } catch {
            return "";
        }
    }

    return (
        <div className="border border-accent/10 rounded-xl bg-[#0f0f0f] overflow-hidden">
            <div className="p-4 border-b border-accent/10">
                <div className="flex items-center gap-3 mb-3">
                    <span className="material-symbols-outlined text-accent">rss_feed</span>
                    <h3 className="font-bold text-slate-100">RSS Feed</h3>
                </div>
                <div className="flex gap-2">
                    <input
                        className="flex-1 bg-[#1f1b13] border border-accent/10 rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none text-slate-100"
                        placeholder="https://example.com/feed.xml"
                        value={feedUrl}
                        onChange={(e) => setFeedUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                    />
                    <button
                        onClick={handleFetch}
                        disabled={loading || !feedUrl.trim()}
                        className="bg-accent text-[#0f0f0f] px-5 py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-30"
                    >
                        {loading ? "..." : "Fetch"}
                    </button>
                </div>
                {error && (
                    <p className="text-xs text-red-400 mt-2">{error}</p>
                )}
                <p className="text-[10px] text-accent/30 mt-2">
                    Try: https://hnrss.org/frontpage • https://feeds.arstechnica.com/arstechnica/index
                </p>
            </div>

            {entries.length > 0 && (
                <>
                    <div className="flex items-center justify-between px-4 py-2 bg-accent/5">
                        <span className="text-xs text-accent/50">{entries.length} articles found</span>
                        <button
                            onClick={handleSaveAll}
                            className="text-[10px] uppercase tracking-widest font-bold text-accent hover:text-accent/80 transition-colors"
                        >
                            Save All
                        </button>
                    </div>
                    <div className="divide-y divide-accent/5 max-h-[400px] overflow-y-auto">
                        {entries.map((entry) => (
                            <div key={entry.link} className="flex items-start gap-3 p-3 px-4 hover:bg-accent/5 transition-colors group">
                                <div className="flex-1 min-w-0">
                                    <a
                                        href={entry.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-slate-200 hover:text-accent transition-colors leading-snug block"
                                    >
                                        {entry.title}
                                    </a>
                                    <div className="text-[11px] text-accent/40 mt-0.5">
                                        {getDomain(entry.link)} • {formatDate(entry.pubDate)}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleSave(entry)}
                                    disabled={saving.has(entry.link) || saved.has(entry.link)}
                                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                                        ready.has(entry.link)
                                            ? "bg-green-500/10 border-green-500/30 text-green-400"
                                            : processing.has(entry.link)
                                            ? "border-accent/20 text-accent/50 opacity-70"
                                            : saved.has(entry.link)
                                            ? "border-accent/20 text-accent/50 opacity-70"
                                            : saving.has(entry.link)
                                            ? "border-accent/20 text-accent/50 opacity-50"
                                            : "border-accent/20 text-accent/60 hover:border-accent hover:text-accent opacity-0 group-hover:opacity-100"
                                    }`}
                                >
                                    {ready.has(entry.link) ? "Ready ✓" : processing.has(entry.link) ? "Processing..." : saved.has(entry.link) ? "Saved" : saving.has(entry.link) ? "..." : "+ Save"}
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
