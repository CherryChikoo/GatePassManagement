# 📦 GitHub Setup Guide

Quick guide to push your GatePass project to GitHub and deploy to Vercel.

## 🚀 Quick Start (5 Minutes)

### Step 1: Create GitHub Repository

1. Go to [github.com](https://github.com)
2. Click **"New repository"**
3. Repository name: `GatePass` (or your choice)
4. Description: `Campus movement management system - Production ready for 5k+ users`
5. Visibility: **Private** (recommended) or Public
6. **DO NOT** initialize with README, .gitignore, or license (we already have these)
7. Click **"Create repository"**

### Step 2: Push Code to GitHub

Open PowerShell in your project directory and run:

```powershell
# Navigate to project
cd C:\Users\cherr\Downloads\GatePass

# Check if .env is NOT tracked (CRITICAL!)
git status | Select-String ".env"
# If you see ".env" listed, STOP! Run: git rm --cached .env

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Production-ready GatePass for 5k+ users

- ✅ All 5 phases implemented
- ✅ Rate limiting and security hardening
- ✅ Caching optimized for high concurrency
- ✅ Environment validation
- ✅ Audit logging
- ✅ Error boundaries
- ✅ Health monitoring
- ✅ Vercel deployment ready
- ✅ Documentation complete"

# Set main branch
git branch -M main

# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/GatePass.git

# Push to GitHub
git push -u origin main
```

**If you get authentication errors:**
- Use GitHub Personal Access Token instead of password
- Or set up SSH keys (recommended)

### Step 3: Verify on GitHub

1. Go to `https://github.com/YOUR_USERNAME/GatePass`
2. Check that:
   - [x] All files are present
   - [x] `.env` is **NOT** visible (should be in .gitignore)
   - [x] README.md displays correctly
   - [x] GitHub Actions workflow is present (`.github/workflows/ci.yml`)

---

## 🔒 Security Check (CRITICAL!)

### Before Deploying, Verify:

```powershell
# Check if .env is tracked (should return nothing)
git ls-files | Select-String "\.env$"

# If .env appears, remove it:
git rm --cached .env
git commit -m "security: Remove .env from tracking"
git push origin main
```

### What Should Be in .gitignore:

```
.env*
node_modules/
.next/
*.tsbuildinfo
scripts/archive/
```

---

## 🚀 Deploy to Vercel (After GitHub Push)

### Option 1: One-Click Deploy

1. Go to your GitHub repository
2. Add this badge to README.md if not already there:
   ```markdown
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/GatePass)
   ```
3. Click the badge
4. Follow Vercel's setup wizard

### Option 2: Manual Import

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New..." → "Project"**
3. Click **"Import Git Repository"**
4. Find your `GatePass` repository
5. Click **"Import"**
6. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (auto-detected)
7. Click **"Environment Variables"**
8. Add ALL variables from `.env` (see next section)
9. Click **"Deploy"**

---

## 🔐 Environment Variables for Vercel

### Method 1: Bulk Import

1. In Vercel project settings → Environment Variables
2. Click **"Import .env"**
3. Copy your entire `.env` file content
4. Paste and click **"Add"**

### Method 2: Manual Entry

Add each variable:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres...6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://postgres...5432/postgres
QR_JWT_SECRET=<64-byte-random-hex>
CRON_SECRET=<32-byte-random-hex>
```

**Important:**
- Select all environments: Production, Preview, Development
- Use strong, random secrets (never use example values!)

### Generate Secrets:

```powershell
# QR_JWT_SECRET (128 chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# CRON_SECRET (64 chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🎯 Post-Deployment Steps

### 1. Wait for Build

- First build takes 2-5 minutes
- Watch build logs in Vercel dashboard
- Look for any errors

### 2. Check Health Endpoint

```powershell
# Replace with your actual Vercel URL
curl https://your-project.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "api": "operational"
  }
}
```

### 3. Run Database Migrations

```powershell
# Set production database URL temporarily
$env:DATABASE_URL="<your-production-DIRECT_DATABASE_URL>"

# Run migrations
npm run db:push

# Seed database
npm run db:seed

# Clear environment variable
$env:DATABASE_URL=""
```

**Note:** Use `DIRECT_DATABASE_URL` (port 5432) for migrations, not the pooled URL!

### 4. Login and Test

1. Go to `https://your-project.vercel.app/login`
2. Login with:
   - Email: `admin@campus.edu`
   - Password: `admin123`
3. **IMMEDIATELY** change password:
   - Go to Settings
   - Change password to strong password
4. Test key features:
   - Create a user
   - Create a permission request
   - Approve a request
   - Generate QR code

### 5. Configure Custom Domain (Optional)

1. Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain (e.g., `gatepass.youruniversity.edu`)
3. Configure DNS:
   - Add CNAME record pointing to `cname.vercel-dns.com`
   - Or follow Vercel's DNS instructions
4. Wait for SSL certificate (automatic, ~1 minute)

---

## 📊 GitHub Actions Setup

### Workflow Already Configured

The CI/CD pipeline (`.github/workflows/ci.yml`) runs automatically on:
- Every push to `main`
- Every pull request to `main`

### What It Does:

- ✅ Installs dependencies
- ✅ Runs linter
- ✅ Generates Prisma client
- ✅ Builds application
- ✅ Checks for security vulnerabilities

### View Build Status:

1. Go to your GitHub repository
2. Click **"Actions"** tab
3. View workflow runs

### Add Status Badge to README:

```markdown
![CI](https://github.com/YOUR_USERNAME/GatePass/workflows/CI/badge.svg)
```

---

## 🔄 Continuous Deployment

### How It Works:

1. **You push code** to GitHub (main branch)
2. **GitHub Actions** runs tests and checks
3. **Vercel** automatically deploys if checks pass
4. **Live in seconds** (Edge deployment)

### Branch Strategy:

```
main (production)
  ↑
develop (staging)
  ↑
feature/* (development)
```

**Recommended Workflow:**
1. Create feature branch: `git checkout -b feature/new-feature`
2. Make changes and commit
3. Push: `git push origin feature/new-feature`
4. Create Pull Request on GitHub
5. Review and merge to `develop`
6. Test on staging (Vercel preview deployment)
7. Merge `develop` to `main` for production

---

## 🛡️ Security Best Practices

### Branch Protection Rules

Set up on GitHub:

1. Go to Settings → Branches
2. Add rule for `main`:
   - [x] Require pull request reviews before merging
   - [x] Require status checks to pass (CI)
   - [x] Require branches to be up to date
   - [x] Include administrators

### Secrets Management

- ❌ **NEVER** commit `.env` file
- ❌ **NEVER** hardcode secrets in code
- ✅ Use environment variables
- ✅ Rotate secrets every 90 days
- ✅ Use different secrets for staging/production

### Access Control

- Use GitHub Teams for collaboration
- Enable 2FA for all team members
- Review repository access regularly

---

## 📈 Monitoring Your Deployment

### GitHub

- **Actions**: Build/test status
- **Insights**: Code frequency, contributors
- **Security**: Dependabot alerts

### Vercel

- **Deployments**: View all deployments
- **Analytics**: Page views, performance
- **Logs**: Runtime logs and errors
- **Usage**: Bandwidth, function executions

### Supabase

- **Database**: Connection usage, query performance
- **Storage**: File uploads, bandwidth
- **Auth**: Active users, login activity

---

## 🆘 Troubleshooting

### Build Fails on Vercel

**Check:**
1. Build logs in Vercel dashboard
2. Environment variables are set correctly
3. Local build works: `npm run build`

**Common Issues:**
- Missing environment variables
- TypeScript errors
- Prisma client not generated

**Solution:**
```powershell
# Test locally first
npm run build

# If successful, push again
git push origin main
```

### Database Connection Errors

**Check:**
1. `DATABASE_URL` uses port 6543 (pooled connection)
2. `DIRECT_DATABASE_URL` uses port 5432 (for migrations)
3. Supabase project is active (not paused)

### Environment Variables Not Working

**Verify:**
1. Variables are set in Vercel for correct environment
2. No typos in variable names
3. Values don't have quotes (Vercel adds them automatically)

### Deployment Succeeds But App Crashes

**Check:**
1. Health endpoint: `/api/health`
2. Vercel function logs
3. Environment variable validation

**Solution:**
```powershell
# Check health
curl https://your-app.vercel.app/api/health

# If unhealthy, check:
# 1. All env vars are set
# 2. Database is accessible
# 3. Secrets are correct length (32+ chars)
```

---

## ✅ Final Checklist

Before going live with users:

- [ ] Code pushed to GitHub
- [ ] `.env` is NOT committed
- [ ] All secrets are strong and random
- [ ] Deployed to Vercel successfully
- [ ] Health endpoint returns healthy
- [ ] Database migrations completed
- [ ] Database seeded with admin account
- [ ] Default admin password changed
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] CI/CD pipeline running
- [ ] Monitoring configured
- [ ] Team members have access
- [ ] Documentation reviewed
- [ ] Load testing completed
- [ ] Backup strategy documented

---

## 📞 Need Help?

- **GitHub Issues**: Report bugs or request features
- **Discussions**: Ask questions, share ideas
- **Email**: your-support-email@university.edu

---

## 🎉 You're All Set!

Your GatePass portal is now:
- ✅ Deployed to production
- ✅ Running on Vercel Edge Network
- ✅ Connected to GitHub for CI/CD
- ✅ Ready for 5,000+ concurrent users
- ✅ Secure and monitored

**Next Steps:**
1. Share the URL with your team
2. Create additional user accounts
3. Train staff on the system
4. Monitor performance and usage
5. Gather user feedback

**Welcome to production! 🚀**
