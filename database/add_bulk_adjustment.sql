-- Migration: Add 20 Baht adjustment to all students
-- Run this script in the Supabase SQL Editor to execute the migration.

-- Start a transaction
BEGIN;

-- Insert a 20.00 Baht transaction of type 'Adjustment' for all students
INSERT INTO payment_transactions (student_id, amount, transaction_type)
SELECT id, 20.00, 'Adjustment'
FROM students;

-- Output the total number of students who were processed/updated
SELECT COUNT(*) AS total_students_updated FROM students;

-- Commit the transaction
COMMIT;
