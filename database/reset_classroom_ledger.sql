-- Migration: Reset Classroom Ledger and Financial Data completely
-- This script wipes all transaction, slip, billing, and ledger data to start fresh.
-- WARNING: This is destructive. Back up your database before running this script.

BEGIN;

-- 1. Clear weekly payment records (individual student weekly bill states)
DELETE FROM public.weekly_payment_records;

-- 2. Clear payment transactions (individual student cash adjustments / refunds)
DELETE FROM public.payment_transactions;

-- 3. Clear slip submissions (uploaded slips. Cascade deletes attachments, verification_logs, and comments)
DELETE FROM public.slip_submissions;

-- 4. Clear monthly payment settings (bill configurations / months defined)
DELETE FROM public.monthly_payment_settings;

-- 5. Clear general classroom ledger (treasurer manual income/expense transactions)
DELETE FROM public.treasurer_transactions;

-- 6. Clear notifications (history of budget, billing, or submission alerts)
DELETE FROM public.notifications;

COMMIT;
