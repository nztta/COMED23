<?php
// api/run_migration.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // Add password_hash column if it does not exist
    $sql = "ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL;";
    $db->exec($sql);
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully ran migration to add password_hash column to students table.'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
