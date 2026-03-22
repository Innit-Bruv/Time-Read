"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ErrorContent() {
    const params = useSearchParams();
    const error = params.get("error");
    return (
        <main className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
            <div className="w-full max-w-md text-center space-y-4">
                <h1 className="text-2xl font-bold text-red-400">Auth Error: {error}</h1>
                <p className="text-sm text-slate-400">
                    {error === "Configuration" && "Server configuration error — check Vercel logs"}
                    {error === "AccessDenied" && "Email not authorised"}
                    {error === "Verification" && "Sign-in link expired or already used"}
                </p>
                <a href="/auth/signin" className="text-blue-400 underline text-sm">Back to sign in</a>
            </div>
        </main>
    );
}

export default function ErrorPage() {
    return (
        <Suspense>
            <ErrorContent />
        </Suspense>
    );
}
