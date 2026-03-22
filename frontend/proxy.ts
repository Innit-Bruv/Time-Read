import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
    matcher: [
        /*
         * Protect all routes except:
         *   - /auth/* (signin, callback, etc.)
         *   - /api/auth/* (NextAuth internal routes)
         *   - /_next/* (Next.js internals)
         *   - /favicon.ico, static assets
         */
        "/((?!auth|api/auth|api/debug-db|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)",
    ],
};
