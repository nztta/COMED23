<?php
// api/run_migration_policy.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // 1. Create system_settings table
    $db->exec("
        CREATE TABLE IF NOT EXISTS public.system_settings (
            key VARCHAR(50) PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT NOW(),
            updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
        );
    ");

    // 2. Seed initial keys if not present
    $seedStmt = $db->prepare("INSERT INTO public.system_settings (key, value) VALUES (:key, :value) ON CONFLICT (key) DO NOTHING");
    $seedStmt->execute(['key' => 'payment_policy_enabled', 'value' => 'false']);
    $seedStmt->execute(['key' => 'payment_policy_text', 'value' => 'ฉันรับรองว่าข้อมูลการโอนเงินและสลิปนี้ถูกต้องเป็นความจริงทุกประการ']);

    // 3. Add columns to slip_submissions if not exist
    $db->exec("ALTER TABLE public.slip_submissions ADD COLUMN IF NOT EXISTS policy_accepted BOOLEAN DEFAULT FALSE;");
    $db->exec("ALTER TABLE public.slip_submissions ADD COLUMN IF NOT EXISTS policy_text_accepted TEXT DEFAULT NULL;");
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully ran consent policy database migration.'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
