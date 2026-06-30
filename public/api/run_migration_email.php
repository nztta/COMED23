<?php
// api/run_migration_email.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // 1. Add email column to students table if not exists
    $db->exec("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT NULL;");
    
    // 2. Populate default emails for existing rows where email is null
    $db->exec("UPDATE public.students SET email = REPLACE(student_id, '-', '') || '@kkumail.com' WHERE email IS NULL;");
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully ran migration to add and populate email column in students table.'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
