<?php
// api/config/cloudinary.php

/**
 * Returns configuration settings for Cloudinary integration.
 */
function getCloudinaryConfig(): array {
    $url = getenv('CLOUDINARY_URL') ?: '';
    $cloudName = getenv('CLOUDINARY_CLOUD_NAME') ?: '';
    $apiKey = getenv('CLOUDINARY_API_KEY') ?: '';
    $apiSecret = getenv('CLOUDINARY_API_SECRET') ?: '';

    // Load from local config if present
    $localConfigPath = __DIR__ . '/local.config.php';
    if (file_exists($localConfigPath)) {
        $localConfig = include $localConfigPath;
        $url = $localConfig['CLOUDINARY_URL'] ?? $url;
        $cloudName = $localConfig['CLOUDINARY_CLOUD_NAME'] ?? $cloudName;
        $apiKey = $localConfig['CLOUDINARY_API_KEY'] ?? $apiKey;
        $apiSecret = $localConfig['CLOUDINARY_API_SECRET'] ?? $apiSecret;
    }

    return [
        'url' => $url,
        'cloud_name' => $cloudName,
        'api_key' => $apiKey,
        'api_secret' => $apiSecret,
    ];
}
