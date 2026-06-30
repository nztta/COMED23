<?php
// api/test_env.php
require_once __DIR__ . '/helpers/dotenv.php';

header('Content-Type: application/json');
echo json_encode([
    'DB_HOST' => getenv('DB_HOST'),
    'DB_PORT' => getenv('DB_PORT'),
    'DB_NAME' => getenv('DB_NAME'),
    'DB_USER' => getenv('DB_USER'),
    // Expose password length instead of raw password for security
    'DB_PASS_LEN' => strlen(getenv('DB_PASS')),
    'SUPABASE_URL' => getenv('SUPABASE_URL'),
    'SUPABASE_ANON_KEY_LEN' => strlen(getenv('SUPABASE_ANON_KEY')),
]);
