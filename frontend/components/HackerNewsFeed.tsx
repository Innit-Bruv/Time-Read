"use client";

import { useState, useEffect, useCallback } from "react";
import { ingestContent } from "@/lib/api";
import { getDomain } from "@/lib/utils";

interface HNStory {
    id: number;
    title: string;
    url?: string;
    score: number;
    by: string;
    descendants: number; // comment count
    time: number;
}

export default function HackerNewsFeed() {
    const [stories, setStories] = useState<HNStory[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState<Set<number>>(new Set());
    const [saved, setSaved] = useState<Set<number>>(new Set());
    const [mounted, setMounted] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (expanded && stories.length === 0) {
            setLoading(true);
            fetchTopStories();
        }
    }, [expanded]);

    async function fetchTopStories() {
        try {
            const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
            const ids: number[] = await res.json();
            const top10 = ids.slice(0, 10);

            const storyPromises = top10.map(async (id) => {
                const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
                return r.json() as Promise<HNStory>;
            });

            const results = await Promise.all(storyPromises);
            // Only show stories with URLs (skip Ask HN, Show HN text-only)
            const filtered = results.filter((s) => s.url);
            setStories(filtered);
        } catch (err) {
            console.error("Failed to fetch HN stories:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(story: HNStory) {
        setSaving((prev) => new Set(prev).add(story.id));
        try {
            await ingestContent({
                url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
                title: story.title,
            });
            setSaved((prev) => new Set(prev).add(story.id));
        } catch (err) {
            console.error("Failed to save story:", err);
        } finally {
            setSaving((prev) => {
                const next = new Set(prev);
                next.delete(story.id);
                return next;
            });
        }
    }

    function timeAgo(unixTime: number): string {
        const diff = Math.floor(Date.now() / 1000 - unixTime);
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    if (!expanded) {
        return (
            <div
                onClick={() => setExpanded(true)}
                className="border border-accent/10 rounded-xl p-5 bg-[#0f0f0f] cursor-pointer hover:border-accent/30 transition-all group"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">🔶</span>
                        <h3 className="font-bold text-slate-100">Hacker News</h3>
                        <span className="text-xs text-accent/40">Top Stories</span>
                    </div>
                    <span className="text-xs text-accent/40 group-hover:text-accent transition-colors">Show ↓</span>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="border border-accent/10 rounded-xl p-6 bg-[#0f0f0f]">
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl">🔶</span>
                    <h3 className="font-bold text-slate-100">Hacker News</h3>
                </div>
                <div className="text-sm text-accent/40 text-center py-8">Loading top stories...</div>
            </div>
        );
    }

    return (
        <div className="border border-accent/10 rounded-xl bg-[#0f0f0f] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-accent/10">
                <div className="flex items-center gap-3">
                    <span className="text-xl">🔶</span>
                    <h3 className="font-bold text-slate-100">Hacker News — Top Stories</h3>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setLoading(true); fetchTopStories(); }}
                        className="text-[10px] uppercase tracking-widest text-accent/50 hover:text-accent transition-colors"
                    >
                        Refresh
                    </button>
                    <button
                        onClick={() => setExpanded(false)}
                        className="text-[10px] uppercase tracking-widest text-accent/50 hover:text-accent transition-colors"
                    >
                        Hide ↑
                    </button>
                </div>
            </div>

            <div className="divide-y divide-accent/5">
                {stories.map((story, i) => (
                    <div key={story.id} className="flex items-start gap-3 p-4 hover:bg-accent/5 transition-colors group">
                        <span className="text-accent/30 text-xs font-mono pt-1 w-5 text-right shrink-0">
                            {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <a
                                href={story.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-slate-200 hover:text-accent transition-colors leading-snug block"
                            >
                                {story.title}
                            </a>
                            <div className="flex items-center gap-3 text-[11px] text-accent/40 mt-1">
                                <span>{story.score} pts</span>
                                <span>{story.by}</span>
                                <span>{getDomain(story.url || "")}</span>
                                <span>{story.descendants || 0} comments</span>
                                <span>{mounted ? timeAgo(story.time) : ""}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => handleSave(story)}
                            disabled={saving.has(story.id) || saved.has(story.id)}
                            className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                                saved.has(story.id)
                                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                                    : saving.has(story.id)
                                    ? "border-accent/20 text-accent/50 opacity-50"
                                    : "border-accent/20 text-accent/60 hover:border-accent hover:text-accent opacity-0 group-hover:opacity-100"
                            }`}
                        >
                            {saved.has(story.id) ? "Saved ✓" : saving.has(story.id) ? "..." : "+ Save"}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
