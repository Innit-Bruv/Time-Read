"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RecommendItem, getSegment, trackReading, SegmentResponse } from "@/lib/api";

interface ReaderProps {
    items: RecommendItem[];
    onEndSession: () => void;
}

export default function Reader({ items, onEndSession }: ReaderProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [segment, setSegment] = useState<SegmentResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [startTime, setStartTime] = useState<number>(Date.now());
    const [wordsRead, setWordsRead] = useState(0);
    const [showEndCard, setShowEndCard] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const currentItem = items[currentIndex];
    const totalTime = items.reduce((sum, i) => sum + i.estimated_time, 0);
    const completedTime = items.slice(0, currentIndex).reduce((sum, i) => sum + i.estimated_time, 0);
    const sessionProgress = totalTime > 0 ? completedTime / totalTime : 0;
    const timeRemaining = totalTime - completedTime;

    // Scroll-based reading progress (Kindle-style, Fix 8)
    const scrollPercent = segment ? Math.min(Math.floor((wordsRead / Math.max(segment.word_count, 1)) * 100), 100) : 0;

    // Load segment text
    const loadSegment = useCallback(async () => {
        if (!currentItem) return;
        setLoading(true);
        setShowEndCard(false);
        try {
            const data = await getSegment(currentItem.content_id, currentItem.segment_id);
            setSegment(data);
            setStartTime(Date.now());
            setWordsRead(0);
            scrollRef.current?.scrollTo(0, 0);
        } catch (err) {
            console.error("Failed to load segment:", err);
        } finally {
            setLoading(false);
        }
    }, [currentItem]);

    useEffect(() => {
        loadSegment();
    }, [loadSegment]);

    // Track reading on scroll
    useEffect(() => {
        const handleScroll = () => {
            if (!scrollRef.current || !segment) return;
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const pct = scrollTop / (scrollHeight - clientHeight);
            const newWordsRead = Math.floor(pct * segment.word_count);
            setWordsRead(newWordsRead);

            // Show end card when user reaches ~90% of the article
            if (pct > 0.88 && !showEndCard) {
                setShowEndCard(true);
            }
        };

        const el = scrollRef.current;
        el?.addEventListener("scroll", handleScroll, { passive: true });
        return () => el?.removeEventListener("scroll", handleScroll);
    }, [segment, showEndCard]);

    const handleTrack = async (completed: boolean) => {
        if (!currentItem) return;
        const timeSpent = (Date.now() - startTime) / 1000;
        try {
            await trackReading({
                segment_id: currentItem.segment_id,
                time_spent: timeSpent,
                words_read: wordsRead,
                completed,
            });
        } catch (err) {
            console.error("Failed to track reading:", err);
        }
    };

    const handleNext = async () => {
        await handleTrack(true);
        if (currentIndex < items.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            onEndSession();
        }
    };

    const handleEndSession = async () => {
        await handleTrack(false);
        onEndSession();
    };

    if (!currentItem) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1f1b13] text-[#f1f5f9]/90 transition-colors duration-300" ref={scrollRef}>
            {/* Top Session Progress Bar (Fix 4) — shows total reading goal */}
            <div className="fixed top-0 left-0 w-full z-50">
                <div className="h-1 w-full bg-accent/10">
                    <div
                        className="h-full bg-accent shadow-[0_0_8px_rgba(232,213,176,0.6)] transition-all ease-out duration-500"
                        style={{ width: `${sessionProgress * 100}%` }}
                    ></div>
                </div>
            </div>

            {/* Floating Nav */}
            <nav className="fixed top-0 left-0 w-full px-6 py-6 flex justify-between items-center z-40 bg-gradient-to-b from-[#1f1b13] via-[#1f1b13]/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <span className="text-xs uppercase tracking-[0.2em] font-medium text-accent/60">TimeRead</span>
                    <span className="text-accent/20">|</span>
                    <span className="text-[10px] uppercase tracking-widest text-accent/40">
                        {currentIndex + 1} of {items.length}
                    </span>
                </div>
                <div className="flex items-center gap-6 pointer-events-auto">
                    <button onClick={handleEndSession} className="text-accent/40 hover:text-accent transition-colors text-xs uppercase tracking-widest px-4 py-2 border border-accent/10 hover:border-accent/40 rounded-full">
                        Exit Session
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative flex flex-col items-center px-6 pt-28 pb-48">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-accent/50 uppercase tracking-widest text-sm">Loading segment...</div>
                    </div>
                ) : segment ? (
                    <article className="w-full max-w-[680px]">
                        <header className="mb-16">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent py-1 px-2 border border-accent/20 rounded">
                                    {segment.source || "Web"}
                                </span>
                                <span className="text-xs text-accent/40">{Math.round(currentItem.estimated_time)} min read</span>
                                {segment.total_segments > 1 && (
                                    <span className="text-xs text-accent/40">· Part {segment.segment_index + 1} of {segment.total_segments}</span>
                                )}
                            </div>
                            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-slate-100 leading-tight mb-8" style={{ fontFamily: "var(--font-lora)" }}>
                                {segment.title}
                            </h1>
                            {segment.author && (
                                <div className="flex items-center gap-4 py-6 border-y border-accent/10">
                                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-accent/50">person</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-100">{segment.author}</p>
                                        <p className="text-xs text-accent/40">Author</p>
                                    </div>
                                </div>
                            )}
                        </header>

                        <section className="font-serif text-xl md:text-2xl reader-text text-slate-100/90 space-y-10">
                            {segment.text.split("\n\n").map((para, i) => (
                                <p key={i}>{para}</p>
                            ))}
                        </section>

                        {/* End-of-piece card (Fix 7) — Continue or Move On */}
                        <footer className="mt-20 pt-12 border-t border-accent/10">
                            <div className="flex flex-col items-center gap-6">
                                <div className="text-center mb-4">
                                    <p className="text-[10px] uppercase tracking-[0.3em] text-accent/40 mb-2">
                                        Finished reading
                                    </p>
                                    <p className="text-accent font-serif italic text-2xl">{segment.title}</p>
                                </div>

                                {/* Continue reading this piece (if multi-segment) */}
                                {segment.total_segments > 1 && segment.segment_index < segment.total_segments - 1 && (
                                    <button
                                        onClick={handleNext}
                                        className="w-full max-w-sm bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90 flex justify-center items-center gap-2"
                                    >
                                        Continue Reading →
                                    </button>
                                )}

                                {/* Next piece in reading list */}
                                {currentIndex < items.length - 1 ? (
                                    <div className="w-full max-w-sm space-y-3">
                                        <button
                                            onClick={handleNext}
                                            className="w-full bg-accent/10 border border-accent/20 text-accent py-4 rounded-xl font-bold uppercase tracking-[0.12em] transition-all hover:bg-accent/20 flex justify-center items-center gap-2"
                                        >
                                            Next: {items[currentIndex + 1].title.slice(0, 35)}{items[currentIndex + 1].title.length > 35 ? "..." : ""} →
                                        </button>
                                        <button
                                            onClick={handleEndSession}
                                            className="w-full py-3 text-[11px] uppercase tracking-widest text-accent/40 hover:text-accent border border-accent/10 hover:border-accent/30 rounded-xl transition-all"
                                        >
                                            End Session
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-full max-w-sm space-y-3">
                                        <div className="text-center py-4">
                                            <p className="text-accent/60 text-sm mb-1">🎉 You&apos;ve completed your reading session!</p>
                                            <p className="text-accent/30 text-xs">{Math.round(totalTime)} minutes well spent</p>
                                        </div>
                                        <button
                                            onClick={onEndSession}
                                            className="w-full bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] transition-all hover:opacity-90"
                                        >
                                            Back to Home
                                        </button>
                                    </div>
                                )}
                            </div>
                        </footer>
                    </article>
                ) : (
                    <div className="text-center text-accent/50 pt-20">Failed to load content.</div>
                )}
            </main>

            {/* Bottom Floating Kindle-style Stats Pill (Fix 8) */}
            {segment && !showEndCard && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-[#0f0f0f]/90 backdrop-blur-md border border-accent/10 rounded-full flex items-center gap-6 shadow-2xl transition-all duration-500">
                    {/* Mini progress bar inside the pill */}
                    <div className="flex items-center gap-3">
                        <div className="w-20 h-1 bg-accent/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-accent rounded-full transition-all duration-300"
                                style={{ width: `${scrollPercent}%` }}
                            ></div>
                        </div>
                        <span className="text-[11px] text-accent font-bold tabular-nums">
                            {scrollPercent}%
                        </span>
                    </div>
                    <div className="h-4 w-px bg-accent/20"></div>
                    <span className="text-[10px] text-accent/60 uppercase tracking-widest">
                        {Math.ceil(timeRemaining)} min left in session
                    </span>
                </div>
            )}
        </div>
    );
}
