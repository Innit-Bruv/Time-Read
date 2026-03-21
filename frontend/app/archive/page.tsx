import ArchiveList from "@/components/ArchiveList";
import HackerNewsFeed from "@/components/HackerNewsFeed";
import RSSFeedInput from "@/components/RSSFeedInput";
import UrlIngestPanel from "@/components/UrlIngestPanel";
import Link from "next/link";
export const metadata = {
    title: "Archive — TimeRead",
    description: "Browse your saved reading library",
};

export default function ArchivePage() {
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

            {/* Upload & Ingest Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
                <div className="lg:col-span-2 group flex flex-col items-center justify-center border-2 border-dashed border-accent/20 hover:border-accent/40 rounded-xl p-8 bg-accent/5 transition-all cursor-pointer">
                    <div className="size-12 rounded-full bg-accent/10 flex items-center justify-center text-accent mb-4 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">upload_file</span>
                    </div>
                    <h3 className="text-lg font-bold mb-1 text-slate-100">Upload PDF Documents</h3>
                    <p className="text-sm text-accent/50 mb-6 text-center">Drag and drop your research papers or books here to begin ingestion</p>
                    <button className="bg-accent/10 text-accent border border-accent/20 px-6 py-2 rounded-lg text-sm font-bold hover:bg-accent/20 transition-colors">
                        Browse Local Files
                    </button>
                </div>
                <div className="flex flex-col gap-6 p-8 border border-accent/10 rounded-xl bg-[#0f0f0f]">
                    <UrlIngestPanel />
                </div>
            </div>

            {/* Content Sources — HN + RSS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
                <HackerNewsFeed />
                <RSSFeedInput />
            </div>

            <ArchiveList />
        </main>
    );
}
