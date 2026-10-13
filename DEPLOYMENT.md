# 🚀 Deployment Guide - Production Setup for 5k+ Users

This guide walks you through deploying GatePass to Vercel with optimizations for handling 5,000+ concurrent users.

## 📋 Pre-Deployment Checklist

### 1. Security Audit
- [ ] All `.env` secrets are cryptographically random (64+ chars)
- [ ] `.env` file is NOT committed to git
- [ ] Default admin password documented for post-deploy change
- [ ] Rate limiting configured
- [ ] Audit logging enabled

### 2. Database Setup
- [ ] Supabase project created (Pro plan recommended for 5k users)
- [ ] Connection pooling enabled (pgBouncer)
- [ ] Database indices verified
- [ ] Backup strategy configured

### 3. Code Quality
- [ ] Build succeeds locally: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No console.log in production code

---

## 🗄️ Step 1: Supabase Configuration (Production Grade)

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Choose region closest to your users
4. Use **strong database password**

### 1.2 Upgrade to Pro Plan (Recommended for 5k+ users)

**Why Pro?**
- 8 GB database (vs 500 MB free)
- Unlimited API requests (vs 500k/month)
- No daily limits
- 100 GB bandwidth (vs 5 GB)
- Priority support

Cost: ~$25/month (scales with usage)

### 1.3 Configure Connection Pooling

1. Go to: Database → Settings → Connection Pooling
2. **Enable pgBouncer** (if not already enabled)
3. Copy connection strings:
   - **Transaction mode** (port 6543) → Use for `DATABASE_URL`
   - **Session mode** (port 5432) → Use for `DIRECT_DATABASE_URL`

**Example:**
```env
# Transaction mode - for app (handles 1000+ connections)
DATABASE_URL=postgresql://postgres.abc123:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Session mode - for migrations only
DIRECT_DATABASE_URL=postgresql://postgres.abc123:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### 1.4 Configure Storage Bucket

1. Go to: Storage → Create bucket
2. Bucket name: `gatepass-photos`
3. **Public bucket**: No (keep private)
4. Configure RLS policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'gatepass-photos');

-- Allow authenticated users to read their uploads
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'gatepass-photos');
```

---

## 🔐 Step 2: Environment Variables Setup

### 2.1 Generate Secure Secrets

```bash
# Generate QR_JWT_SECRET (64 bytes = 128 hex chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate CRON_SECRET (32 bytes = 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.2 Complete Environment Variables

```env
# ============================================================
# Supabase Configuration
# ============================================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-service-role-key

# ============================================================
# Database Configuration (Critical for 5k+ users)
# ============================================================
# Transaction mode with pgBouncer (port 6543)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=100

# Session mode for migrations (port 5432)
DIRECT_DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:5432/postgres

# ============================================================
# Security Secrets (MUST be cryptographically random!)
# ============================================================
QR_JWT_SECRET=<128-char-hex-string-from-above>
CRON_SECRET=<64-char-hex-string-from-above>

# ============================================================
# Optional: Monitoring & Analytics
# ============================================================
# SENTRY_DSN=https://...@sentry.io/...
# VERCEL_ANALYTICS_ID=...
```

**⚠️ SECURITY WARNING:**
- Never use example/placeholder secrets in production
- Never commit `.env` to git
- Rotate secrets every 90 days

---

## 🚀 Step 3: Deploy to Vercel

### 3.1 Prepare Repository

```bash
# Initialize git (if not already)
git init

# Add files
git add .

# Commit
git commit -m "Initial commit: Production-ready GatePass"

# Create GitHub repository and push
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/GatePass.git
git push -u origin main
```

### 3.2 Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Import Project"**
3. Select your GitHub repository
4. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### 3.3 Add Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

**Add EACH variable** from your `.env` file:
1. Click "Add New"
2. Name: `NEXT_PUBLIC_SUPABASE_URL`
3. Value: (paste your value)
4. Environments: Production, Preview, Development
5. Repeat for ALL variables

**Tip**: Use bulk import:
- Click "Import .env"
- Paste entire `.env` file contents
- Click "Add"

### 3.4 Deploy

1. Click **"Deploy"**
2. Wait 2-5 minutes for build
3. Your app will be live at `your-project.vercel.app`

---

## 🔧 Step 4: Post-Deployment Configuration

### 4.1 Run Database Migrations

```bash
# From your local machine, using production database
export DATABASE_URL="your-production-DIRECT_DATABASE_URL"

