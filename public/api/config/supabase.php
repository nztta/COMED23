<?php
// api/config/supabase.php

/**
 * Returns configuration settings for Supabase integration.
 */
function getSupabaseConfig(): array {
    $url = getenv('SUPABASE_URL') ?: '';
    $anonKey = getenv('SUPABASE_ANON_KEY') ?: '';
    $jwtSecret = getenv('SUPABASE_JWT_SECRET') ?: '';
    $storageBucket = getenv('SUPABASE_STORAGE_BUCKET') ?: 'slips';

    // Load from local config if present
    $localConfigPath = __DIR__ . '/local.config.php';
    if (file_exists($localConfigPath)) {
        $localConfig = include $localConfigPath;
        $url = $localConfig['SUPABASE_URL'] ?? $url;
        $anonKey = $localConfig['SUPABASE_ANON_KEY'] ?? $anonKey;
        $jwtSecret = $localConfig['SUPABASE_JWT_SECRET'] ?? $jwtSecret;
        $storageBucket = $localConfig['SUPABASE_STORAGE_BUCKET'] ?? $storageBucket;
    }

    return [
        'url' => rtrim($url, '/'),
        'anon_key' => $anonKey,
        'jwt_secret' => $jwtSecret,
        'storage_bucket' => $storageBucket,
    ];
}
