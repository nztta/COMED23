<?php
// api/students.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/audit.php';
require_once __DIR__ . '/config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// 1. PUBLIC VALIDATION ACTION (No auth required)
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'validate') {
    $studentId = $_GET['student_id'] ?? '';
    $fullName = $_GET['full_name'] ?? '';

    // Validate Student ID Format: 69xxxxxxxx-x
    if (!preg_match('/^69\d{8}-\d$/', $studentId)) {
        sendError('Invalid Student ID format. Expected format: 69xxxxxxxx-x');
    }

    if (empty($fullName)) {
        sendError('Full name is required');
    }

    try {
        $db = getDatabaseConnection();
        // Case-insensitive search on name to be forgiving with spacing/casing, or exact?
        // Let's do a strict check as requested: "Name matches database." But we can trim it.
        $stmt = $db->prepare("
            SELECT id, student_id, full_name, nickname, class, academic_year 
            FROM students 
            WHERE student_id = :student_id AND LOWER(TRIM(full_name)) = LOWER(TRIM(:full_name)) AND status = 'Active' AND is_deleted = false
        ");
        $stmt->execute([
            'student_id' => $studentId,
            'full_name' => $fullName
        ]);
        $student = $stmt->fetch();

        if (!$student) {
            sendError('Student validation failed. Student ID does not exist or name does not match.', 404);
        }

        sendSuccess($student, 'Student validated successfully');
    } catch (Exception $e) {
        sendError('Validation system error: ' . $e->getMessage(), 500);
    }
}

// 2. AUTHENTICATED CRUD ACTIONS (Requires Viewer/Finance/Admin/Auditor role)
$user = requireRole(['Admin', 'Finance', 'Auditor', 'Viewer']);

if ($method === 'GET') {
    try {
        $db = getDatabaseConnection();
        $id = $_GET['id'] ?? null;

        if ($id) {
            $stmt = $db->prepare("SELECT * FROM students WHERE id = :id AND is_deleted = false");
            $stmt->execute(['id' => $id]);
            $student = $stmt->fetch();

            if (!$student) {
                sendError('Student not found', 404);
            }
            sendSuccess($student);
        } else {
            // List all active students
            $stmt = $db->prepare("SELECT * FROM students WHERE is_deleted = false ORDER BY student_id ASC");
            $stmt->execute();
            $students = $stmt->fetchAll();
            sendSuccess($students);
        }
    } catch (Exception $e) {
        sendError('Database error: ' . $e->getMessage(), 500);
    }
}

if ($method === 'POST') {
    // Only Admin or Finance can create/modify students
    $user = requireRole(['Admin', 'Finance']);
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? null;
    $studentId = $input['student_id'] ?? '';
    $fullName = $input['full_name'] ?? '';
    $nickname = $input['nickname'] ?? '';
    $class = $input['class'] ?? '';
    $academicYear = $input['academic_year'] ?? '';
    $status = $input['status'] ?? 'Active'; // 'Active', 'Inactive'

    // Validate inputs
    if (!preg_match('/^69\d{8}-\d$/', $studentId)) {
        sendError('Student ID must match format 69xxxxxxxx-x');
    }
    if (empty($fullName)) {
        sendError('Full name is required');
    }
    if (empty($class) || empty($academicYear)) {
        sendError('Class and Academic Year are required');
    }

    try {
        $db = getDatabaseConnection();
        $db->beginTransaction();

        $oldValue = null;
        $newValue = null;

        if ($id) {
            // Update Student
            $stmt = $db->prepare("SELECT * FROM students WHERE id = :id AND is_deleted = false");
            $stmt->execute(['id' => $id]);
            $oldValue = $stmt->fetch();

            if (!$oldValue) {
                $db->rollBack();
                sendError('Student not found to update', 404);
            }

            // Check if student_id is duplicate of another student
            $checkStmt = $db->prepare("SELECT id FROM students WHERE student_id = :student_id AND id <> :id AND is_deleted = false");
            $checkStmt->execute(['student_id' => $studentId, 'id' => $id]);
            if ($checkStmt->fetch()) {
                $db->rollBack();
                sendError('Student ID is already assigned to another student.');
            }

            $updateStmt = $db->prepare("
                UPDATE students 
                SET student_id = :student_id, full_name = :full_name, nickname = :nickname, 
                    class = :class, academic_year = :academic_year, status = :status, updated_by = :updated_by
                WHERE id = :id
            ");
            $updateStmt->execute([
                'id' => $id,
                'student_id' => $studentId,
                'full_name' => $fullName,
                'nickname' => $nickname,
                'class' => $class,
                'academic_year' => $academicYear,
                'status' => $status,
                'updated_by' => $user['id']
            ]);

            $newValue = [
                'id' => $id,
                'student_id' => $studentId,
                'full_name' => $fullName,
                'nickname' => $nickname,
                'class' => $class,
                'academic_year' => $academicYear,
                'status' => $status
            ];

            logAudit($user['id'], $user['email'], 'edit_student', 'students', $id, $oldValue, $newValue);

        } else {
            // Create Student
            $checkStmt = $db->prepare("SELECT id FROM students WHERE student_id = :student_id AND is_deleted = false");
            $checkStmt->execute(['student_id' => $studentId]);
            if ($checkStmt->fetch()) {
                $db->rollBack();
                sendError('Student ID already exists.');
            }

            $insertStmt = $db->prepare("
                INSERT INTO students (student_id, full_name, nickname, class, academic_year, status, created_by, updated_by)
                VALUES (:student_id, :full_name, :nickname, :class, :academic_year, :status, :created_by, :updated_by)
                RETURNING id
            ");
            $insertStmt->execute([
                'student_id' => $studentId,
                'full_name' => $fullName,
                'nickname' => $nickname,
                'class' => $class,
                'academic_year' => $academicYear,
                'status' => $status,
                'created_by' => $user['id'],
                'updated_by' => $user['id']
            ]);

            $id = $insertStmt->fetchColumn();

            // Populate weekly_payment_records for this student for all existing open monthly settings
            $settingsStmt = $db->prepare("SELECT id, weekly_fee, number_of_weeks FROM monthly_payment_settings WHERE status = 'Open' AND is_deleted = false");
            $settingsStmt->execute();
            $openSettings = $settingsStmt->fetchAll();

            $recordInsert = $db->prepare("
                INSERT INTO weekly_payment_records (
                    student_id, month_setting_id, week_number, status, amount, created_by, updated_by
                ) VALUES (
                    :student_id, :setting_id, :week_number, 'Unpaid', :amount, :created_by, :updated_by
                )
            ");

            foreach ($openSettings as $setting) {
                for ($week = 1; $week <= (int)$setting['number_of_weeks']; $week++) {
                    $recordInsert->execute([
                        'student_id' => $id,
                        'setting_id' => $setting['id'],
                        'week_number' => $week,
                        'amount' => $setting['weekly_fee'],
                        'created_by' => $user['id'],
                        'updated_by' => $user['id']
                    ]);
                }
            }

            $newValue = [
                'id' => $id,
                'student_id' => $studentId,
                'full_name' => $fullName,
                'nickname' => $nickname,
                'class' => $class,
                'academic_year' => $academicYear,
                'status' => $status
            ];

            logAudit($user['id'], $user['email'], 'create_student', 'students', $id, null, $newValue);
        }

        $db->commit();
        sendSuccess(['id' => $id], 'Student saved successfully');
    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) {
            $db->rollBack();
        }
        sendError('Failed to save student: ' . $e->getMessage(), 500);
    }
}

if ($method === 'DELETE') {
    // Only Admin or Finance can delete
    $user = requireRole(['Admin', 'Finance']);
    $id = $_GET['id'] ?? null;

    if (!$id) {
        sendError('Student ID is required');
    }

    try {
        $db = getDatabaseConnection();
        $db->beginTransaction();

        $stmt = $db->prepare("SELECT * FROM students WHERE id = :id AND is_deleted = false");
        $stmt->execute(['id' => $id]);
        $student = $stmt->fetch();

        if (!$student) {
            $db->rollBack();
            sendError('Student not found', 404);
        }

        // Soft delete student
        $deleteStmt = $db->prepare("UPDATE students SET is_deleted = true, updated_by = :updated_by WHERE id = :id");
        $deleteStmt->execute(['id' => $id, 'updated_by' => $user['id']]);

        // Soft delete their payment records
        $deleteRecordsStmt = $db->prepare("UPDATE weekly_payment_records SET is_deleted = true, updated_by = :updated_by WHERE student_id = :student_id");
        $deleteRecordsStmt->execute(['student_id' => $id, 'updated_by' => $user['id']]);

        logAudit($user['id'], $user['email'], 'delete_student', 'students', $id, $student, ['is_deleted' => true]);

        $db->commit();
        sendSuccess(null, 'Student deleted successfully');
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendError('Failed to delete student: ' . $e->getMessage(), 500);
    }
}

sendError('Method not allowed', 405);
