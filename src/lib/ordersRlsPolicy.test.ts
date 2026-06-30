import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readAllMigrations(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  return files
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("orders SELECT RLS policy allows guest checkout", () => {
  const allSql = readAllMigrations();

  it("drops the restrictive 'Users can view own orders' SELECT policy on orders", () => {
    const hasDrop = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?["']Users can view own orders["']\s+ON\s+public\.orders/i.test(
      allSql,
    );
    expect(hasDrop).toBe(true);
  });

  it("creates a replacement orders SELECT policy with a guest-order time window", () => {
    // The new policy must allow SELECT on orders where user_id IS NULL and
    // created_at is within a short window (e.g. 10 minutes).  This is what
    // lets the anon role read back a guest order via INSERT … RETURNING and
    // lets the order_items INSERT WITH CHECK subquery find the parent order.
    const ordersSelectMatch = allSql.match(
      /CREATE\s+POLICY\s+["'][^"']+["']\s+ON\s+public\.orders\s+FOR\s+SELECT[\s\S]*?(?:user_id\s+IS\s+NULL[\s\S]*?interval[\s\S]*?);/gi,
    );
    expect(ordersSelectMatch).not.toBeNull();
    const lastOrdersSelect = ordersSelectMatch![ordersSelectMatch!.length - 1];
    expect(lastOrdersSelect).toMatch(/user_id\s+IS\s+NULL/i);
    expect(lastOrdersSelect).toMatch(/created_at\s*>\s*now\s*\(\s*\)\s*-\s*interval/i);
  });

  it("updates order_items SELECT policy with the same guest-order time window", () => {
    const itemsSelectMatch = allSql.match(
      /CREATE\s+POLICY\s+["'][^"']+["']\s+ON\s+public\.order_items\s+FOR\s+SELECT[\s\S]*?(?:user_id\s+IS\s+NULL[\s\S]*?interval[\s\S]*?);/gi,
    );
    expect(itemsSelectMatch).not.toBeNull();
    const lastItemsSelect = itemsSelectMatch![itemsSelectMatch!.length - 1];
    expect(lastItemsSelect).toMatch(/user_id\s+IS\s+NULL/i);
    expect(lastItemsSelect).toMatch(/created_at\s*>\s*now\s*\(\s*\)\s*-\s*interval/i);
  });
});
