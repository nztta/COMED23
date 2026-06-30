-- Student Payment Management & Financial Transparency Platform
-- Database Schema for Supabase PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Supabase Migrations table to satisfy Supabase Dashboard logs
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    dirty BOOLEAN NOT NULL DEFAULT FALSE
);

-- Trigger function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--------------------------------------------------------------------------------
-- 1. Roles Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS set_timestamp_roles ON roles;
CREATE TRIGGER set_timestamp_roles
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 2. Users Table (Extensions of Supabase auth.users)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    role_id UUID REFERENCES roles(id) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS set_timestamp_users ON users;
CREATE TRIGGER set_timestamp_users
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 3. Students Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id VARCHAR(12) UNIQUE NOT NULL, -- Format: 69xxxxxxx-x
    prefix VARCHAR(20) DEFAULT '',
    full_name VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    class VARCHAR(50) NOT NULL,
    academic_year VARCHAR(10) NOT NULL,
    email VARCHAR(255) DEFAULT NULL,
    password_hash VARCHAR(255) DEFAULT NULL,
    status VARCHAR(50) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_timestamp_students ON students;
CREATE TRIGGER set_timestamp_students
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 4. Monthly Payment Settings Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monthly_payment_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INT NOT NULL,
    weekly_fee DECIMAL(10, 2) NOT NULL CHECK (weekly_fee >= 0),
    number_of_weeks INT NOT NULL DEFAULT 4 CHECK (number_of_weeks BETWEEN 1 AND 5),
    open_date DATE NOT NULL,
    due_dates DATE[] NOT NULL, -- Array of due dates matching number_of_weeks
    close_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Closed' CHECK (status IN ('Open', 'Closed', 'Archived')),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT unique_month_year UNIQUE (month, year)
);

DROP TRIGGER IF EXISTS set_timestamp_monthly_payment_settings ON monthly_payment_settings;
CREATE TRIGGER set_timestamp_monthly_payment_settings
BEFORE UPDATE ON monthly_payment_settings
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 5. Slip Submissions Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slip_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) NOT NULL,
    month_setting_id UUID REFERENCES monthly_payment_settings(id) NOT NULL,
    weeks INT[] NOT NULL, -- Array of weeks being paid e.g., [1, 2]
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    slip_url TEXT NOT NULL,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (verification_status IN ('Pending', 'Approved', 'Rejected')),
    comments TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_timestamp_slip_submissions ON slip_submissions;
CREATE TRIGGER set_timestamp_slip_submissions
BEFORE UPDATE ON slip_submissions
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 6. Weekly Payment Records Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_payment_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) NOT NULL,
    month_setting_id UUID REFERENCES monthly_payment_settings(id) NOT NULL,
    week_number INT NOT NULL CHECK (week_number BETWEEN 1 AND 5),
    status VARCHAR(20) NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Pending', 'Verified', 'Overdue')),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    paid_date TIMESTAMP WITH TIME ZONE,
    verified_date TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    slip_submission_id UUID REFERENCES slip_submissions(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT unique_student_month_week UNIQUE (student_id, month_setting_id, week_number)
);

