"use client";

import { useState } from "react";
import TimeSelector from "@/components/TimeSelector";
import ReadingPack from "@/components/ReadingPack";
import Reader from "@/components/Reader";
import { getRecommendations, createManualSession, RecommendResponse } from "@/lib/api";

type View = "home" | "pack" | "reading";

const CONTENT_TYPES = [
  { label: "Any", value: "" },
  { label: "Threads", value: "twitter_thread" },
  { label: "Substack", value: "substack" },
  { label: "Articles", value: "article" },
  { label: "PDF", value: "pdf_report" },
];

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [timeBudget, setTimeBudget] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState<RecommendResponse | null>(null);
  const [chunkMode, setChunkMode] = useState(false);
  const [chunkContentIds, setChunkContentIds] = useState<string[]>([]);

  const handleGetRecommendations = async () => {
    if (!timeBudget) return;

    setLoading(true);
    setError("");
    try {
      const res = await getRecommendations({
        time_budget: timeBudget || undefined,
        topic: topic || undefined,
        content_type: contentType || undefined,
      });
      setRecommendation(res);
      setView("pack");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get recommendations";
      setError(msg.toLowerCase().includes("404") || msg.toLowerCase().includes("no item")
        ? "EMPTY_LIBRARY"
        : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBeginSession = () => {
    setView("reading");
  };

  const handleEndSession = () => {
    setView("home");
    setRecommendation(null);
    setTimeBudget(null);
    setTopic("");
    setChunkMode(false);
    setChunkContentIds([]);
  };

  const handleRound2 = async () => {
    if (!timeBudget || chunkContentIds.length === 0 || !recommendation) return;
    try {
      const result = await createManualSession({
        content_ids: chunkContentIds,
        time_budget: timeBudget,
      });
      setRecommendation(result);
    } catch (err) {
      console.error("Round 2 failed:", err);
    }
  };

  // Reading view
  if (view === "reading" && recommendation) {
    return (
      <Reader
        key={recommendation.session_id}
        items={recommendation.items}
        onEndSession={handleEndSession}
        chunkMode={chunkMode}
        timeBudget={timeBudget ?? 0}
        onRequestRound2={handleRound2}
      />
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px]"></div>
      </div>

      {/* Left side decorative element */}
      <div className="hidden lg:flex fixed left-8 top-1/2 -translate-y-1/2 flex-col items-center gap-6 text-accent/20 z-10">
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-accent/20 to-transparent"></div>
        <span className="text-[9px] uppercase tracking-[0.5em] writing-mode-vertical font-medium" style={{ writingMode: "vertical-rl" }}>
          curated reads
        </span>
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-accent/20 to-transparent"></div>
      </div>

      {/* Right side decorative element */}
      <div className="hidden lg:flex fixed right-8 top-1/2 -translate-y-1/2 flex-col items-center gap-6 text-accent/20 z-10">
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-accent/20 to-transparent"></div>
        <span className="text-[9px] uppercase tracking-[0.5em] font-medium" style={{ writingMode: "vertical-rl" }}>
          {timeBudget ? `${timeBudget} min session` : "select time"}
        </span>
        <div className="w-px h-24 bg-gradient-to-b from-transparent via-accent/20 to-transparent"></div>
      </div>

      <div className="w-full max-w-[700px] space-y-4 md:space-y-6 relative z-10 pt-14">
        <header className="absolute top-0 w-full flex items-center justify-between px-6 lg:px-16 py-4 border-b border-accent/10 left-0">
          <div className="flex items-center gap-3">
            <h2 className="text-accent font-serif italic text-xl tracking-tight">TimeRead</h2>
          </div>
          <a href="/archive" className="text-[10px] uppercase tracking-[0.2em] font-medium text-accent/60 hover:text-accent transition-colors">
            Library
          </a>
        </header>

        {view === "home" && (
          <>
            {/* Time Selector */}
            <TimeSelector value={timeBudget} onChange={setTimeBudget} />

            {/* Error */}
            {error && error !== "EMPTY_LIBRARY" && (
              <p className="text-sm text-center mb-4" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            {error === "EMPTY_LIBRARY" && (
              <div className="text-center mb-4 space-y-2">
                <p className="text-sm" style={{ color: "var(--danger)" }}>
                  Your library is empty — save some articles first.
                </p>
                <a href="/archive" className="text-xs text-accent/70 hover:text-accent underline underline-offset-4 transition-colors">
                  Go to Archive →
                </a>
              </div>
            )}

            {/* Begin Reading button — prominent but compact */}
            <div className="pt-2 md:pt-4 flex justify-center">
              <button
                className="group flex items-center justify-center gap-3 w-full max-w-sm px-10 py-5 bg-transparent border-2 border-accent/30 rounded-full text-accent hover:bg-accent hover:text-[#0f0f0f] transition-all duration-500 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-accent"
                disabled={!timeBudget}
                onClick={() => setShowModal(true)}
              >
                <span className="uppercase tracking-[0.25em] text-sm md:text-base font-bold">
                  Begin Reading
                </span>
                <span className="text-lg transition-transform group-hover:translate-x-2">→</span>
              </button>
            </div>

            {/* Preferences Modal Overlay */}
            {showModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity">
                <div className="bg-[#0f0f0f] border border-accent/20 rounded-2xl w-full max-w-md p-8 shadow-2xl relative">
                  <button
                    onClick={() => setShowModal(false)}
                    className="absolute top-4 right-4 text-accent/50 hover:text-accent transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>

                  <h3 className="text-2xl font-serif italic text-accent mb-6">Refine your session</h3>

                  <div className="space-y-6">
                    {/* Topic input */}
                    <div className="space-y-2">
                      <label className="text-muted uppercase tracking-widest text-[10px] font-bold">Topic (optional)</label>
                      <input
                        className="w-full bg-[#1f1b13] border border-accent/10 rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none text-slate-100 placeholder:text-accent/20 transition-colors"
                        placeholder="e.g. AI, startups, history..."
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                      />
                    </div>

                    {/* Content type filter */}
                    <div className="space-y-3">
                      <label className="text-muted uppercase tracking-widest text-[10px] font-bold">Content type</label>
                      <div className="flex gap-2 flex-wrap">
                        {CONTENT_TYPES.map((ct) => (
                          <button
                            key={ct.value}
                            className={`pill text-[11px] ${contentType === ct.value ? "active" : ""}`}
                            onClick={() => setContentType(ct.value)}
                          >
                            {ct.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4">
                      <button
                        className="w-full bg-accent text-[#0f0f0f] py-4 rounded-xl font-bold uppercase tracking-[0.15em] hover:bg-accent-hover transition-colors flex justify-center items-center gap-2"
                        disabled={loading}
                        onClick={() => {
                          setShowModal(false);
                          handleGetRecommendations();
                        }}
                      >
                        {loading ? "Finding..." : "Find Reads"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {view === "pack" && recommendation && (
          <>
            <ReadingPack
              items={recommendation.items}
              targetTime={timeBudget!}
              onBeginSession={(sessionItems, isChunkMode, contentIds) => {
                setRecommendation({
                  ...recommendation,
                  items: sessionItems,
                  total_estimated_time: sessionItems.reduce((acc, item) => acc + item.estimated_time, 0),
                });
                setChunkMode(isChunkMode);
                setChunkContentIds(contentIds);
                handleBeginSession();
              }}
            />
            <button
              className="btn-ghost w-full"
              onClick={() => { setView("home"); setRecommendation(null); }}
            >
              ← Change preferences
            </button>
          </>
        )}
      </div>
    </main>
  );
}
