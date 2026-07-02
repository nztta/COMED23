<?php
// api/config/local.config.php
// Configuration loaded dynamically from the root .env file.

require_once __DIR__ . '/../helpers/dotenv.php';

return [
    // PostgreSQL Database Configuration
    'DB_HOST' => getenv('DB_HOST'),
    'DB_PORT' => getenv('DB_PORT'),
    'DB_NAME' => getenv('DB_NAME'),
    'DB_USER' => getenv('DB_USER'),
    'DB_PASS' => getenv('DB_PASS'),

    // Supabase Credentials
    'SUPABASE_URL' => getenv('SUPABASE_URL'),
    'SUPABASE_ANON_KEY' => getenv('SUPABASE_ANON_KEY'),
    'SUPABASE_JWT_SECRET' => getenv('SUPABASE_JWT_SECRET'),
    'SUPABASE_STORAGE_BUCKET' => getenv('SUPABASE_STORAGE_BUCKET'),

    // Cloudinary Credentials
    'CLOUDINARY_URL' => getenv('CLOUDINARY_URL'),
    'CLOUDINARY_CLOUD_NAME' => getenv('CLOUDINARY_CLOUD_NAME'),
    'CLOUDINARY_API_KEY' => getenv('CLOUDINARY_API_KEY'),
    'CLOUDINARY_API_SECRET' => getenv('CLOUDINARY_API_SECRET'),
];
