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

    // Verify token expiry locally first to avoid unnecessary network calls
    if (isset($payload['exp']) && $payload['exp'] < time()) {
        return null;
    }

    // 1. Try local HS256 signature verification if the token uses HS256
    if (isset($header['alg']) && $header['alg'] === 'HS256' && !empty($secret)) {
        $dataToSign = $tokenParts[0] . '.' . $tokenParts[1];
        $rawSignature = hash_hmac('sha256', $dataToSign, $secret, true);
        $expectedSignature = str_replace('=', '', strtr(base64_encode($rawSignature), '+/', '-_'));
        if (hash_equals($expectedSignature, $signature)) {
            return $payload;
        }
    }

    // 2. Fallback for ES256/RS256: Validate using Supabase Auth API
    // Check session cache to avoid redundant API requests
    if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
        session_start();
    }
    if (isset($_SESSION['verified_jwt_tokens'][$token])) {
        return $_SESSION['verified_jwt_tokens'][$token];
    }

    // Call Supabase /auth/v1/user endpoint to verify token validity
    $userUrl = $config['url'] . '/auth/v1/user';
    $ch = curl_init($userUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $config['anon_key'],
        'Authorization: Bearer ' . $token
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5); // 5 seconds timeout limit

    $res = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        $_SESSION['verified_jwt_tokens'][$token] = $payload;
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
        // Fallback to PHP Session for students and guests
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        if (isset($_SESSION['student_id'])) {
            try {
                $db = getDatabaseConnection();
                $stmt = $db->prepare("
                    SELECT *, COALESCE(role, 'นักศึกษา') as role_name 
                    FROM students 
                    WHERE id = :id AND status = 'Active' AND is_deleted = false
                ");
                $stmt->execute(['id' => $_SESSION['student_id']]);
                $student = $stmt->fetch();
                if ($student) {
                    $student['role_name'] = $student['role_name'] ?? 'นักศึกษา';
                    unset($student['password_hash']); // Strip password hash for safety
                    return $student;
                }
            } catch (Exception $e) {
                return null;
            }
        }
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
        // For security, if they are not in the users table, we default to the 'นักศึกษา' (Student) role
        // or check if we need to auto-create them. Let's auto-create them as 'นักศึกษา' if not exists.
        if (getenv('APP_ENV') === 'development' || true) {
            // Fetch default role prioritizing 'นักศึกษา', then 'Student', and fallback to 'Viewer'
            $roleStmt = $db->prepare("
                SELECT id FROM roles 
                WHERE name = 'นักศึกษา' OR name = 'Student' OR name = 'Viewer' 
                ORDER BY CASE name 
                    WHEN 'นักศึกษา' THEN 1 
                    WHEN 'Student' THEN 2 
                    ELSE 3 
                END LIMIT 1
            ");
            $roleStmt->execute();
            $defaultRoleId = $roleStmt->fetchColumn();

            if ($defaultRoleId) {
                $insertStmt = $db->prepare("
                    INSERT INTO users (id, email, role_id, full_name, status)
                    VALUES (:id, :email, :role_id, :full_name, 'Active')
                    ON CONFLICT (id) DO NOTHING
                ");
                $insertStmt->execute([
                    'id' => $userId,
                    'email' => $email,
                    'role_id' => $defaultRoleId,
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
 * Helper to check role permission including Thai mapped roles
 */
function checkRolePermission(string $userRole, array $allowedRoles): bool {
    $expanded = [];
    foreach ($allowedRoles as $role) {
        $expanded[] = $role;
        if ($role === 'Admin') {
            $expanded[] = 'ฝ่ายจัดการระบบ';
            $expanded[] = 'หัวหน้า';
        } elseif ($role === 'Finance') {
            $expanded[] = 'เหรัญญิก';
            $expanded[] = 'เลขานุการ';
        } elseif ($role === 'Auditor') {
            $expanded[] = 'รองหัวหน้า';
        } elseif ($role === 'Student') {
            $expanded[] = 'นักศึกษา';
        }
    }
    return in_array($userRole, $expanded);
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

    if (!checkRolePermission($user['role_name'], $allowedRoles)) {
        sendError('Forbidden. Insufficient permissions.', 403);
    }

    return $user;
}

