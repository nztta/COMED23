<?php
// api/config/database.php

/**
 * Get PostgreSQL Database Connection using PDO.
 * Fallbacks to standard environment variables.
 */
function getDatabaseConnection(): PDO {
    // Attempt to load from env or define default values
    $host = getenv('DB_HOST') ?: 'localhost';
    $port = getenv('DB_PORT') ?: '5432';
    $dbname = getenv('DB_NAME') ?: 'postgres';
    $user = getenv('DB_USER') ?: 'postgres';
    $password = getenv('DB_PASS') ?: '';

    // If local config file exists, load it (for development ease)
    $localConfigPath = __DIR__ . '/local.config.php';
    if (file_exists($localConfigPath)) {
        $localConfig = include $localConfigPath;
        $host = $localConfig['DB_HOST'] ?? $host;
        $port = $localConfig['DB_PORT'] ?? $port;
        $dbname = $localConfig['DB_NAME'] ?? $dbname;
        $user = $localConfig['DB_USER'] ?? $user;
        $password = $localConfig['DB_PASS'] ?? $password;
    }

    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";

    try {
        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        // Send a secure 500 error response without exposing sensitive parameters
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'status' => 'error',
            'message' => 'Database connection failed. Please ensure configurations are correct.',
            'error' => $e->getMessage()
        ]);
        exit;
    }
}
