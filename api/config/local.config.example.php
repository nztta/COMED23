<?php
// api/config/local.config.example.php
// Copy this file to local.config.php and update values for your environment.

return [
    // PostgreSQL Database Configuration
    'DB_HOST' => 'db.xxxx.supabase.co',
    'DB_PORT' => '5432',
    'DB_NAME' => 'postgres',
    'DB_USER' => 'postgres',
    'DB_PASS' => 'your_db_password_here',

    // Supabase Credentials
    'SUPABASE_URL' => 'https://xxxx.supabase.co',
    'SUPABASE_ANON_KEY' => 'your_supabase_anon_key_here',
    'SUPABASE_JWT_SECRET' => 'your_supabase_jwt_secret_here', // Used to verify Supabase Auth JWT tokens in PHP
    'SUPABASE_STORAGE_BUCKET' => 'slips',
];