# Push schema
npm run db:push

# Seed initial data (creates admin account)
npm run db:seed
```

**Important**: Use `DIRECT_DATABASE_URL` for migrations (port 5432), not the pooled connection.

### 4.2 Configure Cron Jobs

1. Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
2. Add new cron:
   - **Path**: `/api/cron/cleanup`
   - **Schedule**: `0 2 * * *` (2 AM daily)
   - **Headers**:
     ```
     x-cron-secret: <your-CRON_SECRET>
     ```

**Or using vercel.json** (already configured):
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Vercel will automatically add the `x-cron-secret` header from environment variables.

### 4.3 Verify Deployment

```bash
# Check health endpoint
curl https://your-app.vercel.app/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-10-06T...",
  "services": {
    "database": "connected",
    "api": "operational"
  },
  "responseTime": "45ms"
}
```

### 4.4 Change Default Admin Password

1. Login at `https://your-app.vercel.app/login`
2. Email: `admin@campus.edu`
3. Password: `admin123`
4. Go to Settings → Change Password
5. Use strong password (12+ chars, mixed case, numbers, symbols)

### 4.5 Create Additional Users

Go to Admin → Users → Create User to add:
- Faculty members
- Wardens
- Security staff
- Students

---

## 📊 Step 5: Performance Optimization for 5k+ Users

### 5.1 Vercel Configuration

**Recommended Plan**: Pro ($20/month per seat)
- 100 GB-hours compute time
- 1 TB bandwidth
- 1000 GB-hours serverless function execution
- Edge Functions included

**For 5k+ users:**
- Monitor usage in Vercel Dashboard
- Consider Pro plan if you exceed free tier limits

### 5.2 Database Optimization

**Supabase Pro Configuration:**
1. Go to Supabase Dashboard → Database → Configuration
2. Set connection pool size:
   - **Pool size**: 100 (for Pro)
   - **Pool mode**: Transaction (already set)
   - **Statement timeout**: 60s

3. Enable read replicas (optional, for > 10k users):
   - Supabase → Settings → Read Replicas
   - Add replica in same region

### 5.3 Monitor Performance

**Key Metrics to Watch:**

1. **Vercel Analytics** (Dashboard → Analytics):
   - Page load times (target: < 2s)
   - Time to First Byte (target: < 500ms)
   - Core Web Vitals

2. **Supabase Dashboard** (Dashboard → Reports):
   - Database connections (should stay < 80)
   - API requests per minute
   - Storage usage

3. **Logs** (Vercel → Logs):
   - Error rates
   - Response times
   - Failed requests

### 5.4 Caching Strategy

Already implemented in code:
- Profile cache: 20s TTL
- Dashboard data: 15s TTL
- Form dropdowns: 30s TTL

**For higher traffic**, increase cache TTLs in `src/lib/constants/index.ts`:

```typescript
export const CACHE_TTL = {
  PROFILE: 60_000,      // 1 minute
  DASHBOARD: 30_000,    // 30 seconds
  FORM_DATA: 120_000,   // 2 minutes
};
```

### 5.5 Load Testing

Before going live with 5k users:

```bash
# Install k6 (load testing tool)
brew install k6  # macOS
# or download from k6.io

# Create load test script (test.js):
cat > test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 1000 },  // Ramp up to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users
    { duration: '2m', target: 5000 },  // Ramp up to 5000 users
    { duration: '5m', target: 5000 },  // Stay at 5000 users
    { duration: '2m', target: 0 },     // Ramp down
  ],
};

export default function() {
  let res = http.get('https://your-app.vercel.app/api/health');
  check(res, { 'status was 200': (r) => r.status == 200 });
  sleep(1);
}
EOF

# Run load test
k6 run test.js
```

**Expected Results:**
- p95 response time: < 500ms
- Error rate: < 0.1%
- Database connections: < 100

---

## 🔒 Step 6: Security Hardening

### 6.1 Configure Security Headers

Already configured in `next.config.ts` and `vercel.json`:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=()

### 6.2 Enable HTTPS Only

Vercel automatically enforces HTTPS, but verify:
1. Vercel Dashboard → Settings → Domains
2. Check "Force HTTPS" is enabled

### 6.3 Set Up Rate Limiting

Already implemented in code:
- Login: 5 attempts per 15 minutes
- Configurable in `src/lib/constants/index.ts`

