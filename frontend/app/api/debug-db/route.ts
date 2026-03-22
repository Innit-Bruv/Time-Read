import { NextResponse } from "next/server";
import { Pool } from "pg";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL?.trim(),
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
    try {
        const action = req.nextUrl.searchParams.get("action");

        if (action === "fix-users-id") {
            // Enable pgcrypto extension and add default UUID to users.id
            await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
            await pool.query(`ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
            // Verify it worked
            const check = await pool.query(
                `SELECT column_default FROM information_schema.columns WHERE table_name='users' AND column_name='id'`
            );
            return NextResponse.json({ fixed: true, id_default: check.rows[0]?.column_default });
        }

        if (action === "clear-tokens") {
            await pool.query(`DELETE FROM verification_token WHERE identifier = 'haaziq2608@gmail.com'`);
            return NextResponse.json({ cleared: true });
        }

        const vtRows = await pool.query(
            `SELECT identifier, expires, LEFT(token, 20) as token_prefix FROM verification_token ORDER BY expires DESC`
        ).catch((e: Error) => ({ rows: [{ error: e.message }] }));
        const uCount = await pool.query(`SELECT COUNT(*) FROM users`).catch((e: Error) => ({ rows: [{ count: `ERR: ${e.message}` }] }));
        const idDefault = await pool.query(
            `SELECT column_default FROM information_schema.columns WHERE table_name='users' AND column_name='id'`
        ).catch(() => ({ rows: [{}] }));

        return NextResponse.json({
            users_id_default: idDefault.rows[0]?.column_default ?? "NONE",
            verification_tokens: vtRows.rows.length,
            users_count: uCount.rows[0].count,
        });
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    } finally {
        await pool.end();
    }
}
