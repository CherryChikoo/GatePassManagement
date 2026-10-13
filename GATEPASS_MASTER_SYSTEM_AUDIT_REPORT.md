# 🛡️ GatePass Portal — God-Tier Master Architecture & Codebase Audit Report

> **Document Version:** 2.0.0 (Master Release)  
> **Classification:** Comprehensive Technical Specification & Full Codebase Audit  
> **Target Audience:** Engineering Leads, DevOps Architects, Core Developers, Security Auditors & Autonomous AI Agents  
> **Repository:** `GatePass` | **Framework:** Next.js 16.3.8 (App Router) | **React:** 19.2.8 | **Database:** PostgreSQL + Prisma ORM 5.20.0 | **Auth:** Supabase Auth + Edge SSR

---

## 📑 Table of Contents

1. [Executive Summary & System Purpose](#1-executive-summary--system-purpose)
2. [High-Level Architecture & Tech Stack](#2-high-level-architecture--tech-stack)
3. [Repository File Map & Directory Structure](#3-repository-file-map--directory-structure)
4. [Database Models, Schema & Entity Relationships](#4-database-models-schema--entity-relationships)
5. [Authentication, Authorization & Edge Middleware](#5-authentication-authorization--edge-middleware)
6. [State Management & Unified Preload Pipeline](#6-state-management--unified-preload-pipeline)
7. [Comprehensive Role-Based Portals & Dashboards](#7-comprehensive-role-based-portals--dashboards)
   - 7.1 [Student Portal (Tri-State Lifecycle)](#71-student-portal-tri-state-lifecycle)
   - 7.2 [Faculty Portal](#72-faculty-portal)
   - 7.3 [Faculty-Admin Portal](#73-faculty-admin-portal)
   - 7.4 [Hostel Warden Portal](#74-hostel-warden-portal)
   - 7.5 [Security Guard & Gate Scanner Portal](#75-security-guard--gate-scanner-portal)
   - 7.6 [Superadmin & Campus Operations Portal](#76-superadmin--campus-operations-portal)
8. [QR Verification, Cryptography & Security Protocols](#8-qr-verification-cryptography--security-protocols)
9. [Visitor & Outsider Management System](#9-visitor--outsider-management-system)
10. [Automated Cron Jobs, Data Expiry & Housekeeping](#10-automated-cron-jobs-data-expiry--housekeeping)
11. [Design System, Aesthetics & UI Tokens](#11-design-system-aesthetics--ui-tokens)
12. [API Reference & Server Action Registry](#12-api-reference--server-action-registry)
13. [Recent Fixes, Quirks & State Machine Rules](#13-recent-fixes-quirks--state-machine-rules)
14. [Deployment, Environment Configuration & Seed Credentials](#14-deployment-environment-configuration--seed-credentials)

---

## 1. Executive Summary & System Purpose

The **GatePass Portal** is an enterprise-grade campus movement authorization, gate security enforcement, and visitor tracking ecosystem engineered to handle **5,000+ concurrent students, faculty members, hostel wardens, and gate guards**.

### Problem Solved
Traditional university gate pass systems rely on fragile physical paper chits, unverified phone calls, manual ledger entries by guards, and cumbersome in-person sign-offs. These methods suffer from:
- Forgery and signature falsification.
- No real-time verification or tracking of students who left campus and failed to return by curfew.
- Severe gate bottleneck queues during peak hours (3:00 PM – 6:00 PM).
- Zero accountability and audit trails for unauthorized departures.

### The GatePass Solution
GatePass replaces paper with an **end-to-end digital lifecycle**:
1. **Student applies** from their phone with a locked single-exit pass request specifying purpose, destination, and expected departure time.
2. **Faculty Advisor / Hostel Warden reviews** the request in real time with 1-click approvals or custom rejections.
3. **Dynamic anti-screenshot QR Code** is minted with tamper-proof HMAC-SHA256 signatures, refreshing every 30 seconds.
4. **Security Guards scan the QR** using web cameras; the system performs atomic TOCTOU checks, mandates a live gate exit photo capture, and logs gate entry/exit timestamps.
5. **Nightly Cron Jobs** auto-expire stale passes, invalidate orphaned QR credentials, and purge old audit photos to maintain database compliance.

---

## 2. High-Level Architecture & Tech Stack

```mermaid
graph TD
    Client[Browser / Mobile PWA] --> Cloudflare[Vercel Edge Network]
    Cloudflare --> Middleware[Edge SSR Middleware jose JWT Decode]
    Middleware --> AppRouter[Next.js 16 App Router]
    
    subgraph Frontend State
        Zustand[Zustand Store - useAppStore]
        PreloadAPI["/api/data/preload (Single Payload)"]
        Zustand <--> PreloadAPI
    end

    subgraph Backend Server Actions
        AppRouter --> AuthActions[Server Actions: auth.ts]
        AppRouter --> PermActions[Server Actions: permissions.ts]
        AppRouter --> ApprActions[Server Actions: approvals.ts]
        AppRouter --> SecActions[Server Actions: security.ts]
        AppRouter --> AdminActions[Server Actions: admin.ts]
        AppRouter --> VisitorActions[Server Actions: outsiders.ts]
    end

    subgraph Database & Persistence
        Prisma[Prisma Client 5.20.0]
        PgBouncer[(Supabase PostgreSQL Pool :6543)]
        DirectDB[(Direct PostgreSQL Connection :5432)]
        Prisma --> PgBouncer
        Prisma -. Migrations/Push .-> DirectDB
        SupaStorage[(Supabase Storage - Exit Photos)]
    end

    subgraph Background Automations
        VercelCron[Vercel Cron Trigger]
        VercelCron --> ExpireCron["/api/cron/expire-requests (00:00 UTC)"]
        VercelCron --> CleanCron["/api/cron/cleanup (02:00 UTC)"]
    end
```

### Complete Technology Stack Matrix

| Layer | Technology | Version | Purpose & Rationale |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js App Router | `16.3.8` | React Server Components, Server Actions, Edge Middleware, optimized caching |
| **UI Library** | React | `19.2.8` | Latest React concurrent features, hooks, transitions (`useTransition`) |
| **Language** | TypeScript | `^5.0.0` | Strict end-to-end type safety |
| **Styling** | Tailwind CSS v4 + Vanilla CSS | `^4.0.0` | Fast compilation, CSS variables, dark-mode design system |
| **Icons** | Lucide React | `^1.49.0` | Crisp vector iconography |
| **Database ORM** | Prisma | `^5.20.0` | Schema migrations, type-safe queries, relation joins |
| **Database** | PostgreSQL on Supabase | 15+ | Transactional integrity, connection pooling via PgBouncer |
| **Authentication** | Supabase Auth + JWT | `@supabase/ssr` `0.12.7` | Secure cookie sessions with edge token decoding |
| **State Management**| Zustand + Persist | `^5.0.15` | Fast client state, `localStorage` hydration, 15s tab-aware sync |
| **Validation** | Zod | `^4.6.5` | Strict schema validation across server actions and forms |
| **QR Generation** | qrcode | `^1.5.4` | Client-side QR canvas rendering with high error correction (`H`) |
| **QR Scanning** | jsQR | `^1.4.0` | Fast browser camera feed scanning in real time |
| **JWT Tokens** | jose | `^6.2.12` | Cryptographic signing and verification for dynamic QR passes |
| **Top Loader** | nextjs-toploader | `^3.9.17` | Sleek route transition loading indicator |

---

## 3. Repository File Map & Directory Structure

```text
GatePass/
├── prisma/
│   ├── schema.prisma            # Master database schema definitions
│   └── seed.ts                  # Database seeder (creates gates, admin, faculty, wardens, students)
├── public/                      # Static brand assets and favicons
├── scripts/
│   └── apply-indexes.js         # Production database indexing script for Supabase pgBouncer
├── src/
│   ├── app/
│   │   ├── admin/               # Superadmin portal
│   │   │   ├── activity/        # Master campus-wide activity log
│   │   │   ├── gates/           # Physical gate management CRUD
│   │   │   ├── users/           # User management (all roles, assignment, status toggle)
│   │   │   │   └── [id]/        # User drilldown with movement history
│   │   │   ├── client.tsx       # Admin dashboard client overview
│   │   │   ├── layout.tsx       # Admin route wrapper
│   │   │   └── page.tsx         # Admin server entry point
│   │   ├── api/
│   │   │   ├── auth/callback/   # Supabase OAuth callback handler
│   │   │   ├── cron/
│   │   │   │   ├── cleanup/     # 02:00 AM data retention & archival cron
│   │   │   │   └── expire-requests/ # Midnight 00:00 AM request auto-expire cron
│   │   │   ├── data/
│   │   │   │   └── preload/     # Unified role-based single-call preload API
│   │   │   └── health/          # System health check (:200 database & API latency)
│   │   ├── faculty/             # Faculty advisor portal
│   │   │   ├── activity/        # Faculty recent approval logs
│   │   │   ├── apply/           # Faculty official exit pass application
│   │   │   ├── requests/        # Student approval queue (batch & individual)
│   │   │   ├── students/        # Department student directory
│   │   │   ├── client.tsx       # Faculty dashboard client
│   │   │   └── page.tsx         # Faculty server entry point
│   │   ├── faculty-admin/       # Executive Faculty-Admin portal
│   │   │   ├── activity/        # Faculty movement activity logs
│   │   │   ├── requests/        # Faculty gate pass approval queue
│   │   │   ├── client.tsx       # Faculty-admin dashboard client
│   │   │   └── page.tsx         # Faculty-admin server entry point
│   │   ├── login/               # Secure multi-role sign-in portal
│   │   ├── security/            # Gate Guard portal
│   │   │   ├── log/             # Daily gate entry/exit logs
│   │   │   ├── outsiders/       # Guest, vendor & parent entry management
│   │   │   ├── scan/            # Live camera QR scanner & photo capture
│   │   │   ├── client.tsx       # Security dashboard overview
│   │   │   └── page.tsx         # Security server entry point
│   │   ├── settings/            # User profile, phone & password configuration
│   │   ├── student/             # Student permission portal
│   │   │   ├── entry/           # Campus entry request form (return from outside)
│   │   │   ├── history/         # Student past pass history & cancellation
│   │   │   ├── qr/              # Fullscreen dynamic refreshing QR pass
│   │   │   ├── request/         # Campus exit pass form
│   │   │   ├── client.tsx       # Student tri-state state machine client
│   │   │   └── page.tsx         # Student server entry point
│   │   ├── globals.css          # Theme design tokens, dark background, animations
│   │   ├── layout.tsx           # Root HTML layout with fonts and top loader
│   │   └── page.tsx             # Root redirector based on authenticated user role
│   ├── components/
│   │   ├── dashboard/
│   │   │   └── layout.tsx       # Unified responsive shell (sidebar, desktop collapse, mobile nav)
│   │   ├── providers/
│   │   │   └── store-hydrator.tsx# Zustand client hydration sync wrapper
│   │   ├── ui/                  # Reusable atomic UI components (Button, Card, Input, Modal, etc.)
│   │   └── error-boundary.tsx   # React error boundary
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── helpers.ts       # getAuthUser, requireRole, getRoleDashboardPath
│   │   │   └── rate-limiter.ts  # In-memory IP/email sliding window rate limiter
│   │   ├── db/
│   │   │   └── prisma.ts        # Prisma client singleton instance
│   │   ├── qr/
│   │   │   └── token.ts         # HMAC-SHA256 JWT minting and cryptographic verification
│   │   ├── storage/
│   │   │   └── image-upload.ts  # Base64 photo processing and Supabase storage upload
│   │   ├── supabase/
│   │   │   ├── middleware.ts    # Edge session verification and cookie parsing
│   │   │   └── server.ts        # Server-side Supabase client initialization
│   │   ├── validation/
│   │   │   └── schemas.ts       # Zod schemas for forms and actions
│   │   ├── constants/           # Global application limits and defaults
│   │   ├── logger/              # Production structured logging wrapper
│   │   └── utils.ts             # Tailwind merge, date formatting, relative timestamps
│   ├── server/actions/          # Next.js Server Actions (mutations and queries)
│   │   ├── admin.ts             # User CRUD, role assignments, gate configurations
│   │   ├── approvals.ts         # Faculty/Warden pass approval, rejection, and QR minting
│   │   ├── auth.ts              # Login rate limit, Supabase sign-in, session logout
│   │   ├── faculty-permissions.ts# Faculty's own pass requests and cancellations
│   │   ├── outsiders.ts         # Visitor registration and checkout
│   │   ├── permissions.ts       # Student exit/entry request creation, cancellation, QR fetch
│   │   ├── security.ts          # Atomic gate QR verification, photo exit, and entry logging
│   │   └── settings.ts          # User password change and profile updates
│   ├── stores/
│   │   └── app-store.ts         # Master Zustand store with unified preload caching
│   └── middleware.ts            # Global Next.js route protection matcher
├── vercel.json                  # Deployment configuration, security headers, and cron schedules
├── package.json                 # Dependency manifest
└── tsconfig.json                # TypeScript compiler configuration
```

---

## 4. Database Models, Schema & Entity Relationships

The database is built on PostgreSQL with strict relational foreign keys and performance indexes.

```mermaid
erDiagram
    Profile ||--o| Student : "has"
    Profile ||--o| Faculty : "has"
    Profile ||--o| Warden : "has"
    Profile ||--o| SecurityStaff : "has"
    
    Student ||--o{ Permission : "requests"
    Faculty ||--o{ Permission : "applies for"
    Faculty ||--o{ Student : "advises"
    Warden ||--o{ Student : "supervises"
    
    Permission ||--|| QrCredential : "mints"
    Permission ||--o| PermissionApproval : "evaluated by"
    Permission ||--o{ Movement : "generates"
    
    Gate ||--o{ SecurityStaff : "assigned to"
    Gate ||--o{ Movement : "recorded at"
    SecurityStaff ||--o{ Movement : "scans"
```

### Detailed Table Specifications

#### 1. `profiles`
The master authentication profile linked 1-to-1 with Supabase Auth (`userId`).
- `id`: UUID (Primary Key)
- `userId`: String (Unique Supabase Auth User ID)
- `role`: Enum (`ADMIN`, `STUDENT`, `FACULTY`, `FACULTY_ADMIN`, `WARDEN`, `SECURITY`)
- `name`: String
- `email`: String (Unique)
- `phone`: String (Nullable)
- `active`: Boolean (Default: `true`)
- `createdAt`, `updatedAt`: Timestamps

#### 2. `students`
Specialized attributes for student accounts.
- `id`: UUID (Primary Key)
- `profileId`: UUID (Foreign Key -> `profiles.id`, Cascade Delete)
- `studentRoll`: String (Unique Roll Number / Reg ID)
- `department`: String (e.g., Computer Science, Mechanical)
- `year`: Integer (e.g., 1, 2, 3, 4)
- `section`: String (e.g., A, B, C)
- `studentType`: Enum (`DAY_SCHOLAR`, `HOSTELLER`)
- `facultyId`: UUID (Foreign Key -> `faculty.id`, Assigned Advisor)
- `wardenId`: UUID (Foreign Key -> `wardens.id`, Assigned Warden)
- `roomNumber`: String (Nullable, for hostellers)
- `hostelBlock`: String (Nullable, e.g., "Block A - Boys")
- `status`: Enum (`INSIDE`, `OUTSIDE`)

#### 3. `faculty`
Academic staff profiles authorized to approve Day Scholar requests.
- `id`: UUID (Primary Key)
- `profileId`: UUID (Foreign Key -> `profiles.id`)
- `employeeId`: String (Unique)
- `department`: String
- `designation`: String (e.g., Assistant Professor, HOD)
- `maxApprovals`: Integer (Default: 5 per day limit)

#### 4. `wardens`
Hostel residential staff authorized to approve Hosteller requests.
- `id`: UUID (Primary Key)
- `profileId`: UUID (Foreign Key -> `profiles.id`)
- `employeeId`: String (Unique)
- `hostelBlock`: String (e.g., "Block A - Boys", "Block B - Girls")

#### 5. `security_staff`
Campus gate guards stationed at specific physical gates.
- `id`: UUID (Primary Key)
- `profileId`: UUID (Foreign Key -> `profiles.id`)
- `employeeId`: String (Unique)
- `gateId`: UUID (Foreign Key -> `gates.id`)

#### 6. `permissions`
The core movement permit record.
- `id`: UUID (Primary Key)
- `studentId`: UUID (Nullable, Foreign Key -> `students.id`)
- `facultyId`: UUID (Nullable, Foreign Key -> `faculty.id`, for faculty's own pass)
- `type`: Enum (`EXIT`, `ENTRY`)
- `approverType`: Enum (`FACULTY`, `WARDEN`, `FACULTY_ADMIN`)
- `approverId`: String (ID of assigned approver)
- `status`: Enum (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `EXITED`, `COMPLETED`)
- `purpose`: String (Min 5 chars, Max 500 chars)
- `destination`: String (Nullable, Max 200 chars)
- `exitDate`: DateTime (Locked to current date)
- `expectedExit`: DateTime (Exit time timestamp)
- `expectedReturn`: DateTime (Nullable, Return curfew timestamp)
- `contactNumber`: String (Nullable, 10-digit emergency phone)
- `remarks`: String (Nullable)
- `rejectionReason`: String (Nullable, mandatory if rejected)
- `approvedAt`, `rejectedAt`, `cancelledAt`: Timestamps

#### 7. `qr_credentials`
Cryptographic tokens minted upon pass approval.
- `id`: UUID (Primary Key)
- `permissionId`: UUID (Foreign Key -> `permissions.id`, Cascade Delete)
- `token`: String (Unique signed HMAC-SHA256 JWT)
- `expiresAt`: DateTime
- `active`: Boolean (Default: `true`)
- `usedForExit`: Boolean (Default: `false`)
- `usedForEntry`: Boolean (Default: `false`)

#### 8. `movements`
Permanent gate entry and exit movement log.
- `id`: UUID (Primary Key)
- `permissionId`: UUID (Foreign Key -> `permissions.id`)
- `studentId`: UUID (Nullable)
- `facultyId`: UUID (Nullable)
- `gateId`: UUID (Foreign Key -> `gates.id`)
- `securityUserId`: UUID (Foreign Key -> `security_staff.id`)
- `type`: Enum (`EXIT`, `ENTRY`)
- `imagePath`: Text (Nullable, Base64 live photo capture taken at gate)
- `notes`: String (Nullable)
- `createdAt`: DateTime (Movement timestamp)

#### 9. `gates`
Campus entry and exit portals.
- `id`: UUID (Primary Key)
- `name`: String (Unique, e.g., "Main Gate", "Back Gate", "Hostel Gate")
- `location`: String (Nullable)
- `active`: Boolean (Default: `true`)

#### 10. `outsiders`
Visitor, vendor, and parent tracking.
- `id`: UUID (Primary Key)
- `name`: String
- `phone`: String
- `category`: String (Default: "GUEST", e.g., "PARENT", "VENDOR", "RELATIVE")
- `purpose`: String
- `visitingStudent`: String (Nullable, student roll/name being visited)
- `gate`: String (Nullable)
- `vehicleNumber`: String (Nullable)
- `photoUrl`: Text (Nullable)
- `status`: String (Default: "INSIDE", changes to "EXITED")
- `entryTime`: DateTime (Default: `now()`)
- `exitTime`: DateTime (Nullable)

---

## 5. Authentication, Authorization & Edge Middleware

### Fast Offline Edge JWT Decoding
To prevent high-latency roundtrips to Supabase Auth on every single page view:
1. **Edge Middleware (`src/lib/supabase/middleware.ts`)** extracts the Supabase session cookie (`-auth-token`).
2. It validates and decodes the JWT payload offline using `jose`'s `decodeJwt`.
3. Validated sessions are stored in an in-memory session cache (up to 2,000 entries with 60-second TTL).
4. Downstream headers `x-user-id` and `x-user-email` are stamped onto the request, allowing Server Components to resolve the user in `0ms` network latency.
5. If the cookie is expired or missing, unauthenticated requests are redirected immediately to `/login`.

### Multi-Role Routing Map
After sign-in via `loginAction`, users are redirected according to their active profile role:

```typescript
export function getRoleDashboardPath(role: Role): string {
  switch (role) {
    case "ADMIN":         return "/admin";
    case "STUDENT":       return "/student";
    case "FACULTY":       return "/faculty";
    case "FACULTY_ADMIN": return "/faculty-admin";
    case "WARDEN":        return "/warden";
    case "SECURITY":      return "/security";
    default:              return "/login";
  }
}
```

### Rate Limiting on Sign-In
To prevent brute-force credential stuffing:
- `checkRateLimit("login:${email}")` enforces a strict policy: Max 5 failed attempts per window.
- Exceeding the threshold temporarily blocks login attempts for 15 minutes, returning an immediate friendly countdown to the user.

---

## 6. State Management & Unified Preload Pipeline

### The Problem With Traditional Fetching
In high-scale multi-role dashboards, loading a page typically causes a "waterfall" of 5 to 8 separate server queries (e.g. stats, requests, user roster, notifications, profile). When 5,000 users open their apps simultaneously, the database pool collapses under the connection storm.

### The Unified `/api/data/preload` Engine
GatePass resolves this with a single unified preload endpoint (`src/app/api/data/preload/route.ts`):
- When a user logs in, the client calls `/api/data/preload` **exactly once**.
- The server identifies the user's role and fetches all necessary data concurrently using `Promise.all` in one optimized database query batch.
- The payload is returned keyed by data type:
  - **Student:** `{ dashboard: { student, isHosteller, approvers, state, latestPermission }, formData, history }`
  - **Faculty:** `{ dashboard: { faculty, stats, recentActivity }, requests, students, wardens, myPasses }`
  - **Warden:** `{ dashboard: { warden, stats, recentActivity }, requests, students, wardens }`
  - **Security:** `{ dashboard: { stats, recentMovements, gates }, log, outsiders, gates }`
  - **Admin:** `{ dashboard: { stats, recentMovements, gates }, users, adminGates, faculty, wardens, allGates }`

### Client Zustand Store (`src/stores/app-store.ts`)
- The payload is stored in the global Zustand state and backed by `localStorage` persistence under key `gatepass-store`.
- **Background Synchronization:**
  - Syncs every 15 seconds silently without triggering loading spinners.
  - **Tab Visibility Awareness:** Pauses polling if the browser tab is hidden or minimized (`document.visibilityState === "visible"`), preventing battery and network waste.
  - **Throttling:** Prevents sync spam if the user switches browser tabs rapidly (10-second minimum cooldown).

---

## 7. Comprehensive Role-Based Portals & Dashboards

### 7.1 Student Portal (Tri-State Lifecycle)

The student experience is built around a deterministic **State Machine** (`src/app/student/client.tsx`):

```mermaid
stateDiagram-v2
    [*] --> FORM: No active request / Completed / Rejected
    
    FORM --> PENDING: Student submits Exit/Entry request
    
    PENDING --> PENDING: Locked waiting state (Polls every 5s)
    PENDING --> FORM: Student cancels request
    PENDING --> FORM: Approver rejects request (Displays red rejection banner)
    
    PENDING --> QR_CODE: Approver approves request
    
    QR_CODE --> QR_CODE: Displays live QR (Refreshes every 30s)
    QR_CODE --> FORM: Guard scans Exit (Auto-redirect after exit)
    QR_CODE --> FORM: Pass expires without scan (Displays amber expiry banner)
```

#### Core Student Features:
1. **Locked Request Single-Pass State:**
   - A student can only have **one active pass** at any given moment (`PENDING` or `APPROVED`).
   - If a pass is pending, the application form is completely replaced by the **"Request Pending Approval"** screen displaying the selected approver's name and expected exit time.
   - If approved, the screen switches automatically to the **Dynamic QR Code** screen.
2. **Dual Pass Types:**
   - **EXIT Request (`/student/request`):** Request to leave campus. Requires purpose, destination, exit date, expected exit time, optional return time, and emergency contact number.
   - **ENTRY Request (`/student/entry`):** Request to enter campus from outside. Requires purpose, destination, entry date, expected entry time, and emergency contact number.
3. **Daily Date Rollover & Auto-Lock:**
   - The exit date is **strictly locked and read-only** to ensure passes are filed only for today.
   - A 60-second client ticker checks local time: as soon as the clock strikes midnight (`00:00:00`), the input automatically rolls over to the new calendar day.
4. **Emergency Contact Validation:**
   - Maximum 10 characters permitted (`maxLength={10}`).
   - Form accepts international numbers or standard 10-digit mobile numbers with Zod validation.
5. **Expected Exit Time Display:**
   - In the "Request Pending Approval" card, only the **Expected Exit Time** is highlighted (e.g. `04:00 PM`), avoiding clutter from return timings.
6. **Student Request History (`/student/history`):**
   - Paginated historical ledger of all prior requests.
   - Real-time status badges (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `EXITED`, `COMPLETED`).
   - Displays approver feedback and reasons for rejected passes.
   - 1-click cancellation button for pending passes.

---

### 7.2 Faculty Portal

Designed for department faculty advisors managing Day Scholar permissions (`src/app/faculty/client.tsx`).

#### Core Faculty Features:
1. **Statistical Overview:**
   - 5 KPI stat cards: *Total Students*, *Approved Today*, *Rejected Today*, *Exits Today*, *Entries Today*.
2. **Interactive Request Filters:**
   - Filter request ledger by tab: `All Requests`, `Pending`, `Accepted`, `Rejected`.
3. **Approval Queue (`/faculty/requests`):**
   - View pending student passes with full details: Student Name, Roll Number, Department, Year, Section, Purpose, Destination, and Expected Departure.
   - **Batch Approvals:** Select up to 5 students simultaneously and approve them with one click.
   - **Custom Expiry Windows:** Set QR validity duration upon approval (e.g., 30 mins, 1 hour, 2 hours).
   - **Rejection Reason Modal:** Mandates an explicit explanation before denying any request.
4. **Department Student Roster (`/faculty/students`):**
   - Directory of all students assigned to the faculty member.
   - Displays student roll number, contact information, hostel status, and active movement state.
5. **My Passes Section (`/faculty/apply`):**
   - Allows faculty members to submit their own official campus exit passes.
   - Automatically routes pass requests to the `FACULTY_ADMIN` queue.

---

### 7.3 HOD (Head of Department) Portal (Formerly Faculty-Admin)

Designed for Heads of Department (HOD) to provide dual-tier oversight across both academic faculty and student bodies within their department (`src/app/faculty-admin/client.tsx`).

#### Core HOD Features:
1. **Full Faculty Member Authority + Executive Oversight:**
   - The HOD inherits all capabilities of an academic faculty member:
     - Department student roster review and management.
     - Student pass evaluation and approval.
     - Batch gate pass issuance for student academic delegations and field trips.
     - Self-pass submission (`/faculty-admin/apply`) for official duties and conferences.
   - **PLUS Exclusive Faculty Pass Approval:** Sole authority to evaluate, approve, or reject gate passes submitted by departmental faculty members.
2. **Unified Dashboard (`/faculty-admin`):**
   - 5 KPI stat cards: Total Students, Approved Today, Rejected Today, Exits Today, Entries Today.
   - Pending Faculty Pass Attention Banner alerting the HOD when faculty requests require immediate review.
   - Interactive requests table with category tabs: *All Requests*, *Faculty Passes*, *Student Passes*, *Pending*, *Approved*, *Rejected*.
3. **Comprehensive Approval Queue (`/faculty-admin/requests`):**
   - Filterable by request type (*All*, *Faculty Passes*, *Student Passes*) and status.
   - Search by name, roll number, employee ID, destination, or purpose.
   - 1-click single approvals with QR validity duration selectors (30m, 1h, 2h, 4h, 8h, full day).
   - Multi-select batch processing (approve or reject up to 5 requests concurrently).
4. **Department Student Directory (`/faculty-admin/students`):**
   - Complete roster of students in the HOD's department.
   - Live status indicator (`INSIDE` vs `OUTSIDE`), hostel assignments, and student contact info.
   - Batch pass generation for student cohorts.
5. **Department Faculty Directory (`/faculty-admin/faculty`):**
   - Directory of all faculty members in the department with designations, employee IDs, and contact info.
6. **Movement & Turnstile Activity Logs (`/faculty-admin/activity`):**
   - Complete unified log stream recording both student and faculty campus exits and entries.
7. **Admin User Creation & Database Schema:**
   - Admins can provision new HODs directly from `/admin/users`.
   - Creating an HOD provisions a `profiles` record (`role: FACULTY_ADMIN`) atomically coupled with a `faculty` record (`designation: "Head of Department"`, `department: data.department`), ensuring seamless relational linkage with assigned students and permissions.
8. **Navigation Bug Resolution:**
   - Corrected route prefix matching in `src/components/dashboard/layout.tsx` where `/faculty-admin` incorrectly caused simultaneous highlighting of both the Dashboard and sub-items. Root paths are now strictly evaluated, ensuring crisp single-item selection.

---

### 7.4 Hostel Warden Portal

Dedicated to residential hostel security, leave tracking, and curfew compliance (`src/app/warden/client.tsx`).

#### Core Warden Features:
1. **Hostel Block Scoping:**
   - Automatically scoped to the warden's assigned residential building (e.g. *Block A - Boys* or *Block B - Girls*).
2. **Curfew & Night-Out Tracking:**
   - Evaluates hosteller overnight passes and weekend leave applications.
   - Tracks expected return curfew hours; flags students who remain outside campus after curfew.
3. **Hosteller Directory (`/warden/students`):**
   - Room number mapping (e.g. Room A-205).
   - Displays student contact phone, guardian contact, and current status (`INSIDE` vs `OUTSIDE`).
4. **Fast Approval Flow (`/warden/requests`):**
   - Instant 1-click approvals with configurable expiry timers.

---

### 7.5 Security Guard & Gate Scanner Portal

Engineered for handheld smartphones and tablets used by physical security staff stationed at gates (`src/app/security/scan/client.tsx`).

#### Core Security Features:
1. **Live Camera QR Code Scanner:**
   - Built on `jsQR` with automated device camera selection prioritizing environment / rear-facing cameras.
   - Live scanning viewfinder with laser guide micro-animations.
   - Continuous scanning loop (`requestAnimationFrame`) with automatic frame decoders.
2. **Instant Cryptographic Verification:**
   - Validates HMAC-SHA256 signature on the QR token.
   - Checks pass expiration date and active token status.
   - Detects whether the pass is valid for **EXIT** (leaving campus) or **ENTRY** (returning to campus).
3. **Student Identity Card Card Modal:**
   - Displays student verified photo, roll number, department, year, contact phone, approved departure time, and verified purpose.
4. **Mandatory Photo Capture Upon Exit:**
   - When registering an `EXIT`, security is prompted to capture a live photo of the student departing through the turnstile.
   - Photo is converted to compressed Base64 payload (<500 KB limit) and permanently attached to the `Movement` log.
5. **Atomic TOCTOU Protection:**
   - Database reads and status updates execute inside a serializable Prisma interactive transaction (`prisma.$transaction`).
   - Prevents duplicate scans if two guards scan the same pass at different gates simultaneously.
6. **Daily Movement Log (`/security/log`):**
   - Live stream of all student entries, student exits, and visitor visits for the day.
   - Searchable by student roll number, gate name, or timestamp.

---

### 7.6 Superadmin & Campus Operations Portal

Complete institutional control center (`src/app/admin/client.tsx`).

#### Core Admin Features:
1. **Master Campus Analytics:**
   - Aggregated counts of Total Students, Faculty, Wardens, Security Guards, and Active Outsiders Inside.
   - Real-time today metrics: Total Approvals, Rejections, Gate Entries, Gate Exits.
2. **User Management Engine (`/admin/users`):**
   - Full CRUD across all 6 roles.
   - Create new users in Supabase Auth and database atomically.
   - Toggle user active status (`active: false` instantly revokes access).
   - Assign Faculty Advisors to Day Scholars and Hostel Wardens to Hostellers.
   - Assign Security Guards to specific campus gates.
   - User detail drilldown (`/admin/users/[id]`): Inspect full historical passes and movement logs for any specific student or staff member.
3. **Physical Gate Management (`/admin/gates`):**
   - Create, rename, or deactivate campus gates (e.g., Main Gate, Back Gate, Sports Gate).
4. **Campus Activity & Audit Trails (`/admin/activity`):**
   - Comprehensive system audit log recording all permissions, approvals, gate movements, and visitor records.

---

## 8. QR Verification, Cryptography & Security Protocols

```mermaid
sequenceDiagram
    autonumber
    actor S as Student App
    participant A as Approver (Faculty/Warden)
    participant Server as GatePass Server
    participant DB as PostgreSQL Database
    actor G as Security Guard (Camera)

    A->>Server: handleApproval(permissionId, APPROVE, expiry=60m)
    Server->>Server: Sign HMAC-SHA256 JWT (jose)
    Server->>DB: Update permission to APPROVED & Create qr_credentials
    S->>Server: Fetch Dynamic QR
    Server-->>S: Return JWT Token (Rotates every 30s)
    S->>S: Render high-error QR on canvas
    G->>S: Scans QR code with camera (jsQR)
    G->>Server: verifyQrScan(token)
    Server->>Server: Verify JWT signature & check expiration
    Server-->>G: Valid! Return student card & allowed action (EXIT)
    G->>Server: registerExit(permissionId, gateId, photoBase64)
    Server->>DB: Atomic Tx: Mark Qr usedForExit=true, status=EXITED, Insert Movement
    Server-->>G: Gate Clearance Confirmed
```

### Dynamic Anti-Screenshot Mechanism
To prevent students from taking screenshots of an approved QR code and sending it to unauthorized peers:
- Student's client calls `generateLiveQrToken` every **30 seconds**.
- The token contains a cryptographic timestamp `jti` and expiration timestamp.
- If a student tries to show an old screenshot older than 30 seconds, the scanner detects token expiration and rejects clearance.

---

## 9. Visitor & Outsider Management System

Campus security encompasses not just students, but also outside visitors (`src/app/security/outsiders/client.tsx` & `src/server/actions/outsiders.ts`).

### Categories Supported:
- `GUEST`: Official campus visitors and invitees.
- `PARENT`: Parents visiting residential hostellers.
- `VENDOR`: Contractors, food delivery personnel, delivery trucks, maintenance workers.
- `RELATIVE`: Family members visiting campus residents.

### Visitor Flow:
1. **Registration at Gate:** Guard inputs visitor Name, Mobile Phone, Category, Purpose, Visiting Student Roll/Name, Vehicle Number, and optional live camera photo.
2. **Status INSIDE:** Visitor is assigned `status: "INSIDE"` with timestamped entry time.
3. **Real-Time Inside Tracker:** Security dashboard displays a live count and searchable table of all outsiders currently on campus premises.
4. **1-Click Checkout:** When the visitor reaches any gate to leave, the guard clicks **"Mark Exited"**. System timestamps the departure and moves the record to historical logs.

---

## 10. Automated Cron Jobs, Data Expiry & Housekeeping

Configured via `vercel.json` and executed using secure constant-time token authentication.

### 1. Midnight Request Expiration (`/api/cron/expire-requests`)
- **Schedule:** `0 0 * * *` (Midnight 00:00 UTC daily).
- **Security:** Verified with header `x-cron-secret` compared via `crypto.timingSafeEqual` against `process.env.CRON_SECRET`.
- **Logic:**
  1. Identifies all permissions in `PENDING` or `APPROVED` state created prior to today's midnight (`createdAt < today`).
  2. Batch-updates their status to `EXPIRED`.
  3. Deactivates all unused QR credentials (`usedForExit: false, createdAt < today -> active: false`).
- **Result:** Students wake up every day with a clean slate; abandoned passes never linger.

### 2. Deep Archival & Photo Cleanup (`/api/cron/cleanup`)
- **Schedule:** `0 2 * * *` (02:00 AM UTC daily).
- **Data Retention Policies:**
  - Deletes completed/expired permissions older than **6 months**.
  - Deletes physical movements older than **1 year**.
  - Deletes deactivated QR credentials older than **30 days**.
  - Deletes gate exit audit photos older than **90 days** from Supabase Storage.

---

## 11. Design System, Aesthetics & UI Tokens

The user interface follows a modern dark-mode aesthetic with obsidian backgrounds and signature campus Red Orange accents.

```css
/* Core Color Palette Tokens */
--background: #09090b;       /* Obsidian Dark background */
--surface: #18181b;          /* Zinc-900 solid card background */
--surface-border: #27272a;   /* Zinc-800 card border */
--accent-orange: #FF4D00;    /* Signature Red Orange */
--accent-orange-hover: #e64500;
--text-primary: #fafafa;     /* High contrast white */
--text-secondary: #a1a1aa;   /* Zinc-400 muted subtitles */
--status-approved: #10b981;  /* Emerald-500 */
--status-rejected: #ef4444;  /* Red-500 */
--status-pending: #f59e0b;   /* Amber-500 */
```

### Typography Hierarchy
- **Headings (`h1`, `h2`, `h3`, `.font-heading`):** `Montserrat`, sans-serif (Bold, -0.02em letter spacing).
- **Body & Text (`body`, `p`, `span`):** `Inter`, system-ui, sans-serif (Clean, high legibility).
- **Interactive Elements (`button`, `a`, `.btn`):** `Poppins`, sans-serif (Modern, tactile).

### Micro-Animations
- `animate-fade-in`: 150ms ease-out opacity transition.
- `animate-scale-in`: Smooth 98% -> 100% card mount spring.
- `animate-slide-in`: Lateral drawer slide transition.
- `animate-pulse-glow`: Ambient luminous badge glow effect.
- `nextjs-toploader`: Dynamic amber-orange route progress bar atop the viewport.

---

## 12. API Reference & Server Action Registry

### Server Actions Matrix

| File | Function | Role Guard | Purpose |
| :--- | :--- | :--- | :--- |
| `auth.ts` | `loginAction(formData)` | Public (Rate Limited) | Validates credentials, checks profile status, returns redirect path |
| `auth.ts` | `logoutAction()` | Authenticated | Clears cookies, signs out Supabase session, redirects to `/login` |
| `permissions.ts` | `createPermissionRequest(formData)` | `STUDENT` | Submits standard campus EXIT request |
| `permissions.ts` | `createEntryRequest(formData)` | `STUDENT` | Submits campus ENTRY request |
| `permissions.ts` | `cancelPermissionRequest(id)` | `STUDENT` | Cancels student's own pending request |
| `permissions.ts` | `getStudentPermissions(page, size)` | `STUDENT` | Fetches student paginated pass history |
| `permissions.ts` | `getStudentActiveQr()` | `STUDENT` | Fetches active approved QR pass |
| `permissions.ts` | `generateLiveQrToken(permissionId)`| `STUDENT` | Generates 30-second live refreshed QR token |
| `approvals.ts` | `handleApproval(id, action, reason)`| `FACULTY`, `WARDEN`, `FACULTY_ADMIN` | Approves or rejects pass, generates QR credential |
| `approvals.ts` | `handleBatchApproval(ids, action)` | `FACULTY`, `WARDEN` | Approves up to 5 passes simultaneously |
| `faculty-permissions.ts` | `createFacultyPermissionRequest(fd)` | `FACULTY` | Submits faculty official exit pass to Faculty Admin |
| `faculty-permissions.ts` | `cancelFacultyPermissionRequest(id)` | `FACULTY` | Cancels faculty pending pass |
| `security.ts` | `verifyQrScan(token)` | `SECURITY`, `ADMIN` | Decodes QR token, verifies validity, returns student card |
| `security.ts` | `registerExit(permId, gateId, photo)`| `SECURITY`, `ADMIN` | Atomic transaction: logs student exit movement with photo |
| `security.ts` | `registerEntry(permId, gateId)` | `SECURITY`, `ADMIN` | Atomic transaction: logs student return entry movement |
| `outsiders.ts` | `registerOutsider(data)` | `SECURITY`, `ADMIN` | Registers campus guest, vendor or parent entry |
| `outsiders.ts` | `markOutsiderExited(id)` | `SECURITY`, `ADMIN` | Marks visitor departed with checkout timestamp |
| `admin.ts` | `createUser(formData)` | `ADMIN` | Creates new user in Supabase Auth and database |
| `admin.ts` | `toggleUserActive(userId)` | `ADMIN` | Activates or disables user account |
| `admin.ts` | `deleteUser(userId)` | `ADMIN` | Permanently deletes user account |
| `admin.ts` | `createGate(formData)` | `ADMIN` | Creates new campus gate |
| `admin.ts` | `assignFacultyToStudent(sId, fId)` | `ADMIN` | Binds faculty advisor to student |
| `admin.ts` | `assignWardenToStudent(sId, wId)` | `ADMIN` | Binds hostel warden to student |
| `admin.ts` | `assignGateToSecurity(secId, gId)` | `ADMIN` | Assigns guard to physical gate |
| `settings.ts` | `changePassword(oldPw, newPw)` | Authenticated | Updates user account password |

---

## 13. Recent Fixes, Quirks & State Machine Rules

The following key behaviors and optimizations are embedded in the current codebase:

1. **Student Form Tri-State Transition Rule:**
   - When a student has a request in `PENDING` status, they cannot access the form.
   - The UI displays the `PendingApprovalView` card showing the approver's name and **Expected Exit Time**.
   - As soon as the approver acts, the 5-second polling interval automatically flips the view to `QrCodeView` (if approved) or back to `PermissionFormView` with an explanatory rejection banner (if rejected).
2. **Single Exit Time Display Fix:**
   - In `src/app/student/client.tsx`, the pending card was streamlined from showing a full range of expected return times to displaying exclusively the **Expected Exit Time** as requested by the user.
3. **Daily Date Rollover & Form Immutability:**
   - The `exitDate` field is permanently disabled from manual keyboard manipulation (`readOnly cursor-not-allowed`).
   - The input's state is backed by an automated 60-second ticker (`setTodayStr`) that automatically shifts dates at midnight local time.
4. **Emergency Contact 10-Character Constraint:**
   - Both Exit and Entry forms restrict the telephone input to `maxLength={10}`.
5. **Autofill Dark Styling:**
   - Webkit autofill inputs have an internal box shadow applied (`-webkit-box-shadow: 0 0 0 30px #18181b inset`) to prevent ugly browser white backgrounds from breaking the dark theme.

---

## 14. Deployment, Environment Configuration & Seed Credentials

### Required Environment Variables (`.env`)

```ini
# Supabase Public Keys
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."

# Supabase Service Role (Admin User Creation)
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."

# PostgreSQL Database Connections
# Connection Pooler for Serverless Functions (pgBouncer on Port 6543)
DATABASE_URL="postgres://postgres.your-id:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct Database Connection for Prisma Migrations & DB Push (Port 5432)
DIRECT_DATABASE_URL="postgres://postgres.your-id:password@aws-0-region.pooler.supabase.com:5432/postgres"

# Cryptographic Secrets (Generated via Node crypto)
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
QR_JWT_SECRET="d54f7a..."

# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET="a89e1b..."
```

### Initial Seed Test Accounts (`prisma/seed.ts`)

> **Note on Test Passwords:** Seeded development accounts use a single password taken from the `SEED_DEFAULT_PASSWORD` environment variable (a random one is generated and printed if it is not set). Never use seeded accounts or shared passwords in production.

| Role | Test Email | Default Password | Notes |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Dr. Sarah Johnson (Superadmin) |
| **Faculty** | `faculty1@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Dr. Priya Sharma (Computer Science) |
| **Faculty** | `faculty2@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Prof. Rajesh Kumar (Electronics) |
| **Faculty-Admin**| `facultyadmin@campus.edu` or `admin2@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Executive Faculty Pass Approver |
| **Warden** | `warden1@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Mr. Suresh Reddy (Block A - Boys) |
| **Warden** | `warden2@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Mrs. Lakshmi Nair (Block B - Girls) |
| **Security** | `security1@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Mr. Ravi Singh (Main Gate) |
| **Security** | `security2@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Mr. Anil Verma (Back Gate) |
| **Student (Day)** | `student1@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Aarav Gupta (Roll: `21BCS101`, Day Scholar) |
| **Student (Hostel)**| `student6@campus.edu` | (see `SEED_DEFAULT_PASSWORD`) | Rohan Joshi (Roll: `21BCS601`, Room A-205) |

---

### Command Palette Cheat Sheet

```bash
# 1. Install dependencies
npm install

# 2. Push Prisma Schema to Supabase Database
npm run db:push

# 3. Seed Database with default gates & test users
npm run db:seed

# 4. Generate Prisma Client Types
npm run db:generate

# 5. Run Local Development Server
npm run dev

# 6. Build Production Bundle
npm run build
```

---

*Report compiled and certified following complete codebase audit of GatePass Portal.*
