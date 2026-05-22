import fs from "fs";
import path from "path";
import postgres from "postgres";
import { getEnv } from "@/lib/env";

async function applyMigrations() {
  const env = getEnv();
  const sql = postgres(env.DATABASE_URL);

  try {
    // Read all migration files
    const migrationsDir = path.join(process.cwd(), "lib/db/migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration files:`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      console.log(`\nApplying ${file}...`);

      // Split by statement-breakpoint and execute each statement
      const statements = content
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        try {
          await sql.unsafe(statement);
          console.log(`  ✓ Statement executed`);
        } catch (err: any) {
          if (
            err.message.includes("already exists") ||
            err.message.includes("duplicate key")
          ) {
            console.log(`  ⚠ Statement skipped (already exists)`);
          } else {
            console.error(`  ✗ Error:`, err.message);
            throw err;
          }
        }
      }
    }

    console.log(`\n✓ All migrations applied successfully`);
    await sql.end();
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    await sql.end();
    process.exit(1);
  }
}

applyMigrations();
