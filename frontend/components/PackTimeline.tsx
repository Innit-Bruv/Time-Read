"use client";

import { RecommendItem } from "@/lib/api";

interface PackTimelineProps {
    items: RecommendItem[];
    totalMinutes: number;
    targetMinutes: number;
    onCustomize: () => void;
    onStartReading: () => void;
}

function contentTypeLabel(type: string): string {
    switch (type) {
        case "twitter_thread": return "Thread";
        case "substack": return "Substack";
        case "article": return "Article";
        case "pdf_report": return "PDF";
        case "research_paper": return "Paper";
        default: return type;
    }
}

export default function PackTimeline({
    items,
    totalMinutes,
    targetMinutes,
    onCustomize,
    onStartReading,
}: PackTimelineProps) {
    const isOnTarget = Math.abs(totalMinutes - targetMinutes) <= 0.5;

    return (
        <div className="w-full space-y-6">
            {/* Header */}
            <div className="text-center space-y-1">
                <p className="text-[10px] uppercase tracking-[0.3em] text-accent/50 font-medium">
                    Your {targetMinutes}-minute pack
                </p>
                <div className="flex items-center justify-center gap-2">
                    <span
                        className="text-2xl font-serif italic"
                        style={{ color: isOnTarget ? "var(--accent)" : "var(--warning, #d4a017)" }}
                    >
                        {totalMinutes} min
                    </span>
                    <span className="text-xs text-accent/40">selected</span>
                </div>
            </div>

            {/* Timeline */}
            <div className="space-y-2">
                {items.map((item, i) => (
                    <div
                        key={item.segment_id}
                        className="flex items-start gap-4 p-4 rounded-xl border border-accent/10 bg-[#0f0f0f]"
                        style={{
                            opacity: 0,
                            animation: `fadeIn 150ms ease forwards`,
                            animationDelay: `${i * 100}ms`,
                        }}
                    >
                        {/* Index */}
                        <span className="text-[10px] text-accent/30 font-mono pt-0.5 w-4 shrink-0">
                            {i + 1}
                        </span>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-medium text-slate-100 truncate leading-snug">
                                {item.title}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-accent/40 uppercase tracking-wider">
                                <span>{contentTypeLabel(item.content_type)}</span>
                                {item.source && (
                                    <>
                                        <span>·</span>
                                        <span className="truncate max-w-[120px]">{item.source}</span>
                                    </>
                                )}
                                {item.is_continuation && (
                                    <>
                                        <span>·</span>
                                        <span className="text-accent/60">continuing</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Time */}
                        <span className="text-xs font-mono text-accent/60 shrink-0 pt-0.5">
                            {item.estimated_time}m
                        </span>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
                <button
                    className="w-full flex items-center justify-center gap-3 px-10 py-5 bg-transparent border-2 border-accent/30 rounded-full text-accent hover:bg-accent hover:text-[#0f0f0f] transition-all duration-500 font-bold uppercase tracking-[0.25em] text-sm"
                    onClick={onStartReading}
                >
                    Start Reading →
                </button>
                <button
                    className="btn-ghost w-full text-xs"
                    onClick={onCustomize}
                >
                    Customize pack
                </button>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