DROP TRIGGER IF EXISTS set_timestamp_weekly_payment_records ON weekly_payment_records;
CREATE TRIGGER set_timestamp_weekly_payment_records
BEFORE UPDATE ON weekly_payment_records
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 7. Payment Transactions Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) NOT NULL,
    slip_submission_id UUID REFERENCES slip_submissions(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    transaction_type VARCHAR(50) DEFAULT 'Payment' CHECK (transaction_type IN ('Payment', 'Refund', 'Adjustment')),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_timestamp_payment_transactions ON payment_transactions;
CREATE TRIGGER set_timestamp_payment_transactions
BEFORE UPDATE ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 8. Attachments Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slip_submission_id UUID REFERENCES slip_submissions(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL CHECK (file_size > 0),
    mime_type VARCHAR(100) NOT NULL,
    file_path TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_timestamp_attachments ON attachments;
CREATE TRIGGER set_timestamp_attachments
BEFORE UPDATE ON attachments
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 9. Verification Logs Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slip_submission_id UUID REFERENCES slip_submissions(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL CHECK (action IN ('Submit', 'Approve', 'Reject', 'RequestInfo')),
    comments TEXT,
    action_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS set_timestamp_verification_logs ON verification_logs;
CREATE TRIGGER set_timestamp_verification_logs
BEFORE UPDATE ON verification_logs
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 10. Audit Logs Table (Immutable - No Update/Delete Triggers)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID,
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_value JSONB,
    new_value JSONB,
    browser TEXT,
    device TEXT,
    ip_address VARCHAR(45)
);

--------------------------------------------------------------------------------
-- 11. Notifications Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Submission', 'Approval', 'Rejection', 'BudgetChange', 'MonthClosed')),
    is_read BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_timestamp_notifications ON notifications;
CREATE TRIGGER set_timestamp_notifications
BEFORE UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 12. Comments Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slip_submission_id UUID REFERENCES slip_submissions(id) ON DELETE CASCADE,
    commenter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_timestamp_comments ON comments;
CREATE TRIGGER set_timestamp_comments
BEFORE UPDATE ON comments
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 13. Activity Logs Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    ip_address VARCHAR(45),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS set_timestamp_activity_logs ON activity_logs;
CREATE TRIGGER set_timestamp_activity_logs
BEFORE UPDATE ON activity_logs
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- 14. Settings Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_timestamp_settings ON settings;
CREATE TRIGGER set_timestamp_settings
BEFORE UPDATE ON settings
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

--------------------------------------------------------------------------------
-- Database Indexes for Performance Optimization
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_is_deleted ON students(is_deleted);
CREATE INDEX IF NOT EXISTS idx_monthly_payment_settings_month_year ON monthly_payment_settings(month, year);
CREATE INDEX IF NOT EXISTS idx_weekly_payment_records_lookup ON weekly_payment_records(student_id, month_setting_id, week_number);
CREATE INDEX IF NOT EXISTS idx_slip_submissions_student_month ON slip_submissions(student_id, month_setting_id);
CREATE INDEX IF NOT EXISTS idx_slip_submissions_verification_status ON slip_submissions(verification_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

--------------------------------------------------------------------------------
-- Initial Data Seeding
--------------------------------------------------------------------------------
INSERT INTO roles (name) VALUES 
('Admin'),
('Finance'),
('Auditor'),
('Viewer'),
('Student')
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
('max_upload_size_mb', '5', 'Maximum slip file size in megabytes'),
('allowed_mime_types', 'image/png,image/jpeg,image/jpg,application/pdf', 'Allowed file types for payment slips'),
('school_name', 'COMED23', 'Default school name for reports')
ON CONFLICT (key) DO NOTHING;

--------------------------------------------------------------------------------
-- Supabase Row Level Security (RLS) Configuration
--------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE slip_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Simple helper functions or policy definitions for role-based access
-- For standard PHP direct connection, the app will execute with a specific database user, or direct service connection.
-- RLS policies here ensure that when accessed directly via Supabase API (e.g. from frontend) or direct claims, permissions are safe:

-- public read policies for certain metadata
DROP POLICY IF EXISTS "Public read active students" ON students;
CREATE POLICY "Public read active students" ON students 
    FOR SELECT USING (status = 'Active' AND is_deleted = false);

DROP POLICY IF EXISTS "Public read open monthly settings" ON monthly_payment_settings;
CREATE POLICY "Public read open monthly settings" ON monthly_payment_settings 
    FOR SELECT USING (status = 'Open' AND is_deleted = false);

DROP POLICY IF EXISTS "Public insert slip submissions" ON slip_submissions;
CREATE POLICY "Public insert slip submissions" ON slip_submissions 
    FOR INSERT WITH CHECK (verification_status = 'Pending');

DROP POLICY IF EXISTS "Public read slip submissions" ON slip_submissions;
CREATE POLICY "Public read slip submissions" ON slip_submissions 
    FOR SELECT USING (is_deleted = false);

DROP POLICY IF EXISTS "Public read weekly records" ON weekly_payment_records;
CREATE POLICY "Public read weekly records" ON weekly_payment_records 
    FOR SELECT USING (is_deleted = false);
