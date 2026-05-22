import { db } from './lib/db';
import * as fs from 'fs';
import * as path from 'path';

async function applyMigrations() {
  console.log('Applying migrations to Neon...\n');
  
  const migrationDir = path.join(process.cwd(), 'lib', 'db', 'migrations');
  const files = ['0000_motionless_ronan.sql', '0001_cute_firebrand.sql', '0002_familiar_tigra.sql'];
  
  for (const file of files) {
    const filePath = path.join(migrationDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    
    // Split by statement-breakpoint comments and filter out empty statements
    const statements = sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`Applying ${file}...`);
    
    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (!error.message?.includes('already exists') && !error.message?.includes('NOTICE')) {
          console.error(`Error in ${file}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log(`✓ ${file} applied\n`);
  }
  
  console.log('✅ All migrations applied successfully!');
  process.exit(0);
}

applyMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
