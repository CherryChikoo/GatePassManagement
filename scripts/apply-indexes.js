/**
 * Apply performance indexes to the database
 * Run: node scripts/apply-indexes.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function applyIndexes() {
  try {
    console.log('🔧 Applying performance indexes...');

    const sqlPath = path.join(__dirname, '..', 'prisma', 'migrations', 'add_performance_indexes.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Strip "--" comment lines first, then split into statements. (Previously
    // chunks that merely started with a comment were skipped entirely, so most
    // indexes were silently never created.)
    const statements = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 70)}...`);
      await prisma.$executeRawUnsafe(statement);
    }

    console.log(`✅ Applied ${statements.length} index statements.`);
  } catch (error) {
    console.error('❌ Error applying indexes:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyIndexes();
