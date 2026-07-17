<?php
// api/run_migration_payment_desc.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // 1. Add description column to payment_transactions if not exists
    $db->exec("
        ALTER TABLE public.payment_transactions 
        ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ");

    // 2. Re-create the unified database VIEW to include payment_transactions
    $db->exec("
        CREATE OR REPLACE VIEW public.view_classroom_ledger AS
        -- Slip submissions (verified/pending)
        SELECT 
            ss.id::TEXT AS id,
            'ชำระเงินค่าห้องเรียน (สลิป)'::VARCHAR(255) AS title,
            ss.amount AS amount,
            'Income'::VARCHAR(20) AS type,
            s.full_name AS person_name,
            CASE 
                WHEN ss.verification_status = 'Pending' THEN 'Pending'
                WHEN ss.verification_status = 'Approved' THEN 'Completed'
                ELSE 'Completed'
            END AS status,
            EXTRACT(MONTH FROM ss.submitted_at)::INT AS month,
            EXTRACT(YEAR FROM ss.submitted_at)::INT AS year,
            ss.submitted_at AS created_at
        FROM public.slip_submissions ss
        JOIN public.students s ON ss.student_id = s.id
        WHERE ss.is_deleted = false AND ss.verification_status IN ('Pending', 'Approved')

        UNION ALL

        -- Manual treasurer transactions (income/expense)
        SELECT 
            id::TEXT AS id,
            title,
            amount,
            type,
            person_name,
            status,
            month,
            year,
            created_at
        FROM public.treasurer_transactions
        WHERE is_deleted = false

        UNION ALL

        -- Student balance adjustments / cash payments
        SELECT 
            pt.id::TEXT AS id,
            CASE 
                WHEN pt.transaction_type = 'Adjustment' THEN (COALESCE(pt.description, ''))::VARCHAR(255)
                WHEN pt.transaction_type = 'Refund' THEN ('คืนเงิน: ' || COALESCE(pt.description, ''))::VARCHAR(255)
                ELSE 'ธุรกรรมอื่นๆ'::VARCHAR(255)
            END AS title,
            pt.amount AS amount,
            CASE 
                WHEN pt.transaction_type = 'Adjustment' THEN 'Income'::VARCHAR(20)
                ELSE 'Expense'::VARCHAR(20)
            END AS type,
            s.full_name AS person_name,
            'Completed'::VARCHAR(20) AS status,
            EXTRACT(MONTH FROM pt.created_at)::INT AS month,
            EXTRACT(YEAR FROM pt.created_at)::INT AS year,
            pt.created_at AS created_at
        FROM public.payment_transactions pt
        JOIN public.students s ON pt.student_id = s.id
        WHERE pt.is_deleted = false;
    ");

    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully added description column and updated classroom ledger view.'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
