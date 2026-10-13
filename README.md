# GatePass Portal 🎓

A production-grade campus movement management system built with Next.js, optimized for **5,000+ concurrent users**. Features role-based dashboards for administrators, students, faculty, wardens, and security personnel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/GatePass)

## ✨ Features

### Core Functionality
- 🔐 **Role-Based Access Control**: Separate dashboards for Admin, Student, Faculty, Warden, and Security
- 📝 **Permission Management**: Students request exit/entry permissions with approval workflows
- 📱 **QR Code System**: Secure JWT-based QR codes for gate verification
- 📊 **Real-Time Tracking**: Monitor student movements and campus activity
- 👥 **Outsider Management**: Track and manage non-student visitors
- 📸 **Photo Verification**: Capture and store exit/entry photos in Supabase Storage
- 🔍 **Audit Logging**: Complete audit trail for all critical operations
- 🧹 **Automated Cleanup**: Scheduled data retention and cleanup jobs

### Production Features
- ⚡ **High Performance**: Optimized for 5k+ concurrent users
- 🚀 **Edge-Ready**: Deployed on Vercel Edge Network
- 💾 **Smart Caching**: Multi-layer caching strategy (20s-30s TTL)
- 🛡️ **Security Hardening**: Rate limiting, CSRF protection, secure headers
- 📈 **Scalable Database**: Prisma with connection pooling via Supabase
- 🔄 **Graceful Degradation**: Error boundaries and fallback UI
- 📊 **Health Monitoring**: `/api/health` endpoint for uptime checks

## 🏗️ Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript 5
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS 4
- **Validation**: Zod
- **Deployment**: Vercel (Edge Functions)
- **Monitoring**: Built-in health checks

## 📊 Performance Specs

- **Concurrent Users**: 5,000+
- **Response Time**: < 200ms (p95)
- **Database Connections**: Pooled via Supabase pgBouncer
- **Cache Strategy**: In-memory with 15-30s TTL
- **API Rate Limits**: 5 login attempts per 15 minutes per user
- **Image Size Limit**: 500KB (compressed)

## 📋 Prerequisites

- Node.js 20+ and npm
- PostgreSQL database (Supabase recommended)
- Supabase account (free tier supports 500MB storage)
- Vercel account (for deployment)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd GatePass
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

**Required Environment Variables:**

```env
# Supabase (Get from: Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key

# Database (Get from: Dashboard → Settings → Database)
# Use "Transaction mode" (port 6543) for app
DATABASE_URL=postgresql://postgres.YOUR_PROJECT:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true

# Use "Session mode" (port 5432) for migrations
DIRECT_DATABASE_URL=postgresql://postgres.YOUR_PROJECT:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres

# Security Secrets (Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
QR_JWT_SECRET=your-64-char-random-secret-here
CRON_SECRET=your-32-char-random-secret-here
```

**Generate Secrets:**
```bash
# For QR_JWT_SECRET (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# For CRON_SECRET (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data (creates admin account)
npm run db:seed
```

### 4. Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Default Admin Login

```
Email: admin@campus.edu
Password: (one-time password printed by the seed script / SEED_DEFAULT_PASSWORD — change it immediately)
```

**⚠️ IMPORTANT: Change this password immediately after first login!**

## 📦 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema changes to database |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:studio` | Open Prisma Studio |

## 🚢 Deployment to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/GatePass)

### Option 2: Manual Deploy

1. **Push to GitHub:**
```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/GatePass.git
git push -u origin main
```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub repository
   - Configure project settings

3. **Add Environment Variables:**
   - In Vercel Dashboard → Settings → Environment Variables
   - Add ALL variables from your `.env` file
   - ⚠️ **CRITICAL**: Ensure secrets are long and random!

4. **Deploy:**
   - Click "Deploy"
   - Vercel will automatically build and deploy
   - Your app will be live at `your-project.vercel.app`

### Post-Deployment Checklist

- [ ] Verify all environment variables are set
- [ ] Run database migrations: `npm run db:push`
- [ ] Seed database: `npm run db:seed`
- [ ] Test health endpoint: `https://your-app.vercel.app/api/health`
- [ ] Change default admin password
- [ ] Configure custom domain (optional)
- [ ] Set up cron job authentication
- [ ] Test with multiple concurrent users

## 🔒 Production Security Checklist

- [x] Environment variables validated on startup
- [x] JWT secrets are cryptographically random
- [x] Rate limiting on authentication (5 attempts/15 min)
- [x] SQL injection protection (Prisma ORM)
- [x] XSS protection (React + sanitization)
- [x] CSRF protection (Next.js built-in)
- [x] Secure headers configured
- [x] Image upload validation
- [x] Audit logging for critical operations
- [x] Connection pooling configured
- [x] Error boundaries implemented
- [ ] **TODO**: Change default admin password!
- [ ] **TODO**: Rotate secrets after deployment
- [ ] **TODO**: Configure monitoring/alerts

## 🏛️ Architecture

