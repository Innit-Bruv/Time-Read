"use client";

import { useEffect, useState } from "react";
import PackTimeline from "@/components/PackTimeline";
import { getAutoPack, RecommendResponse } from "@/lib/api";

interface AutoPackViewProps {
    timeBudget: number;
    topic?: string;
    contentType?: string;
    onStartReading: (pack: RecommendResponse) => void;
    onCustomize: (pack: RecommendResponse) => void;
    onBack: () => void;
}

export default function AutoPackView({
    timeBudget,
    topic,
    contentType,
    onStartReading,
    onCustomize,
    onBack,
}: AutoPackViewProps) {
    const [pack, setPack] = useState<RecommendResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");

        getAutoPack({
            time_budget: timeBudget,
            topic: topic || undefined,
            content_type: contentType || undefined,
        })
            .then((res) => {
                if (!cancelled) setPack(res);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : "Failed to build pack";
                    setError(
                        msg.toLowerCase().includes("404") || msg.toLowerCase().includes("nothing")
                            ? "EMPTY_LIBRARY"
                            : msg
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [timeBudget, topic, contentType]);

    if (loading) {
        return (
            <div className="w-full space-y-4">
                <p className="text-center text-[10px] uppercase tracking-[0.3em] text-accent/40 font-medium">
                    Building your pack...
                </p>
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-16 rounded-xl border border-accent/10 bg-[#0f0f0f] animate-pulse"
                            style={{ opacity: 1 - i * 0.2 }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (error === "EMPTY_LIBRARY") {
        return (
            <div className="text-center space-y-3">
                <p className="text-sm" style={{ color: "var(--danger)" }}>
                    Your library is empty — save some articles first.
                </p>
                <a href="/archive" className="text-xs text-accent/70 hover:text-accent underline underline-offset-4 transition-colors">
                    Go to Archive →
                </a>
                <button className="btn-ghost w-full mt-2 text-xs" onClick={onBack}>← Change time</button>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center space-y-3">
                <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
                <button className="btn-ghost w-full text-xs" onClick={onBack}>← Go back</button>
            </div>
        );
    }

    if (!pack) return null;

    return (
        <PackTimeline
            items={pack.items}
            totalMinutes={pack.total_estimated_time}
            targetMinutes={timeBudget}
            onStartReading={() => onStartReading(pack)}
            onCustomize={() => onCustomize(pack)}
        />
    );
}
