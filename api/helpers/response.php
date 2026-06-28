<?php
// api/helpers/response.php

/**
 * Enable CORS and JSON output formatting.
 */
function sendResponse(int $statusCode, array $payload): void {
    // Send CORS headers
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
    header("Content-Type: application/json; charset=UTF-8");

    // Handle OPTIONS request pre-flight
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }

    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

/**
 * Send a success response.
 */
function sendSuccess($data = null, string $message = 'Success', int $statusCode = 200): void {
    sendResponse($statusCode, [
        'status' => 'success',
        'message' => $message,
        'data' => $data
    ]);
}

/**
 * Send an error response.
 */
function sendError(string $message, int $statusCode = 400, $errors = null): void {
    sendResponse($statusCode, [
        'status' => 'error',
        'message' => $message,
        'errors' => $errors
    ]);
}
