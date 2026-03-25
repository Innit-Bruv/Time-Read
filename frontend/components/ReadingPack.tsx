"use client";

import { useState } from "react";
import { RecommendItem, createManualSession } from "@/lib/api";

interface ReadingPackProps {
    items: RecommendItem[];
    targetTime: number;
    onBeginSession: (items: RecommendItem[], chunkMode: boolean, contentIds: string[]) => void;
}

function contentTypeLabel(type: string): string {
    switch (type) {
        case "twitter_thread": return "Twitter Thread";
        case "substack": return "Substack";
        case "article": return "Article";
        case "pdf_report": return "PDF Report";
        case "research_paper": return "Research Paper";
        default: return type;
    }
}

export default function ReadingPack({ items, targetTime, onBeginSession }: ReadingPackProps) {
    // Ordered array — preserves the user's tap/click sequence
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (items.length === 0) return null;

    // Resolve in selection order, not items[] order
    const selectedItems = selectedIds
        .map(id => items.find(item => item.segment_id === id))
        .filter((item): item is RecommendItem => item !== undefined);
    // Use article_total_time for display — reflects the full article, not just the chunk served
    const selectedTime = selectedItems.reduce((acc, item) => acc + (item.article_total_time ?? item.estimated_time), 0);
    const progressPercent = Math.min(100, (selectedTime / targetTime) * 100);

    // Chunk mode: N > 1 articles selected, time is split equally
    const isChunkMode = selectedItems.length > 1;
    const chunkMinutes = isChunkMode ? targetTime / selectedItems.length : 0;
    const chunkTooShort = isChunkMode && chunkMinutes < 1;

    // Single-article chunk message: article is longer than the time budget
    const singleArticleTooLong =
        selectedItems.length === 1 &&
        (selectedItems[0].article_total_time ?? selectedItems[0].estimated_time) > targetTime;

    const toggleSelection = (segmentId: string) => {
        setSelectedIds(prev =>
            prev.includes(segmentId)
                ? prev.filter(id => id !== segmentId)
                : [...prev, segmentId]
        );
    };

    const handleBeginSession = async () => {
        if (selectedItems.length === 0) return;
        setError("");

        // Always route through /session/manual for consistent chunk sizing.
        // Even single-article selections need proper time-fitted slicing —
        // the recommender only returns segment 0, but /session/manual computes
        // the correct paragraph_start/paragraph_end for the time budget.
        setLoading(true);
        try {
            const result = await createManualSession({
                content_ids: selectedItems.map(i => i.content_id),
                time_budget: targetTime,
            });
            const isChunk = selectedItems.length > 1;
            onBeginSession(
                result.items,
                isChunk,
                selectedItems.map(i => i.content_id)
            );
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to start session");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">
                    Curated For You
                </h3>
                <div className="flex items-center justify-between text-xs text-muted mb-1 px-1">
                    <span>
                        {isChunkMode
                            ? `${selectedItems.length} selected · ${Math.round(chunkMinutes * 10) / 10} min each`
                            : selectedItems.length === 0
                                ? "Select articles below"
                                : `${Math.round(selectedTime)} min`}
                    </span>
                    <span>Target: {targetTime} min</span>
                </div>
                <div className="h-1.5 w-full bg-[#1f1b13] rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ${selectedTime > targetTime ? 'bg-amber-500' : 'bg-accent'}`}
                        style={{ width: `${progressPercent}%` }}
                    ></div>
                </div>
                {chunkTooShort && (
                    <p className="text-[11px] text-amber-400/80 uppercase tracking-widest pt-1">
                        Each article gets less than 1 min — consider fewer picks
                    </p>
                )}
                {singleArticleTooLong && (
                    <p className="text-[11px] text-accent/60 tracking-wide pt-1">
                        {Math.round(selectedItems[0].article_total_time ?? selectedItems[0].estimated_time)}-min article — we&apos;ll start you with {targetTime} min. Your place is saved for next time.
                    </p>
                )}
            </div>

            <div className="space-y-3">
                {items.map((item) => {
                    const isSelected = selectedIds.includes(item.segment_id);
                    return (
                        <div
                            key={item.segment_id}
                            onClick={() => toggleSelection(item.segment_id)}
                            className={`card cursor-pointer group transition-all duration-300 ${isSelected ? 'border-accent/40 bg-accent/5' : 'border-accent/10 opacity-60 hover:opacity-100 hover:border-accent/20'}`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 pr-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span style={{ color: "var(--accent)" }} className="text-[11px] font-semibold uppercase tracking-widest">
                                            {contentTypeLabel(item.content_type)}
                                        </span>
                                        <span className="text-xs text-muted">·</span>
                                        <span className="text-[11px] uppercase tracking-wider text-muted">
                                            {Math.round(item.article_total_time ?? item.estimated_time)} min
                                        </span>
                                    </div>
                                    <h4
                                        className={`text-[22px] leading-snug transition-colors ${isSelected ? 'text-slate-100' : 'text-muted group-hover:text-slate-200'}`}
                                        style={{ fontFamily: "var(--font-serif)" }}
                                    >
                                        {item.title}
                                    </h4>
                                    {(item.author || item.source) && (
                                        <p className="text-xs tracking-wide text-muted mt-2">
                                            {item.author && <span>by {item.author}</span>}
                                            {item.author && item.source && <span> · </span>}
                                            {item.source && <span>{item.source}</span>}
                                        </p>
                                    )}
                                </div>
                                <div className={`text-2xl transition-all duration-300 flex items-center h-full pt-2 ${isSelected ? 'text-accent rotate-45' : 'text-accent/30 group-hover:text-accent/60'}`}>
                                    +
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {error && (
                <p className="text-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>
            )}

            <button
                className="btn-primary mt-4 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleBeginSession}
                disabled={selectedItems.length === 0 || loading}
            >
                {loading
                    ? "Building session…"
                    : isChunkMode
                        ? `Begin Session · ${selectedItems.length} articles · ${Math.round(chunkMinutes * 10) / 10} min each`
                        : singleArticleTooLong
                            ? `Begin Session (${targetTime} min)`
                            : `Begin Session (${Math.round(selectedTime)} min)`}
            </button>
        </div>
    );
}
