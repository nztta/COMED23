<?php
// api/helpers/auth.php

require_once __DIR__ . '/../config/supabase.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/response.php';

/**
 * Decode base64url encoding.
 */
function base64UrlDecode(string $input): string {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $padlen = 4 - $remainder;
        $input .= str_repeat('=', $padlen);
    }
    return base64_decode(strtr($input, '-_', '+/')) ?: '';
}

/**
 * Validate standard HS256 Supabase JWT token.
 * Returns decoded payload if valid, otherwise null.
 */
function verifySupabaseJWT(string $token): ?array {
    $config = getSupabaseConfig();
    $secret = $config['jwt_secret'];

    if (empty($secret)) {
        // Fallback for development if secret isn't configured
        // In development we should warn, but in production this is a hard error
        if (getenv('APP_ENV') === 'development') {
            $parts = explode('.', $token);
            if (count($parts) === 3) {
                return json_decode(base64UrlDecode($parts[1]), true);
            }
        }
        return null;
    }

    $tokenParts = explode('.', $token);
    if (count($tokenParts) !== 3) {
        return null;
    }

    $header = json_decode(base64UrlDecode($tokenParts[0]), true);
    $payload = json_decode(base64UrlDecode($tokenParts[1]), true);
    $signature = $tokenParts[2];

    if (!$header || !$payload) {
        return null;
    }

    // Assert algorithm is HS256
    if (!isset($header['alg']) || $header['alg'] !== 'HS256') {
        return null;
    }

    // Verify token expiry
    if (isset($payload['exp']) && $payload['exp'] < time()) {
        return null;
    }

    // Verify signature
    $dataToSign = $tokenParts[0] . '.' . $tokenParts[1];
    $rawSignature = hash_hmac('sha256', $dataToSign, $secret, true);
    $expectedSignature = str_replace('=', '', strtr(base64_encode($rawSignature), '+/', '-_'));

    if (hash_equals($expectedSignature, $signature)) {
        return $payload;
    }

    return null;
}

/**
 * Authenticate current request and return user data.
 * Checks the Authorization header for a Bearer token.
 */
function getCurrentUser(): ?array {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

    if (empty($authHeader) || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        return null;
    }

    $jwt = $matches[1];
    $jwtPayload = verifySupabaseJWT($jwt);

    if (!$jwtPayload || !isset($jwtPayload['sub'])) {
        return null;
    }

    $userId = $jwtPayload['sub'];
    $email = $jwtPayload['email'] ?? '';

    // Fetch user profile and role from our Postgres database
    try {
        $db = getDatabaseConnection();
        $stmt = $db->prepare("
            SELECT u.*, r.name as role_name 
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = :id AND u.status = 'Active'
        ");
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();

        if ($user) {
            return $user;
        }

        // If user doesn't exist in our table yet but has a valid JWT,
        // it means they signed up via Supabase Auth but haven't been synchronized.
        // For security, if they are not in the users table, we default to the Viewer role
        // or check if we need to auto-create them. Let's auto-create them as Viewer if not exists.
        if (getenv('APP_ENV') === 'development' || true) {
            // Fetch default role (Viewer)
            $roleStmt = $db->prepare("SELECT id FROM roles WHERE name = 'Viewer'");
            $roleStmt->execute();
            $viewerRoleId = $roleStmt->fetchColumn();

            if ($viewerRoleId) {
                $insertStmt = $db->prepare("
                    INSERT INTO users (id, email, role_id, full_name, status)
                    VALUES (:id, :email, :role_id, :full_name, 'Active')
                    ON CONFLICT (id) DO NOTHING
                ");
                $insertStmt->execute([
                    'id' => $userId,
                    'email' => $email,
                    'role_id' => $viewerRoleId,
                    'full_name' => $jwtPayload['user_metadata']['full_name'] ?? explode('@', $email)[0]
                ]);

                // Query again
                $stmt->execute(['id' => $userId]);
                return $stmt->fetch() ?: null;
            }
        }
    } catch (Exception $e) {
        return null;
    }

    return null;
}

/**
 * Enforce authentication and role permissions.
 * Halts execution with an error response if conditions are not met.
 */
function requireRole(array $allowedRoles): array {
    // Standard CORS Preflight check
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        sendResponse(200, []);
    }

    $user = getCurrentUser();

    if (!$user) {
        sendError('Unauthorized access. Valid auth token required.', 401);
    }

    if (!in_array($user['role_name'], $allowedRoles)) {
        sendError('Forbidden. Insufficient permissions.', 403);
    }

    return $user;
}
