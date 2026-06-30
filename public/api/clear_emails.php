<?php
// api/clear_emails.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // Clear all email values in the students table
    $db->exec("UPDATE public.students SET email = NULL;");
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully cleared all emails in the students table (set to NULL).'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
