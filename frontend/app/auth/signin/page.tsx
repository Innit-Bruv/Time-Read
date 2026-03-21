"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) return;

        setLoading(true);
        setError("");
        try {
            const result = await signIn("email", {
                email: trimmed,
                callbackUrl: "/",
                redirect: false,
            });
            if (result?.error) {
                setError("Sign in failed. Check that this email is authorised.");
            } else {
                setSent(true);
            }
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
            <div className="w-full max-w-sm">
                <div className="mb-10 text-center">
                    <h1 className="text-3xl font-black tracking-tight text-[#f1f5f9] font-display mb-2">
                        TimeRead
                    </h1>
                    <p className="text-sm text-accent/50">Sign in to your reading system</p>
                </div>

                {sent ? (
                    <div className="border border-accent/20 rounded-xl p-8 text-center space-y-3">
                        <div className="text-3xl">📬</div>
                        <p className="text-slate-200 font-semibold">Check your email</p>
                        <p className="text-sm text-accent/50">
                            A sign-in link has been sent to{" "}
                            <span className="text-accent">{email}</span>.
                        </p>
                    </div>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        className="border border-accent/10 rounded-xl p-8 space-y-4 bg-[#0f0f0f]"
                    >
                        <div className="space-y-2">
                            <label
                                htmlFor="email"
                                className="block text-xs uppercase tracking-widest text-accent/60 font-medium"
                            >
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                autoFocus
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full bg-[#1f1b13] border border-accent/10 rounded-lg px-4 py-3 text-sm text-slate-100 focus:ring-1 focus:ring-accent focus:border-accent outline-none"
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-400">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className="w-full bg-accent text-[#0f0f0f] py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                            {loading ? "Sending..." : "Send magic link"}
                        </button>
                    </form>
                )}
            </div>
        </main>
    );
}
