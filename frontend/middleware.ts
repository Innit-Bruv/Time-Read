export { auth as default } from "@/lib/auth";

export const config = {
    matcher: [
        /*
         * Protect all routes EXCEPT:
         * - /demo          — public portfolio demo, no sign-in required
         * - /auth/*        — sign-in / error pages
         * - /api/auth/*    — NextAuth API routes
         * - /_next/*       — Next.js internals
         * - /favicon.ico, /manifest.json, /sw.js, /workbox-* — PWA assets
         */
        "/((?!demo|auth|api/auth|_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|workbox-).*)",
    ],
};
