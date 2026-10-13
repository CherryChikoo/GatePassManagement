# ⚡ Quick Start - Deploy in 10 Minutes

Follow these steps to deploy your production-ready GatePass portal.

---

## ✅ Prerequisites Check

Before starting, ensure you have:
- [ ] GitHub account
- [ ] Vercel account (free tier works)
- [ ] Supabase account (free tier works for < 500 users)
- [ ] All environment variables ready (see `.env.example`)

---

## 🚀 Step 1: Push to GitHub (2 minutes)

```powershell
# Open PowerShell in project directory
cd C:\Users\cherr\Downloads\GatePass

# Verify .env is NOT tracked
git status | Select-String "\.env"
# Should return nothing!

# Initialize and commit
git init
git add .
git commit -m "Production-ready GatePass for 5k+ users"

# Create GitHub repo then:
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/GatePass.git
git push -u origin main
```

✅ **Verify:** Check GitHub - .env should NOT be visible

---

## 🔐 Step 2: Generate Secrets (1 minute)

```powershell
# Generate QR_JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate CRON_SECRET  
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

💾 **Save these** - you'll need them for Vercel!

---

## ☁️ Step 3: Deploy to Vercel (3 minutes)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click "Import Git Repository"
3. Select your GatePass repository
4. Click "Import"
5. Add Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<from Supabase>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase>
   SUPABASE_SERVICE_ROLE_KEY=<from Supabase>
   DATABASE_URL=<from Supabase, port 6543>
   DIRECT_DATABASE_URL=<from Supabase, port 5432>
   QR_JWT_SECRET=<generated above>
   CRON_SECRET=<generated above>
   ```
6. Click "Deploy"
7. Wait 2-5 minutes ☕

✅ **Verify:** Deployment succeeds

---

## 🗄️ Step 4: Setup Database (2 minutes)

```powershell
# Use your DIRECT_DATABASE_URL (port 5432)
$env:DATABASE_URL="<your-DIRECT_DATABASE_URL>"

# Push schema
npm run db:push

# Seed database (creates admin account)
npm run db:seed

# Clear variable
$env:DATABASE_URL=""
```

✅ **Verify:** No errors

---

## 🎯 Step 5: Test Deployment (2 minutes)

### 5.1 Check Health
```powershell
curl https://your-project.vercel.app/api/health
```

Expected:
```json
{"status":"healthy","services":{"database":"connected"}}
```

### 5.2 Login
1. Go to: `https://your-project.vercel.app/login`
2. Email: `admin@campus.edu`
3. Password: `admin123`

✅ **Success!** You're in!

### 5.3 Change Password IMMEDIATELY
1. Go to Settings
2. Change password to strong password
3. Save

---

## 🎉 You're Live!

Your GatePass portal is now:
- ✅ Deployed on Vercel Edge Network
- ✅ Running on production database
- ✅ Secure and optimized for 5k+ users
- ✅ Monitored with health checks
- ✅ Ready for real users!

---

## 📋 Post-Deployment Checklist

- [ ] Admin password changed
- [ ] Health endpoint returns healthy
- [ ] Test create a user
- [ ] Test create a permission
- [ ] Test approve a permission
- [ ] Test generate QR code
- [ ] Configure custom domain (optional)
- [ ] Share URL with team
- [ ] Train staff on system

---

## 🔗 Important URLs

- **Live App:** `https://your-project.vercel.app`
- **Health Check:** `https://your-project.vercel.app/api/health`
- **Vercel Dashboard:** [vercel.com/dashboard](https://vercel.com/dashboard)
- **Supabase Dashboard:** [supabase.com/dashboard](https://supabase.com/dashboard)

---

## 📚 Need More Details?

- **README.md** - Project overview and features
- **DEPLOYMENT.md** - Comprehensive deployment guide
- **GITHUB_SETUP.md** - Detailed GitHub & Vercel instructions

---

## 🆘 Problems?

### Build fails on Vercel?
→ Check environment variables are set correctly

### Health endpoint returns unhealthy?
→ Verify DATABASE_URL is correct (port 6543)

### Can't login?
→ Make sure you ran `npm run db:seed`

### Still stuck?
→ Check Vercel deployment logs for errors

---

**🚀 Ready to onboard your first 5,000 users!**
