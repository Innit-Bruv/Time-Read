import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/email";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        EmailProvider({
            server: {
                host: process.env.EMAIL_SERVER_HOST,
                port: Number(process.env.EMAIL_SERVER_PORT || 465),
                auth: {
                    user: process.env.EMAIL_SERVER_USER,
                    pass: process.env.EMAIL_SERVER_PASSWORD,
                },
            },
            from: process.env.EMAIL_FROM || "noreply@timeread.app",
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        async signIn({ user }) {
            // Single-user: only allow the configured email
            const allowedEmail = process.env.ALLOWED_EMAIL;
            if (allowedEmail && user.email !== allowedEmail) {
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
