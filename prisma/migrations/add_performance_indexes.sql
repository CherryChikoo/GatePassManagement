-- Performance optimization indexes for GatePass application
-- Run this to speed up common queries

-- Index on permissions for faster dashboard queries
CREATE INDEX IF NOT EXISTS idx_permissions_approver_status ON permissions(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_permissions_student_status ON permissions(student_id, status);
CREATE INDEX IF NOT EXISTS idx_permissions_created_at ON permissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permissions_approved_at ON permissions(approved_at DESC) WHERE approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_rejected_at ON permissions(rejected_at DESC) WHERE rejected_at IS NOT NULL;

-- Index on movements for faster activity tracking
CREATE INDEX IF NOT EXISTS idx_movements_student_type ON movements(student_id, type);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_gate_type ON movements(gate_id, type, created_at DESC);

-- Index on QR credentials for faster lookups
CREATE INDEX IF NOT EXISTS idx_qr_token ON qr_credentials(token);
CREATE INDEX IF NOT EXISTS idx_qr_permission_active ON qr_credentials(permission_id, active);
CREATE INDEX IF NOT EXISTS idx_qr_expires_at ON qr_credentials(expires_at);

-- Index on students for faster faculty/warden queries
CREATE INDEX IF NOT EXISTS idx_students_faculty ON students(faculty_id);
CREATE INDEX IF NOT EXISTS idx_students_warden ON students(warden_id);
CREATE INDEX IF NOT EXISTS idx_students_profile ON students(profile_id);

-- Index on profiles for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Composite index for common permission queries
CREATE INDEX IF NOT EXISTS idx_permissions_composite ON permissions(approver_id, approver_type, status, created_at DESC);

-- Index for expiration checks
CREATE INDEX IF NOT EXISTS idx_permissions_pending_expired ON permissions(status, created_at) WHERE status = 'PENDING';
