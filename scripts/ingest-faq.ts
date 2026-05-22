import * as fs from "node:fs";
import * as path from "node:path";

import { db, schema } from "@/lib/db";
import { embedText } from "@/lib/rag/embed";
import { resolveTenantBySlug } from "@/lib/tenants/resolve";

interface IngestOptions {
  tenant: string; // tenant slug
  file: string; // path to FAQ file
  language?: string; // 'he' or 'en', default 'he'
  title?: string; // override document title (defaults to filename)
}

// Parse CLI arguments
function parseArgs(): IngestOptions {
  const args = process.argv.slice(2);
  const options: Partial<IngestOptions> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tenant") options.tenant = args[++i];
    if (args[i] === "--file") options.file = args[++i];
    if (args[i] === "--language") options.language = args[++i];
    if (args[i] === "--title") options.title = args[++i];
  }

  if (!options.tenant || !options.file) {
    console.error(
      "Usage: pnpm run ingest-faq --tenant <slug> --file <path> [--language <he|en>] [--title <title>]",
    );
    process.exit(1);
  }

  return options as IngestOptions;
}

// Chunk text into ~500 character pieces with overlap
function chunkText(text: string, chunkSize: number = 500, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - overlap;
  }

  return chunks;
}

async function ingestFaq(options: IngestOptions) {
  try {
    console.log(`📚 Ingesting FAQ: ${options.file}`);

    // 1. Resolve tenant
    const tenant = await resolveTenantBySlug(options.tenant);
    if (!tenant) {
      console.error(`❌ Tenant not found: ${options.tenant}`);
      process.exit(1);
    }
    console.log(`✓ Found tenant: ${tenant.name}`);

    // 2. Read file
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    console.log(`✓ Loaded file (${content.length} chars)`);

    // 3. Create FAQ document record
    const docTitle = options.title || path.basename(filePath, path.extname(filePath));
    const language = options.language || "he";

    const doc = await db
      .insert(schema.faqDocuments)
      .values({
        tenantId: tenant.id,
        title: docTitle,
        sourceType: path.extname(filePath).toLowerCase().slice(1) || "text",
        sourceUri: filePath,
        language,
        contentRaw: content,
      })
      .returning();

    console.log(`✓ Created FAQ document: ${doc[0].id}`);

    // 4. Chunk the content
    const chunks = chunkText(content);
    console.log(`✓ Created ${chunks.length} chunks (avg 500 chars)`);

    // 5. Embed and insert chunks
    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunk = chunks[i];
        console.log(`  [${i + 1}/${chunks.length}] Embedding chunk...`);

        // Embed with Voyage AI
        const embedding = await embedText(chunk);

        // Insert chunk with embedding
        await db.insert(schema.faqChunks).values({
          documentId: doc[0].id,
          tenantId: tenant.id,
          chunkText: chunk,
          embedding,
          metadata: {
            chunkIndex: i,
            documentTitle: docTitle,
            totalChunks: chunks.length,
          },
        });

        inserted++;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`  ❌ Failed to embed chunk ${i}: ${(error as Error).message}`);
        failed++;
      }
    }

    console.log(`\n✅ Ingestion complete!`);
    console.log(`   Inserted: ${inserted} chunks`);
    console.log(`   Failed: ${failed} chunks`);
    console.log(`   Document ID: ${doc[0].id}`);
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

// Run
const options = parseArgs();
ingestFaq(options).then(() => process.exit(0));
