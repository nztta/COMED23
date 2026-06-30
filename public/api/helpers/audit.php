<?php
// api/helpers/audit.php

require_once __DIR__ . '/../config/database.php';

/**
 * Detect client IP Address.
 */
function getClientIpAddress(): string {
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        return $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        // Can be a comma-separated list of IPs
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Extract browser and OS details from User Agent string.
 */
function parseUserAgent(): array {
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $browser = 'Unknown';
    $device = 'Desktop';

    // Simple Browser Check
    if (preg_match('/MSIE/i', $userAgent) && !preg_match('/Opera/i', $userAgent)) {
        $browser = 'Internet Explorer';
    } elseif (preg_match('/Firefox/i', $userAgent)) {
        $browser = 'Firefox';
    } elseif (preg_match('/Chrome/i', $userAgent)) {
        $browser = 'Chrome';
    } elseif (preg_match('/Safari/i', $userAgent)) {
        $browser = 'Safari';
    } elseif (preg_match('/Opera/i', $userAgent)) {
        $browser = 'Opera';
    } elseif (preg_match('/Netscape/i', $userAgent)) {
        $browser = 'Netscape';
    } elseif (preg_match('/Edge/i', $userAgent)) {
        $browser = 'Edge';
    }

    // Simple Device Check
    if (preg_match('/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i', $userAgent)) {
        $device = 'Mobile';
    } elseif (preg_match('/ipad|playbook|silk/i', $userAgent)) {
        $device = 'Tablet';
    }

    return [
        'browser' => $browser,
        'device' => $device,
        'raw' => $userAgent
    ];
}

/**
 * Log an event to the immutable audit_logs table.
 */
function logAudit(
    ?string $userId,
    ?string $userEmail,
    string $action,
    ?string $tableName = null,
    ?string $recordId = null,
    ?array $oldValue = null,
    ?array $newValue = null
): void {
    try {
        $db = getDatabaseConnection();
        $ip = getClientIpAddress();
        $uaInfo = parseUserAgent();

        $stmt = $db->prepare("
            INSERT INTO audit_logs (
                user_id, 
                user_email, 
                action, 
                table_name, 
                record_id, 
                old_value, 
                new_value, 
                browser, 
                device, 
                ip_address
            ) VALUES (
                :user_id, 
                :user_email, 
                :action, 
                :table_name, 
                :record_id, 
                :old_value, 
                :new_value, 
                :browser, 
                :device, 
                :ip_address
            )
        ");

        $stmt->execute([
            'user_id' => $userId,
            'user_email' => $userEmail,
            'action' => $action,
            'table_name' => $tableName,
            'record_id' => $recordId,
            'old_value' => $oldValue ? json_encode($oldValue) : null,
            'new_value' => $newValue ? json_encode($newValue) : null,
            'browser' => $uaInfo['browser'],
            'device' => $uaInfo['device'],
            'ip_address' => $ip
        ]);
    } catch (Exception $e) {
        // Fail silently or log locally to system error logs, but do not block operations
        error_log("Failed to write audit log: " . $e->getMessage());
    }
}
