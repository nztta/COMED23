<?php
// api/run_migration_ledger.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // 1. Create treasurer_transactions table
    $db->exec("
        CREATE TABLE IF NOT EXISTS public.treasurer_transactions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title VARCHAR(255) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
            type VARCHAR(20) NOT NULL CHECK (type IN ('Income', 'Expense')),
            person_name VARCHAR(255) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Completed' CHECK (status IN ('Pending', 'Completed')),
            month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
            year INT NOT NULL,
            is_deleted BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
            updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
        );
    ");

    // 2. Create the unified database VIEW
    $db->exec("
        CREATE OR REPLACE VIEW public.view_classroom_ledger AS
        SELECT 
            ss.id::TEXT AS id,
            'ชำระเงินค่าห้องเรียน'::VARCHAR(255) AS title,
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
        WHERE is_deleted = false;
    ");

    // 3. Clear existing data
    $db->exec("TRUNCATE TABLE public.treasurer_transactions CASCADE;");

    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully ran ledger table, view, and seed migrations.'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
