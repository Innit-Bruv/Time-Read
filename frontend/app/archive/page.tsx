"use client";

import { useState, useRef } from "react";
import ArchiveList from "@/components/ArchiveList";
import RSSFeedInput from "@/components/RSSFeedInput";
import UrlIngestPanel from "@/components/UrlIngestPanel";
import Reader from "@/components/Reader";
import Link from "next/link";
import { ArchiveItem, RecommendItem, getContentSegments } from "@/lib/api";

export default function ArchivePage() {
    const [readingItems, setReadingItems] = useState<RecommendItem[] | null>(null);
    const [loadingContentId, setLoadingContentId] = useState<string | null>(null);
    const [readError, setReadError] = useState<string | null>(null);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [pdfMessage, setPdfMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePdfUpload = async (file: File) => {
        if (!file.name.toLowerCase().endsWith(".pdf")) {
            setPdfMessage({ type: "error", text: "Only PDF files are supported" });
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setPdfMessage({ type: "error", text: "PDF too large (max 20MB)" });
            return;
        }
        setUploadingPdf(true);
        setPdfMessage(null);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name.replace(/\.pdf$/i, "").replace(/_/g, " "));
        try {
            const res = await fetch("/api/upload-pdf", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Upload failed");
            setPdfMessage({ type: "success", text: `"${file.name}" uploaded — processing…` });
        } catch (err) {
            setPdfMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed" });
        } finally {
            setUploadingPdf(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleSelectItem = async (item: ArchiveItem) => {
        if (item.status !== "ready") {
            setReadError(`"${item.title}" is still ${item.status} — check back in a moment.`);
            return;
        }
        setLoadingContentId(item.content_id);
        setReadError(null);
        try {
            const res = await getContentSegments(item.content_id);
            setReadingItems(res.items);
        } catch (err: unknown) {
            setReadError(err instanceof Error ? err.message : "Failed to load content");
        } finally {
            setLoadingContentId(null);
        }
    };

    if (readingItems) {
        return (
            <Reader
                items={readingItems}
                onEndSession={() => setReadingItems(null)}
            />
        );
    }

    return (
        <main className="min-h-screen max-w-6xl mx-auto px-8 py-12">
            <div className="flex items-center justify-between mb-10">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-[#f1f5f9] mb-2 font-display">
                        My Archive
                    </h1>
                    <p className="text-accent/60">
                        Manage and explore your curated digital library of knowledge.
                    </p>
                </div>
                <Link
                    href="/"
                    className="text-xs uppercase tracking-[0.2em] font-medium text-accent hover:text-accent/60 transition-colors border border-accent/20 px-6 py-2 rounded-full"
                >
                    ← Home
                </Link>
            </div>

            {readError && (
                <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
                    {readError}
                    <button className="ml-4 text-red-400/60 hover:text-red-400" onClick={() => setReadError(null)}>✕</button>
                </div>
            )}

            {/* Upload & Ingest Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
                <div
                    className={`lg:col-span-2 group flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 bg-accent/5 transition-all cursor-pointer ${isDragOver ? "border-accent/60 bg-accent/10" : "border-accent/20 hover:border-accent/40"}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        const file = e.dataTransfer.files[0];
                        if (file) handlePdfUpload(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePdfUpload(file); }}
                    />
                    <div className="size-12 rounded-full bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">{uploadingPdf ? "hourglass_empty" : "upload_file"}</span>
                    </div>
                    <h3 className="text-lg font-bold mb-1 text-slate-100">Upload PDF Documents</h3>
                    <p className="text-sm text-accent/50 mb-6 text-center">Drag and drop your research papers or books here to begin ingestion</p>
                    <button
                        disabled={uploadingPdf}
                        className="bg-accent/10 text-accent border border-accent/20 px-6 py-2 rounded-lg text-sm font-bold hover:bg-accent/20 transition-colors disabled:opacity-40"
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    >
                        {uploadingPdf ? "Uploading…" : "Browse Local Files"}
                    </button>
                    {pdfMessage && (
                        <p className={`text-xs mt-3 ${pdfMessage.type === "error" ? "text-red-400" : "text-green-400"}`}>
                            {pdfMessage.text}
                        </p>
                    )}
                </div>
                <div className="flex flex-col gap-6 p-8 border border-accent/10 rounded-xl bg-[#0f0f0f]">
                    <UrlIngestPanel />
                </div>
            </div>

            {/* RSS Feed Input */}
            <div className="mb-12">
                <RSSFeedInput />
            </div>

            <ArchiveList
                onSelectItem={handleSelectItem}
                loadingContentId={loadingContentId}
            />
        </main>
    );
}
