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
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      await prisma.$executeRawUnsafe(statement);
    }
    
    console.log('✅ All performance indexes applied successfully!');
    console.log('📊 Database queries should now be significantly faster.');
  } catch (error) {
    console.error('❌ Error applying indexes:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyIndexes();