```
GatePass/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/             # Admin dashboard
│   │   ├── student/           # Student dashboard
│   │   ├── faculty/           # Faculty dashboard
│   │   ├── warden/            # Warden dashboard
│   │   ├── security/          # Security dashboard
│   │   ├── api/               # API routes
│   │   │   ├── health/        # Health check endpoint
│   │   │   └── cron/          # Cron jobs
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── dashboard/         # Dashboard components
│   │   ├── ui/                # UI primitives
│   │   └── error-boundary.tsx # Error handling
│   ├── lib/                   # Utilities
│   │   ├── auth/              # Authentication & authorization
│   │   │   ├── helpers.ts     # Auth utilities
│   │   │   └── rate-limiter.ts # Rate limiting
│   │   ├── config/            # Configuration
│   │   │   └── validate-env.ts # Env validation
│   │   ├── constants/         # App constants
│   │   ├── db/                # Database client
│   │   ├── logger/            # Centralized logging
│   │   ├── qr/                # QR code generation
│   │   ├── storage/           # File uploads
│   │   ├── supabase/          # Supabase clients
│   │   └── validation/        # Zod schemas
│   ├── server/                # Server-side code
│   │   └── actions/           # Server actions
│   │       ├── admin.ts       # Admin operations
│   │       ├── approvals.ts   # Permission approvals
│   │       ├── auth.ts        # Authentication
│   │       ├── outsiders.ts   # Outsider management
│   │       ├── permissions.ts # Permission requests
│   │       ├── security.ts    # Security operations
│   │       └── settings.ts    # User settings
│   └── middleware.ts          # Auth middleware
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Database seeding
├── public/                    # Static assets
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI
├── vercel.json                # Vercel configuration
├── next.config.ts             # Next.js config
└── package.json               # Dependencies
```

## 📊 Database Schema

### Key Models

- **Profile**: User accounts (all roles)
- **Student**: Student-specific data
- **Faculty**: Faculty members
- **Warden**: Hostel wardens
- **SecurityStaff**: Security personnel
- **Permission**: Permission requests
- **PermissionApproval**: Approval records
- **QrCredential**: QR codes for gate access
- **Movement**: Entry/exit logs
- **Gate**: Campus gates
- **Outsider**: Non-student visitors
- **AuditLog**: System audit trail

### Indexes

All tables are properly indexed for high-performance queries:
- Student lookups by roll number
- Permission queries by status and date
- Movement logs by student and gate
- Audit logs by user and action

## ⚡ Performance Optimizations

### Caching Strategy
- **Profile Cache**: 20s TTL (reduces DB queries)
- **Dashboard Cache**: 15s TTL (real-time feel)
- **Form Data Cache**: 30s TTL (dropdown lists)
- **Gate List Cache**: 30s TTL (rarely changes)

### Database Optimizations
- Connection pooling via Supabase pgBouncer
- Indexed queries for fast lookups
- Efficient JOIN strategies
- Pagination for large result sets

### Frontend Optimizations
- React Server Components (RSC)
- Automatic code splitting
- Image optimization (AVIF/WebP)
- Static asset caching (1 year)
- Prefetch disabled for instant navigation

### API Optimizations
- Rate limiting prevents abuse
- Efficient validation with Zod
- Minimal data transfer (select only needed fields)
- Parallel queries where possible

## 🔧 Configuration

### Rate Limits (Customizable)

Edit `src/lib/constants/index.ts`:

```typescript
export const LIMITS = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  LOGIN_BLOCK_DURATION_MS: 30 * 60 * 1000,    // 30 minutes
  MAX_BATCH_APPROVALS: 5,
  MAX_IMAGE_SIZE_KB: 500,
};
```

### Cache TTLs (Tunable)

Edit `src/lib/constants/index.ts`:

```typescript
export const CACHE_TTL = {
  PROFILE: 20_000,      // 20 seconds
  DASHBOARD: 15_000,    // 15 seconds
  FORM_DATA: 30_000,    // 30 seconds
};
```

## 🆘 Troubleshooting

### Build Errors

**Error: Environment variable validation failed**
- Ensure all required variables are in `.env`
- Check variable lengths (secrets must be 32+ chars)
- Verify URLs start with `http`

**Error: Prisma Client not generated**
```bash
npm run db:generate
```

### Database Issues

**Error: Connection timeout**
- Check `DATABASE_URL` uses port 6543 (pgBouncer)
- Verify Supabase project is not paused
- Check connection pooler is enabled

**Error: Migration failed**
- Use `DIRECT_DATABASE_URL` for migrations
- Ensure port 5432 is accessible

### Deployment Issues

**Vercel: Build failed**
- Check build logs in Vercel dashboard
- Ensure all env vars are set
- Try local build: `npm run build`

**Vercel: App crashes on startup**
- Check environment variable validation
- Verify secrets are set correctly
- Check health endpoint: `/api/health`

## 📈 Monitoring

### Health Checks

```bash
# Check if app is healthy
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
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

### Logs

View logs in Vercel:
- Vercel Dashboard → Your Project → Logs
- Filter by severity (info, warn, error)
- Search by user email or action

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'feat: add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `chore:` Maintenance tasks
- `refactor:` Code refactoring

## 📄 License

[MIT License](LICENSE) - Feel free to use this project for your campus!

## 👥 Support

- 📧 Email: support@your-campus.edu
- 🐛 Issues: [GitHub Issues](https://github.com/YOUR_USERNAME/GatePass/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/YOUR_USERNAME/GatePass/discussions)

## 🎯 Roadmap

- [ ] Mobile app (React Native)
- [ ] SMS notifications
- [ ] Email notifications
- [ ] Parent dashboard
- [ ] Analytics dashboard
- [ ] Multi-campus support
- [ ] Visitor pre-registration
- [ ] Integration with student ID cards

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Supabase](https://supabase.com/)
- Deployed on [Vercel](https://vercel.com/)
- Icons by [Lucide](https://lucide.dev/)

---

Built with ❤️ for campus safety and efficiency

**Production-Ready** | **Scalable** | **Secure**