For API-wide rate limiting:
1. Consider Vercel Edge Middleware
2. Or use Upstash Redis + @upstash/ratelimit

### 6.4 Configure CORS (if needed)

If you plan to call API from mobile app:

```typescript
// src/middleware.ts
export async function middleware(request: NextRequest) {
  // Add CORS headers for mobile app
  const response = await updateSession(request);
  
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', 'https://your-mobile-app.com');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  return response;
}
```

---

## 📊 Step 7: Monitoring & Alerts

### 7.1 Set Up Vercel Integration - Slack/Discord

1. Vercel Dashboard → Integrations
2. Add Slack or Discord
3. Configure alerts:
   - Deployment failures
   - Error rate threshold
   - Performance degradation

### 7.2 Optional: Add Sentry for Error Tracking

```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

Follow wizard to configure.

### 7.3 Database Monitoring

Supabase automatically monitors:
- Connection pool usage
- Query performance
- Storage usage

Set up alerts:
1. Supabase Dashboard → Settings → Alerts
2. Configure:
   - Connection pool > 80%
   - Disk usage > 80%
   - API error rate > 1%

---

## 🔄 Step 8: Continuous Deployment

GitHub Actions already configured (`.github/workflows/ci.yml`):
- Runs on every push to main
- Lints code
- Builds project
- Checks for vulnerabilities

Vercel automatically:
- Deploys on every push to main (Production)
- Creates preview deployments for PRs
- Runs build checks

---

## 🚨 Troubleshooting Production Issues

### Issue: High Response Times (> 1s)

**Diagnosis:**
```bash
curl -w "@curl-format.txt" https://your-app.vercel.app/api/health
```

Create `curl-format.txt`:
```
    time_namelookup:  %{time_namelookup}s\n
       time_connect:  %{time_connect}s\n
    time_appconnect:  %{time_appconnect}s\n
   time_pretransfer:  %{time_pretransfer}s\n
      time_redirect:  %{time_redirect}s\n
 time_starttransfer:  %{time_starttransfer}s\n
                    ----------\n
         time_total:  %{time_total}s\n
```

**Solutions:**
- Check database connection pool usage
- Increase cache TTLs
- Add database read replicas
- Enable Vercel Edge Caching

### Issue: Database Connection Errors

**Diagnosis:**
- Check Supabase Dashboard → Logs
- Look for connection pool exhaustion

**Solutions:**
- Verify `DATABASE_URL` uses port 6543 (pooler)
- Check connection pool size (increase if needed)
- Upgrade Supabase plan
- Optimize slow queries

### Issue: High Memory Usage

**Diagnosis:**
- Vercel Dashboard → Functions → Memory Usage

**Solutions:**
- Increase function memory in `vercel.json`
- Optimize cache sizes
- Check for memory leaks in components

### Issue: Rate Limit Errors for Legitimate Users

**Solutions:**
- Increase rate limits in `src/lib/constants/index.ts`
- Implement IP-based + user-based rate limiting
- Use Redis for distributed rate limiting

---

## 📈 Scaling Beyond 5k Users

### For 10k+ Concurrent Users:

1. **Database:**
   - Upgrade to Supabase Team plan
   - Add read replicas
   - Implement query caching layer (Redis)

2. **Vercel:**
   - Upgrade to Enterprise plan
   - Use Edge Middleware for caching
   - Implement CDN for static assets

3. **Architecture:**
   - Consider microservices for heavy operations
   - Use queue system for async tasks (BullMQ + Redis)
   - Implement Redis for session storage

4. **Caching:**
   - Add Redis cache layer
   - Implement API response caching
   - Use Vercel Edge Caching

---

## ✅ Post-Deployment Checklist

- [ ] Health endpoint returns 200
- [ ] Admin can login with default credentials
- [ ] Default admin password changed
- [ ] Database seeded with initial data
- [ ] Cron job scheduled and tested
- [ ] All environment variables set correctly
- [ ] Error tracking configured
- [ ] Monitoring alerts set up
- [ ] Load testing completed successfully
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate verified
- [ ] Team members granted access
- [ ] Backup strategy documented
- [ ] Incident response plan documented

---

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Check Supabase logs
3. Review this deployment guide
4. Check GitHub Issues
5. Contact support team

---

**Your GatePass portal is now production-ready for 5,000+ concurrent users! 🎉**
