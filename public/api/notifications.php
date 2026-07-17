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
    } elseif ($action === 'notify_outstanding') {
        // Only Admin or Finance can trigger outstanding balance notifications
        $user = requireRole(['Admin', 'Finance']);
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

        $targetStudentId = $input['student_id'] ?? null;
        $isBulk = isset($input['bulk']) && $input['bulk'] === true;

        try {
            $db = getDatabaseConnection();
            $queryStr = "
                SELECT 
                    s.id,
                    s.student_id,
                    s.prefix,
                    s.full_name,
                    s.nickname,
                    COALESCE(
                        (SELECT SUM(w.amount) 
                         FROM public.weekly_payment_records w 
                         JOIN public.monthly_payment_settings m ON w.month_setting_id = m.id
                         WHERE w.student_id = s.id AND w.is_deleted = false AND m.is_deleted = false
                        ), 0
                    ) AS total_billing,
                    COALESCE(
                        (SELECT SUM(w.amount) 
                         FROM public.weekly_payment_records w
                         JOIN public.monthly_payment_settings m ON w.month_setting_id = m.id
                         WHERE w.student_id = s.id AND w.is_deleted = false AND m.is_deleted = false AND w.status = 'Verified'
                        ), 0
                    ) AS total_paid_slips,
                    COALESCE(
                        (SELECT SUM(w.amount) 
                         FROM public.weekly_payment_records w
                         JOIN public.monthly_payment_settings m ON w.month_setting_id = m.id
                         WHERE w.student_id = s.id AND w.is_deleted = false AND m.is_deleted = false AND w.status = 'Pending'
                        ), 0
                    ) AS total_pending,
                    COALESCE(
                        (SELECT SUM(CASE WHEN transaction_type = 'Adjustment' THEN amount ELSE -amount END) 
                         FROM public.payment_transactions 
                         WHERE student_id = s.id AND is_deleted = false AND transaction_type IN ('Adjustment', 'Refund')
                        ), 0
                    ) AS net_cash
                FROM public.students s
                WHERE s.status = 'Active' AND s.is_deleted = false
            ";

            if ($targetStudentId) {
                $queryStr .= " AND s.id = :student_id";
            }

            $stmt = $db->prepare($queryStr);
            if ($targetStudentId) {
                $stmt->execute(['student_id' => $targetStudentId]);
            } else {
                $stmt->execute();
            }

            $students = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $notifiedCount = 0;
            $outstandingList = [];

            $db->beginTransaction();

            $stmtNotify = $db->prepare("
                INSERT INTO public.notifications (
                    title, message, type, student_id, author_name, target_page, created_by
                ) VALUES (
                    :title, :message, :type, :student_id, :author_name, :target_page, :created_by
                )
            ");

            foreach ($students as $s) {
                $billing = (float)$s['total_billing'];
                $paid = (float)$s['total_paid_slips'];
                $pending = (float)$s['total_pending'];
                $cash = (float)$s['net_cash'];

                $outstanding = $billing - $paid - $cash - $pending;
                if ($outstanding < 0) {
                    $outstanding = 0.0;
                }

                if ($outstanding > 0.01) {
                    $notifiedCount++;
                    $studentName = ($s['prefix'] ?? '') . $s['full_name'];
                    $outstandingList[] = [
                        'student_id' => $s['student_id'],
                        'name' => $studentName,
                        'amount' => $outstanding
                    ];

                    // Create targeted inbox notification
                    $stmtNotify->execute([
                        'title' => 'แจ้งเตือนยอดค้างชำระค่าห้องเรียน',
                        'message' => "คุณมียอดค้างชำระสะสมทั้งหมด " . number_format($outstanding, 2) . " บาท โปรดเข้าสู่ระบบเพื่ออัปโหลดสลิปชำระเงินโดยเร็วที่สุด",
                        'type' => 'Rejection',
                        'student_id' => $s['id'],
                        'author_name' => $currentUser['full_name'],
                        'target_page' => 'portal.html',
                        'created_by' => $currentUser['id']
                    ]);
                }
            }

            $db->commit();

            // Send Discord notifications
            require_once __DIR__ . '/helpers/discord.php';

            if ($isBulk) {
                if (count($outstandingList) > 0) {
                    $discordMsg = "📢 **แจ้งเตือนยอดค้างชำระรวมของห้องเรียน**\n\n";
                    foreach ($outstandingList as $o) {
                        $discordMsg .= "• **{$o['name']}** ({$o['student_id']}): ค้างชำระ `{$o['amount']}` บาท\n";
                    }
                    $discordMsg .= "\nโปรดอัปโหลดสลิปชำระเงินผ่านระบบพอร์ทัลโดยเร็วที่สุดครับ";
                    sendDiscordNotification('ทวงยอดค่าห้องเรียนรายสัปดาห์ (ทุกคน)', $discordMsg, '15158332'); // Red
                } else {
                    sendDiscordNotification('ทวงยอดค่าห้องเรียนรายสัปดาห์ (ทุกคน)', '🎉 นักศึกษาทุกคนชำระเงินครบหมดแล้ว ไม่มีใครมียอดค้างชำระในระบบ!', '3066993'); // Green
                }
            } else {
                if (count($outstandingList) > 0) {
                    $o = $outstandingList[0];
                    $discordMsg = "📢 **ทวงยอดค้างชำระรายบุคคล**\n\nเรียนคุณ **{$o['name']}** ({$o['student_id']})\nคุณมียอดค้างชำระสะสมรวม `{$o['amount']}` บาท\n\nโปรดเข้าสู่ระบบเพื่ออัปโหลดสลิปชำระเงินโดยเร็วที่สุดครับ";
                    sendDiscordNotification('ทวงยอดค่าห้องเรียนรายบุคคล', $discordMsg, '15105570'); // Orange
                }
            }

            sendSuccess([
                'notified_count' => $notifiedCount
            ], 'Outstanding balance notifications sent successfully');
        } catch (Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            sendError('Failed to send outstanding notifications: ' . $e->getMessage(), 500);
        }
    }
}

sendError('Method not allowed', 405);
