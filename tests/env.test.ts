import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

describe("getEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("throws when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow();
  });

  it("succeeds with valid env", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    expect(env.DATABASE_URL).toBe("postgres://test:test@localhost:5432/test");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
  });
});
