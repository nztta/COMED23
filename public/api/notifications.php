<?php
// api/notifications.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// 1. Authenticate user (either student or staff/admin)
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$currentUser = getCurrentUser();

if (!$currentUser) {
    sendError('Unauthorized access. Active session required.', 401);
}

$isStudent = ($currentUser['role_name'] === 'นักศึกษา');
$isGuest = ($currentUser['role_name'] === 'Guest');
$studentId = $isStudent ? $currentUser['id'] : null;
$userId = !$isStudent && !$isGuest ? $currentUser['id'] : null;

// GET Actions
if ($method === 'GET') {
    $action = $_GET['action'] ?? 'my_notifications';

    try {
        $db = getDatabaseConnection();

        if ($action === 'my_notifications') {
            // Build query based on user type
            if ($isStudent) {
                $stmt = $db->prepare("
                    SELECT * FROM notifications 
                    WHERE is_deleted = false 
                      AND is_cancelled = false
                      AND type IN ('BudgetChange', 'Approval', 'Rejection')
                      AND (student_id = :student_id OR (student_id IS NULL AND user_id IS NULL))
                    ORDER BY created_at DESC 
                    LIMIT 50
                ");
                $stmt->execute(['student_id' => $studentId]);
            } elseif ($isGuest) {
                // Guests only see global notifications
                $stmt = $db->prepare("
                    SELECT * FROM notifications 
                    WHERE is_deleted = false 
                      AND is_cancelled = false
                      AND student_id IS NULL AND user_id IS NULL
                    ORDER BY created_at DESC 
                    LIMIT 50
                ");
                $stmt->execute();
            } else {
                // Staff see staff notifications or global notifications
                $stmt = $db->prepare("
                    SELECT * FROM notifications 
                    WHERE is_deleted = false 
                      AND is_cancelled = false
                      AND (user_id = :user_id OR (student_id IS NULL AND user_id IS NULL))
                    ORDER BY created_at DESC 
                    LIMIT 50
                ");
                $stmt->execute(['user_id' => $userId]);
            }
            $notifications = $stmt->fetchAll();
            sendSuccess($notifications);

        } elseif ($action === 'unread_count') {
            if ($isStudent) {
                $stmt = $db->prepare("
                    SELECT COUNT(*) FROM notifications 
                    WHERE is_deleted = false AND is_read = false
                      AND is_cancelled = false
                      AND type IN ('BudgetChange', 'Approval', 'Rejection')
                      AND (student_id = :student_id OR (student_id IS NULL AND user_id IS NULL))
                ");
                $stmt->execute(['student_id' => $studentId]);
            } elseif ($isGuest) {
                $stmt = $db->prepare("
                    SELECT COUNT(*) FROM notifications 
                    WHERE is_deleted = false AND is_read = false
                      AND is_cancelled = false
                      AND student_id IS NULL AND user_id IS NULL
                ");
                $stmt->execute();
            } else {
                $stmt = $db->prepare("
                    SELECT COUNT(*) FROM notifications 
                    WHERE is_deleted = false AND is_read = false
                      AND is_cancelled = false
                      AND (user_id = :user_id OR (student_id IS NULL AND user_id IS NULL))
                ");
                $stmt->execute(['user_id' => $userId]);
            }
            $count = (int)$stmt->fetchColumn();
            sendSuccess(['unread_count' => $count]);
        }
    } catch (Exception $e) {
        sendError('Failed to fetch notifications: ' . $e->getMessage(), 500);
    }
}

if ($method === 'POST') {
    $action = $_GET['action'] ?? 'mark_read';

    if ($action === 'mark_read') {
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? null;

        if (!$id) {
            sendError('Notification ID is required');
        }

        try {
            $db = getDatabaseConnection();
            $stmt = $db->prepare("
                UPDATE notifications 
                SET is_read = true, updated_at = NOW() 
                WHERE id = :id AND is_deleted = false
            ");
            $stmt->execute(['id' => $id]);
            sendSuccess(null, 'Notification marked as read');
        } catch (Exception $e) {
            sendError('Failed to update notification: ' . $e->getMessage(), 500);
        }
    } elseif ($action === 'mark_all_read') {
        try {
            $db = getDatabaseConnection();
            if ($isStudent) {
                $stmt = $db->prepare("
                    UPDATE notifications 
                    SET is_read = true, updated_at = NOW() 
                    WHERE student_id = :student_id AND is_deleted = false AND is_read = false
                ");
                $stmt->execute(['student_id' => $studentId]);
            } elseif ($isGuest) {
                // Guests don't mark global as read for all, return success
            } else {
                $stmt = $db->prepare("
                    UPDATE notifications 
                    SET is_read = true, updated_at = NOW() 
                    WHERE user_id = :user_id AND is_deleted = false AND is_read = false
                ");
                $stmt->execute(['user_id' => $userId]);
            }
            sendSuccess(null, 'All notifications marked as read');
        } catch (Exception $e) {
            sendError('Failed to mark all as read: ' . $e->getMessage(), 500);
        }
    }
}

sendError('Method not allowed', 405);
