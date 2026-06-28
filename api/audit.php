<?php
// api/audit.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// Strictly authenticate users to Auditor or Admin roles
$user = requireRole(['Admin', 'Auditor']);

if ($method === 'GET') {
    try {
        $db = getDatabaseConnection();

        // Optional query parameters for filtering/paging
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
        $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
        $actionFilter = $_GET['action'] ?? '';
        $emailFilter = $_GET['email'] ?? '';

        $query = "SELECT * FROM audit_logs WHERE 1=1";
        $params = [];

        if (!empty($actionFilter)) {
            $query .= " AND action = :action";
            $params['action'] = $actionFilter;
        }

        if (!empty($emailFilter)) {
            $query .= " AND user_email ILIKE :email";
            $params['email'] = '%' . $emailFilter . '%';
        }

        $query .= " ORDER BY timestamp DESC LIMIT :limit OFFSET :offset";
        
        $stmt = $db->prepare($query);
        
        // Bind parameters safely
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue('offset', $offset, PDO::PARAM_INT);

        $stmt->execute();
        $logs = $stmt->fetchAll();

        // Convert JSONB columns to decoded values for ease of JSON rendering
        foreach ($logs as &$log) {
            $log['old_value'] = $log['old_value'] ? json_decode($log['old_value'], true) : null;
            $log['new_value'] = $log['new_value'] ? json_decode($log['new_value'], true) : null;
        }

        sendSuccess($logs);
    } catch (Exception $e) {
        sendError('Failed to fetch audit logs: ' . $e->getMessage(), 500);
    }
}

sendError('Method not allowed', 405);
