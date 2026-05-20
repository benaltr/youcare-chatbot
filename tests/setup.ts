import { config } from "dotenv";
import { afterAll, beforeAll } from "vitest";

config({ path: ".env.local" });

beforeAll(() => {
  // Reserved for global test setup (DB connections, etc.)
});

afterAll(() => {
  // Reserved for global teardown
});
