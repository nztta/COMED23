<?php
// api/auth.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// Fetch the currently authenticated user
$user = getCurrentUser();

if (!$user) {
    sendError('Unauthorized access. Session invalid or expired.', 401);
}

// Return the user credentials and active role
sendSuccess([
    'id' => $user['id'],
    'email' => $user['email'],
    'full_name' => $user['full_name'],
    'role' => $user['role_name'],
    'status' => $user['status']
]);
