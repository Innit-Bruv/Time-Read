"use client";

import { useState, useEffect } from "react";
import { ArchiveItem, getArchive } from "@/lib/api";

interface ArchiveListProps {
    onSelectItem?: (item: ArchiveItem) => void;
    loadingContentId?: string | null;
}

const CONTENT_TYPE_FILTERS = [
    { label: "All", value: "" },
    { label: "Threads", value: "twitter_thread" },
    { label: "Substack", value: "substack" },
    { label: "Articles", value: "article" },
    { label: "PDF", value: "pdf_report" },
];

const SORT_OPTIONS = [
    { label: "Recent", value: "recent" },
    { label: "Oldest", value: "oldest" },
    { label: "Unread", value: "unread" },
];

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

function statusBadge(status: string) {
    const colors: Record<string, string> = {
        ready: "var(--success)",
        processing: "var(--accent)",
        pending: "var(--text-muted)",
        failed: "var(--danger)",
    };
    return (
        <span className="text-xs font-medium" style={{ color: colors[status] || "var(--text-muted)" }}>
            {status}
        </span>
    );
}

export default function ArchiveList({ onSelectItem, loadingContentId }: ArchiveListProps) {
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [contentType, setContentType] = useState("");
    const [sort, setSort] = useState("recent");
    const [loading, setLoading] = useState(false);

    const loadArchive = async () => {
        setLoading(true);
        try {
            const data = await getArchive({
                search: search || undefined,
                content_type: contentType || undefined,
                sort,
                page,
                limit: 20,
            });
            setItems(data.items);
            setTotal(data.total);
        } catch (err) {
            console.error("Failed to load archive:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadArchive();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, contentType, sort]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        loadArchive();
    };

    const totalPages = Math.ceil(total / 20);

    return (
        <div className="space-y-6">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-2">
                <input
                    className="input flex-1"
                    placeholder="Search your library..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="pill active">
                    Search
                </button>
            </form>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
                {CONTENT_TYPE_FILTERS.map((filter) => (
                    <button
                        key={filter.value}
                        className={`pill text-xs ${contentType === filter.value ? "active" : ""}`}
                        onClick={() => { setContentType(filter.value); setPage(1); }}
                    >
                        {filter.label}
                    </button>
                ))}
                <span className="text-muted mx-2">|</span>
                {SORT_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        className={`pill text-xs ${sort === opt.value ? "active" : ""}`}
                        onClick={() => { setSort(opt.value); setPage(1); }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Count */}
            <p className="text-sm text-muted">
                {total} item{total !== 1 ? "s" : ""} in library
            </p>

            {/* Items */}
            {loading ? (
                <div className="text-center text-muted py-12">Loading...</div>
            ) : items.length === 0 ? (
                <div className="text-center text-muted py-12">
                    {search ? "No results found." : "Your library is empty. Save some articles first."}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((item, index) => {
                        const gradients = [
                            "from-accent/20 to-transparent",
                            "from-blue-900/20 to-transparent",
                            "from-amber-900/20 to-transparent",
                            "from-emerald-900/20 to-transparent",
                            "from-purple-900/20 to-transparent",
                        ];
                        const grad = gradients[index % gradients.length];
                        const icons: Record<string, string> = {
                            "twitter_thread": "forum",
                            "substack": "alternate_email",
                            "article": "article",
                            "pdf_report": "picture_as_pdf",
                            "research_paper": "school",
                        };

                        const isLoading = loadingContentId === item.content_id;
                        return (
                            <div
                                key={item.content_id}
                                className={`group flex flex-col bg-accent/5 border rounded-2xl overflow-hidden transition-all cursor-pointer ${
                                    isLoading
                                        ? "border-accent/50 opacity-70 pointer-events-none"
                                        : "border-accent/5 hover:border-accent/30"
                                }`}
                                onClick={() => onSelectItem?.(item)}
                            >
                                <div className="relative aspect-[4/3] overflow-hidden bg-[#0f0f0f]">
                                    <div className={`absolute inset-0 bg-gradient-to-br ${grad} z-0`}></div>
                                    <div className="absolute top-3 left-3 px-2 py-1 bg-[#0f0f0f]/80 backdrop-blur-md rounded text-[10px] font-bold text-accent uppercase tracking-widest border border-accent/20">
                                        {contentTypeLabel(item.content_type)}
                                    </div>
                                    {item.completion_percent > 0 && (
                                        <div className="absolute top-3 right-3 px-2 py-1 bg-[#0f0f0f]/80 backdrop-blur-md rounded text-[10px] font-bold text-accent border border-accent/20">
                                            {Math.round(item.completion_percent)}% read
                                        </div>
                                    )}
                                </div>
                                <div className="p-5 flex flex-col flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-outlined text-accent text-sm">
                                            {icons[item.content_type || ""] || "article"}
                                        </span>
                                        <span className="text-xs text-accent/60 uppercase font-semibold tracking-widest">
                                            {item.source || "Web"}
                                        </span>
                                        <span className="ml-auto">{statusBadge(item.status)}</span>
                                    </div>
                                    <h4 className="text-lg font-serif font-bold leading-tight mb-3 group-hover:text-accent transition-colors text-[#f1f5f9]">
                                        {item.title}
                                    </h4>
                                    <div className="mt-auto flex items-center justify-between border-t border-accent/10 pt-4">
                                        <div className="flex items-center gap-2 text-accent/50">
                                            <span className="material-symbols-outlined text-sm">schedule</span>
                                            <span className="text-xs font-medium uppercase tracking-widest">
                                                {Math.round(item.estimated_time)} min
                                            </span>
                                        </div>
                                        <div className="flex items-center text-accent/30 group-hover:text-accent/70 transition-colors">
                                            {isLoading ? (
                                                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-sm">play_circle</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                    <button
                        className="pill text-xs"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                    >
                        ← Prev
                    </button>
                    <span className="text-sm text-muted flex items-center">
                        {page} / {totalPages}
                    </span>
                    <button
                        className="pill text-xs"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
