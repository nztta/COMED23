<?php
// api/helpers/dotenv.php

/**
 * Simple, zero-dependency .env loader for PHP
 */
function loadDotEnv() {
    $envPath = __DIR__ . '/../../.env';
    if (!file_exists($envPath)) {
        return;
    }

    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        // Skip comments
        if (strpos($line, '#') === 0 || empty($line)) {
            continue;
        }

        // Check if contains '='
        if (strpos($line, '=') === false) {
            continue;
        }

        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);

        // Remove quotes if present
        if (preg_match('/^"(.*)"$/', $value, $matches)) {
            $value = $matches[1];
        } elseif (preg_match('/^\'(.*)\'$/', $value, $matches)) {
            $value = $matches[1];
        }

        // Unescape quotes and newlines
        $value = str_replace(['\\"', '\\\'', '\\n'], ['"', "'", "\n"], $value);

        // Populate $_ENV, $_SERVER and putenv
        if (!empty($key)) {
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}

// Automatically load on include/require
loadDotEnv();
