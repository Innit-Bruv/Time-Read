import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PostgresAdapter(pool),
    providers: [
        Resend({
            apiKey: process.env.EMAIL_SERVER_PASSWORD,
            from: process.env.EMAIL_FROM || "onboarding@resend.dev",
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        async signIn({ user }) {
            const allowedEmail = process.env.ALLOWED_EMAIL;
            if (allowedEmail && user.email !== allowedEmail.trim()) {
                return false;
            }
            return true;
        },
    },
    pages: {
        signIn: "/auth/signin",
    },
    secret: process.env.NEXTAUTH_SECRET,
});
