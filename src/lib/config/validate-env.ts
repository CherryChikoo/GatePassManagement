/**
 * Environment variable validation
 * This runs at startup and crashes if required vars are missing
 */

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'QR_JWT_SECRET',
  'CRON_SECRET',
] as const;

export function validateEnv() {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    
    if (!value) {
      missing.push(envVar);
      continue;
    }

    // Additional validation
    if (envVar === 'QR_JWT_SECRET' && value.length < 32) {
      invalid.push(`${envVar} (must be at least 32 characters)`);
    }

    if (envVar === 'CRON_SECRET' && value.length < 32) {
      invalid.push(`${envVar} (must be at least 32 characters)`);
    }

    if (envVar === 'NEXT_PUBLIC_SUPABASE_URL' && !value.startsWith('http')) {
      invalid.push(`${envVar} (must be a valid URL)`);
    }

    if (envVar === 'DATABASE_URL' && !value.startsWith('postgresql://')) {
      invalid.push(`${envVar} (must be a valid PostgreSQL URL)`);
    }

    if (envVar === 'DIRECT_DATABASE_URL' && !value.startsWith('postgresql://')) {
      invalid.push(`${envVar} (must be a valid PostgreSQL URL)`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
      `Please check your .env file and ensure all required variables are set.\n` +
      `See .env.example for reference.`
    );
  }

  if (invalid.length > 0) {
    throw new Error(
      `❌ Invalid environment variable values:\n${invalid.map(v => `  - ${v}`).join('\n')}`
    );
  }

  // Warn about development secrets in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.QR_JWT_SECRET?.includes('CHANGE_ME') || 
        process.env.CRON_SECRET?.includes('CHANGE_ME')) {
      throw new Error('❌ Production deployment detected with default secrets! Please set secure secrets.');
    }
  }

  console.log('✅ Environment variables validated successfully');
}

// Run validation immediately when this module is imported
validateEnv();
