import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("create-myfatoorah-payment deployed payload", () => {
  it("does not send Customer.Mobile to MyFatoorah v3 payments", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/create-myfatoorah-payment/index.ts"),
      "utf8",
    );

    expect(source).not.toContain("Customer.Mobile");
    expect(source).not.toContain("customer.Mobile");
  });
});
