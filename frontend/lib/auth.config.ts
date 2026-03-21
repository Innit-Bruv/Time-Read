import type { NextAuthConfig } from "next-auth";

/**
 * Lightweight auth config for Edge middleware.
 * No database adapter — just JWT verification.
 * The full config (with adapter + Resend provider) lives in auth.ts.
 */
export const authConfig: NextAuthConfig = {
    providers: [],
    pages: {
        signIn: "/auth/signin",
    },
    callbacks: {
        authorized({ auth }) {
            return !!auth?.user;
        },
    },
};
