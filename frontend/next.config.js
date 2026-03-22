/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Next.js 16 defaults to Turbopack; next-pwa adds webpack config which
    // triggers a warning. The empty turbopack object silences it.
    turbopack: {},
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: "img-src 'self' data: https: blob:;",
                    },
                ],
            },
        ];
    },
};

// PWA configuration using next-pwa
let config = nextConfig;
try {
    const withPWA = require("next-pwa")({
        dest: "public",
        register: true,
        skipWaiting: true,
        disable: process.env.NODE_ENV === "development",
        runtimeCaching: [
            {
                urlPattern: /^https?.*\.(html|css|js)$/,
                handler: "CacheFirst",
                options: {
                    cacheName: "static-assets",
                    expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
                },
            },
            {
                urlPattern: /\/api\//,
                handler: "StaleWhileRevalidate",
                options: {
                    cacheName: "api-cache",
                    expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
                },
            },
            {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
                handler: "CacheFirst",
                options: {
                    cacheName: "google-fonts",
                    expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
                },
            },
        ],
    });
    config = withPWA(nextConfig);
} catch (e) {
    // next-pwa may not be available during initial setup
    console.warn("next-pwa not configured:", e.message);
}

module.exports = config;
