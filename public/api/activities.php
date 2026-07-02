<?php
// api/activities.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/audit.php';
require_once __DIR__ . '/config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// 1. Authenticate user
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$currentUser = getCurrentUser();
if (!$currentUser) {
    sendError('Unauthorized access. Active session required.', 401);
}

$isStudent = ($currentUser['role_name'] === 'นักศึกษา');

// GET Actions
if ($method === 'GET') {
    $action = $_GET['action'] ?? 'my_attendance';

    try {
        $db = getDatabaseConnection();

        if ($action === 'my_attendance') {
            // Students only see their own attendance
            if (!$isStudent) {
                sendError('Forbidden. Students only.', 403);
            }
            
            $stmt = $db->prepare("
                SELECT aa.id, a.name as activity_name, aa.checked_in_at, u.full_name as checked_in_by_name
                FROM public.activity_attendance aa
                JOIN public.activities a ON aa.activity_id = a.id
                LEFT JOIN public.users u ON aa.checked_in_by = u.id
                WHERE aa.student_id = :student_uuid
                ORDER BY aa.checked_in_at DESC
            ");
            $stmt->execute(['student_uuid' => $currentUser['id']]);
            $attendance = $stmt->fetchAll();
            sendSuccess($attendance);

        } elseif ($action === 'list_activities') {
            // Staff/Admin see list of all activities with attendance counts
            requireRole(['Admin', 'Finance', 'Auditor']);

            $stmt = $db->query("
                SELECT a.*, COUNT(aa.id) as attendance_count, u.full_name as created_by_name
                FROM public.activities a
                LEFT JOIN public.activity_attendance aa ON a.id = aa.activity_id
                LEFT JOIN public.users u ON a.created_by = u.id
                GROUP BY a.id, u.full_name
                ORDER BY a.created_at DESC
            ");
            $activities = $stmt->fetchAll();
            sendSuccess($activities);

        } elseif ($action === 'list_attendance') {
            // Staff see attendance for a specific activity
            requireRole(['Admin', 'Finance', 'Auditor']);
            
            $activityId = $_GET['activity_id'] ?? '';
            if (empty($activityId)) {
                sendError('Activity ID is required');
            }

            $stmt = $db->prepare("
                SELECT aa.id, aa.checked_in_at, 
                       s.student_id, s.full_name as student_name, s.class as student_class, s.academic_year,
                       u.full_name as checked_in_by_name
                FROM public.activity_attendance aa
                JOIN public.students s ON aa.student_id = s.id
                LEFT JOIN public.users u ON aa.checked_in_by = u.id
                WHERE aa.activity_id = :activity_id
                ORDER BY aa.checked_in_at DESC
            ");
            $stmt->execute(['activity_id' => $activityId]);
            $list = $stmt->fetchAll();
            sendSuccess($list);
        }
    } catch (Exception $e) {
        sendError('Failed to fetch activities data: ' . $e->getMessage(), 500);
    }
}

// POST Actions
if ($method === 'POST') {
    $action = $_GET['action'] ?? 'check_in';

    try {
        $db = getDatabaseConnection();

        if ($action === 'create_activity') {
            $staffUser = requireRole(['Admin', 'Finance', 'Auditor']);
            $input = json_decode(file_get_contents('php://input'), true);

            $name = $input['name'] ?? null;
            $start = !empty($input['check_in_start']) ? $input['check_in_start'] : null;
            $end = !empty($input['check_in_end']) ? $input['check_in_end'] : null;
            $status = $input['status'] ?? 'Open';

            if (empty($name)) {
                sendError('ชื่อกิจกรรมจำเป็นต้องกรอก');
            }

            // Check duplicate name
            $dupStmt = $db->prepare("SELECT COUNT(*) FROM public.activities WHERE name = :name");
            $dupStmt->execute(['name' => $name]);
            if ((int)$dupStmt->fetchColumn() > 0) {
                sendError('มีกิจกรรมชื่อนี้ในระบบแล้ว');
            }

            $stmt = $db->prepare("
                INSERT INTO public.activities (name, status, check_in_start, check_in_end, created_by)
                VALUES (:name, :status, :start, :end, :created_by)
                RETURNING id
            ");
            $stmt->execute([
                'name' => $name,
                'status' => $status,
                'start' => $start,
                'end' => $end,
                'created_by' => $staffUser['id']
            ]);
            $newId = $stmt->fetchColumn();

            logAudit($staffUser['id'], $staffUser['email'], 'create_activity', 'activities', $newId, null, $input);
            sendSuccess(['id' => $newId], 'สร้างกิจกรรมสำเร็จ');

        } elseif ($action === 'toggle_activity_status') {
            $staffUser = requireRole(['Admin', 'Finance', 'Auditor']);
            $input = json_decode(file_get_contents('php://input'), true);
            $activityId = $input['activity_id'] ?? null;

            if (!$activityId) {
                sendError('Activity ID is required');
            }

            // Fetch current status
            $stmt = $db->prepare("SELECT status, name FROM public.activities WHERE id = :id");
            $stmt->execute(['id' => $activityId]);
            $act = $stmt->fetch();
            if (!$act) {
                sendError('ไม่พบกิจกรรมที่ระบุ', 404);
            }

            $newStatus = ($act['status'] === 'Open') ? 'Closed' : 'Open';

            $update = $db->prepare("UPDATE public.activities SET status = :status WHERE id = :id");
            $update->execute(['status' => $newStatus, 'id' => $activityId]);

            logAudit($staffUser['id'], $staffUser['email'], 'toggle_activity_status', 'activities', $activityId, ['status' => $act['status']], ['new_status' => $newStatus, 'name' => $act['name']]);
            sendSuccess(['status' => $newStatus], 'ปรับสถานะกิจกรรมสำเร็จ');

        } elseif ($action === 'delete_activity') {
            $staffUser = requireRole(['Admin', 'Finance', 'Auditor']);
            $input = json_decode(file_get_contents('php://input'), true);
            $activityId = $input['activity_id'] ?? null;

            if (!$activityId) {
                sendError('Activity ID is required');
            }

            $stmt = $db->prepare("SELECT name FROM public.activities WHERE id = :id");
            $stmt->execute(['id' => $activityId]);
            $actName = $stmt->fetchColumn();
            if (!$actName) {
                sendError('ไม่พบกิจกรรมที่ระบุ', 404);
            }

            // Delete check-in records first to avoid foreign key constraints violation
            $delAttendance = $db->prepare("DELETE FROM public.activity_attendance WHERE activity_id = :id");
            $delAttendance->execute(['id' => $activityId]);

            $del = $db->prepare("DELETE FROM public.activities WHERE id = :id");
            $del->execute(['id' => $activityId]);

            logAudit($staffUser['id'], $staffUser['email'], 'delete_activity', 'activities', $activityId, null, ['name' => $actName]);
            sendSuccess([], 'ลบกิจกรรมสำเร็จ');

        } elseif ($action === 'check_in') {
            $staffUser = requireRole(['Admin', 'Finance', 'Auditor']);
            $input = json_decode(file_get_contents('php://input'), true);

            $studentId = $input['student_id'] ?? null; // text student_id e.g. 693050386-7
            $activityId = $input['activity_id'] ?? null; // UUID of activity

            if (!$studentId || !$activityId) {
                sendError('Student ID and Activity ID are required');
            }

            // 1. Resolve student UUID from text student_id
            $studentStmt = $db->prepare("
                SELECT id, full_name, class, academic_year 
                FROM public.students 
                WHERE student_id = :student_id AND status = 'Active' AND is_deleted = false
            ");
            $studentStmt->execute(['student_id' => $studentId]);
            $student = $studentStmt->fetch();

            if (!$student) {
                sendError('ไม่พบข้อมูลนักศึกษา หรือนักศึกษาไม่มีสถานะปกติในระบบ', 404);
            }

            $studentUuid = $student['id'];

            // 2. Fetch Activity Config
            $actStmt = $db->prepare("SELECT name, status, check_in_start, check_in_end FROM public.activities WHERE id = :id");
            $actStmt->execute(['id' => $activityId]);
            $activity = $actStmt->fetch();

            if (!$activity) {
                sendError('ไม่พบกิจกรรมที่ระบุในระบบ', 404);
            }

            // 3. Validate Status and Time Limits
            if ($activity['status'] !== 'Open') {
                sendError("กิจกรรม '{$activity['name']}' ได้ถูกปิดการเช็คชื่อแล้ว", 400);
            }

            $now = time();
            if (!empty($activity['check_in_start']) && strtotime($activity['check_in_start']) > $now) {
                sendError("กิจกรรม '{$activity['name']}' ยังไม่ถึงเวลาเริ่มเช็คชื่อ", 400);
            }
            if (!empty($activity['check_in_end']) && strtotime($activity['check_in_end']) < $now) {
                sendError("กิจกรรม '{$activity['name']}' ได้สิ้นสุดเวลาเช็คชื่อแล้ว", 400);
            }

            // 4. Check if already checked in
            $checkStmt = $db->prepare("
                SELECT COUNT(*) FROM public.activity_attendance 
                WHERE student_id = :student_uuid AND activity_id = :activity_id
            ");
            $checkStmt->execute([
                'student_uuid' => $studentUuid,
                'activity_id' => $activityId
            ]);
            if ((int)$checkStmt->fetchColumn() > 0) {
                sendError("นักศึกษา '{$student['full_name']}' ได้รับการเช็คชื่อในกิจกรรมนี้ไปแล้ว", 409);
            }

            // 5. Insert attendance record
            $insertStmt = $db->prepare("
                INSERT INTO public.activity_attendance (student_id, activity_id, checked_in_by)
                VALUES (:student_uuid, :activity_id, :checked_by)
            ");
            $insertStmt->execute([
                'student_uuid' => $studentUuid,
                'activity_id' => $activityId,
                'checked_by' => $staffUser['id']
            ]);

            // 6. Log Audit
            logAudit(
                $staffUser['id'],
                $staffUser['email'],
                'activity_check_in',
                'activity_attendance',
                $studentUuid,
                null,
                ['activity_id' => $activityId, 'activity_name' => $activity['name'], 'student_id' => $studentId, 'student_name' => $student['full_name']]
            );

            sendSuccess([
                'student_id' => $studentId,
                'student_name' => $student['full_name'],
                'student_class' => $student['class'],
                'checked_in_at' => date('Y-m-d H:i:s'),
                'checked_in_by_name' => $staffUser['full_name']
            ], 'เช็คชื่อกิจกรรมสำเร็จ');
        }
    } catch (Exception $e) {
        sendError('API error occurred: ' . $e->getMessage(), 500);
    }
}

sendError('Method not allowed', 405);
