import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const env = getEnv();
const queryClient = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(queryClient, { schema });
export { schema };
