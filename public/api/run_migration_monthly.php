<?php
// api/run_migration_monthly.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // Drop the unique constraint unique_month_year on monthly_payment_settings
    $sql = "ALTER TABLE public.monthly_payment_settings DROP CONSTRAINT IF EXISTS unique_month_year;";
    $db->exec($sql);
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully dropped unique_month_year constraint from monthly_payment_settings table.'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
