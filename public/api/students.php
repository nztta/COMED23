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
    $password = $_GET['password'] ?? '';

    // Validate Student ID Format: 69xxxxxxx-x
    if (!preg_match('/^69\d{7}-\d$/', $studentId)) {
        sendError('Invalid Student ID format. Expected format: 69xxxxxxx-x');
    }

    if (empty($password)) {
        sendError('Password is required');
    }

    try {
        $db = getDatabaseConnection();
        $stmt = $db->prepare("
            SELECT id, student_id, prefix, full_name, nickname, class, academic_year, email, password_hash, english_first_name, english_last_name, english_nickname, age 
            FROM students 
            WHERE student_id = :student_id 
              AND status = 'Active' AND is_deleted = false
        ");
        $stmt->execute([
            'student_id' => $studentId
        ]);
        $student = $stmt->fetch();

        if (!$student) {
            sendError('รหัสประจำตัวนักศึกษาหรือรหัสผ่านไม่ถูกต้อง', 404);
        }

        // Verify password (default to student_id if password_hash is not set)
        $isValid = false;
        $isDefault = false;
        if (is_null($student['password_hash']) || $student['password_hash'] === '') {
            $isValid = ($password === $student['student_id']);
            $isDefault = true;
        } else {
            $isValid = password_verify($password, $student['password_hash']);
        }

        if (!$isValid) {
            sendError('รหัสประจำตัวนักศึกษาหรือรหัสผ่านไม่ถูกต้อง', 401);
        }

        // If default password is used, automatically hash it for security
        if ($isValid && $isDefault) {
            $newHash = password_hash($password, PASSWORD_DEFAULT);
            $updateStmt = $db->prepare("UPDATE students SET password_hash = :hash, updated_at = NOW() WHERE id = :id");
            $updateStmt->execute(['hash' => $newHash, 'id' => $student['id']]);
        }

        // Start student PHP session
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        $_SESSION['student_id'] = $student['id'];
        $_SESSION['student_code'] = $student['student_id'];
        $_SESSION['student_name'] = $student['full_name'];
        $_SESSION['student_email'] = $student['email'];
        $_SESSION['role'] = 'นักศึกษา';

        // Combine prefix and full_name for backward compatibility in frontend display
        $student['full_name'] = ($student['prefix'] ? $student['prefix'] : '') . $student['full_name'];
        unset($student['password_hash']); // strip hash for safety

        sendSuccess($student, 'Student validated successfully');
    } catch (Exception $e) {
        sendError('Validation system error: ' . $e->getMessage(), 500);
    }
}



// 1.3. UPDATE PROFILE DETAILS ACTION (Requires student session)
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update_profile') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (!isset($_SESSION['student_id'])) {
        sendError('กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูลโปรไฟล์', 401);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $email = trim($input['email'] ?? '');
    $nickname = trim($input['nickname'] ?? '');
    $engFirstName = trim($input['english_first_name'] ?? '');
    $engLastName = trim($input['english_last_name'] ?? '');
    $engNickname = trim($input['english_nickname'] ?? '');
    $age = isset($input['age']) ? intval($input['age']) : null;

    try {
        $db = getDatabaseConnection();
        $stmt = $db->prepare("
            UPDATE students 
            SET email = :email,
                nickname = :nickname,
                english_first_name = :eng_first, 
                english_last_name = :eng_last, 
                english_nickname = :eng_nick, 
                age = :age, 
                updated_at = NOW() 
            WHERE id = :id AND is_deleted = false
        ");
        $stmt->execute([
            'email' => $email ?: null,
            'nickname' => $nickname ?: null,
            'eng_first' => $engFirstName ?: null,
            'eng_last' => $engLastName ?: null,
            'eng_nick' => $engNickname ?: null,
            'age' => $age ?: null,
            'id' => $_SESSION['student_id']
        ]);

        // Fetch updated profile
        $stmtProfile = $db->prepare("
            SELECT id, student_id, prefix, full_name, nickname, class, academic_year, email, 
                   english_first_name, english_last_name, english_nickname, age 
            FROM students 
            WHERE id = :id
        ");
        $stmtProfile->execute(['id' => $_SESSION['student_id']]);
        $profile = $stmtProfile->fetch();

        sendSuccess($profile, 'อัปเดตประวัติส่วนตัวสำเร็จ');
    } catch (Exception $e) {
        sendError('ระบบเกิดข้อผิดพลาดในการบันทึกข้อมูล: ' . $e->getMessage(), 500);
    }
}

// 1.4. GET ALL ACTIVE STUDENTS ACTION (Public / Guest Accessible)
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'get_all_active') {
    try {
        $db = getDatabaseConnection();
        $stmt = $db->prepare("
            SELECT id, student_id, full_name, nickname, class, academic_year,
                   english_first_name, english_last_name, english_nickname, age, email
            FROM students 
            WHERE status = 'Active' AND is_deleted = false 
            ORDER BY student_id ASC
        ");
        $stmt->execute();
        $students = $stmt->fetchAll();
        sendSuccess($students, 'Active students fetched successfully');
    } catch (Exception $e) {
        sendError('Failed to fetch active students: ' . $e->getMessage(), 500);
    }
}

// 1.45. UPDATE EMAIL ACTION
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update_email') {
    $input = json_decode(file_get_contents('php://input'), true);
    $studentId = $input['student_id'] ?? '';
    $email = $input['email'] ?? '';

    if (empty($studentId) || empty($email)) {
        sendError('รหัสนักศึกษาและอีเมล จำเป็นต้องระบุข้อมูล');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('รูปแบบที่อยู่อีเมลไม่ถูกต้อง');
    }

    try {
        $db = getDatabaseConnection();
        // Check if student exists
        $stmt = $db->prepare("SELECT id FROM students WHERE student_id = :student_id AND is_deleted = false");
        $stmt->execute(['student_id' => $studentId]);
        if (!$stmt->fetch()) {
            sendError('ไม่พบรหัสประจำตัวนักศึกษานี้ในระบบ', 404);
        }

        // Update email
        $updateStmt = $db->prepare("UPDATE students SET email = :email, updated_at = NOW() WHERE student_id = :student_id RETURNING *");
        $updateStmt->execute([
            'email' => $email,
            'student_id' => $studentId
        ]);
        $updatedStudent = $updateStmt->fetch(PDO::FETCH_ASSOC);
        
        // Strip sensitive info
        unset($updatedStudent['password_hash']);
        $updatedStudent['full_name'] = ($updatedStudent['prefix'] ? $updatedStudent['prefix'] : '') . $updatedStudent['full_name'];

        sendSuccess($updatedStudent, 'บันทึกข้อมูลอีเมลเรียบร้อยแล้ว');
    } catch (Exception $e) {
        sendError('ระบบเกิดข้อผิดพลาดในการบันทึกข้อมูล: ' . $e->getMessage(), 500);
    }
}

// 1.5. CHANGE PASSWORD ACTION (Public but requires old password validation)
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'change_password') {
    // Read JSON body
    $input = json_decode(file_get_contents('php://input'), true);
    $studentId = $input['student_id'] ?? '';
    $oldPassword = $input['old_password'] ?? '';
    $newPassword = $input['new_password'] ?? '';

    if (empty($studentId) || empty($oldPassword) || empty($newPassword)) {
        sendError('รหัสนักศึกษา, รหัสผ่านเดิม, และรหัสผ่านใหม่ จำเป็นต้องกรอกทุกช่อง');
    }

    try {
        $db = getDatabaseConnection();
        $stmt = $db->prepare("
            SELECT id, student_id, password_hash 
            FROM students 
            WHERE student_id = :student_id 
              AND status = 'Active' AND is_deleted = false
        ");
        $stmt->execute(['student_id' => $studentId]);
        $student = $stmt->fetch();

        if (!$student) {
            sendError('ไม่พบรหัสประจำตัวนักศึกษานี้ในระบบ', 404);
        }

        // Verify old password
        $isValid = false;
        if (is_null($student['password_hash']) || $student['password_hash'] === '') {
            $isValid = ($oldPassword === $student['student_id']);
        } else {
            $isValid = password_verify($oldPassword, $student['password_hash']);
        }

        if (!$isValid) {
            sendError('รหัสผ่านเดิมไม่ถูกต้อง', 401);
        }

        // Hash new password and update
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $updateStmt = $db->prepare("UPDATE students SET password_hash = :hash, updated_at = NOW() WHERE id = :id");
        $updateStmt->execute(['hash' => $newHash, 'id' => $student['id']]);

        // Log audit log
        logAudit($student['id'], $student['student_id'], 'Change Student Password', 'students', $student['id'], null, null);

        sendSuccess(null, 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว');
    } catch (Exception $e) {
        sendError('ระบบไม่สามารถเปลี่ยนรหัสผ่านได้: ' . $e->getMessage(), 500);
    }
}

// 2. AUTHENTICATED CRUD ACTIONS (Requires Viewer/Finance/Admin/Auditor role)
$user = requireRole(['Admin', 'Finance', 'Auditor', 'Viewer']);

if ($method === 'GET') {
    try {
        $db = getDatabaseConnection();
        $id = $_GET['id'] ?? null;
        $email = $_GET['email'] ?? null;

        if ($id) {
            $stmt = $db->prepare("SELECT * FROM students WHERE id = :id AND is_deleted = false");
            $stmt->execute(['id' => $id]);
            $student = $stmt->fetch();

            if (!$student) {
                sendError('Student not found', 404);
            }
            sendSuccess($student);
        } elseif ($email) {
            $stmt = $db->prepare("SELECT * FROM students WHERE email = :email AND is_deleted = false");
            $stmt->execute(['email' => $email]);
            $student = $stmt->fetch();

            if (!$student) {
                sendError('Student not found with this email', 404);
            }
            
            // Start student PHP session for cross-portal navigation compatibility
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }
            $_SESSION['student_id'] = $student['id'];
            $_SESSION['student_code'] = $student['student_id'];
            $_SESSION['student_name'] = $student['full_name'];
            $_SESSION['student_email'] = $student['email'];
            $_SESSION['role'] = 'นักศึกษา';
            
            // Combine prefix and full_name for backward compatibility in frontend display
            $student['full_name'] = ($student['prefix'] ? $student['prefix'] : '') . $student['full_name'];
            unset($student['password_hash']); // strip hash for safety
            
            sendSuccess($student);
        } else {
            // List all active students (optimized columns selection to speed up loading)
            $stmt = $db->prepare("SELECT id, student_id, prefix, full_name, nickname, class, academic_year, status FROM students WHERE is_deleted = false ORDER BY student_id ASC");
            $stmt->execute();
            $students = $stmt->fetchAll();
            sendSuccess($students);
        }
    } catch (Exception $e) {
        sendError('Database error: ' . $e->getMessage(), 500);
    }
}

if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'adjust_balance') {
    // Only Admin or Finance can adjust balances
    $user = requireRole(['Admin', 'Finance']);
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    
    $studentUuid = $input['student_id'] ?? '';
    $amount = isset($input['amount']) ? floatval($input['amount']) : 0.0;
    $type = $input['type'] ?? ''; // 'Adjustment' or 'Refund'
    $description = trim($input['description'] ?? '');

    if (empty($studentUuid)) {
        sendError('Student ID is required');
    }
    if ($amount <= 0) {
        sendError('Amount must be greater than zero');
    }
    if (!in_array($type, ['Adjustment', 'Refund'])) {
        sendError('Type must be Adjustment or Refund');
    }

    try {
        $db = getDatabaseConnection();
        
        // Check if student exists
        $stmtCheck = $db->prepare("SELECT id, full_name FROM students WHERE id = :id AND is_deleted = false");
        $stmtCheck->execute(['id' => $studentUuid]);
        $student = $stmtCheck->fetch();
        if (!$student) {
            sendError('Student not found');
        }

        // Insert into payment_transactions
        $stmtInsert = $db->prepare("
            INSERT INTO payment_transactions (
                student_id, amount, transaction_type, created_by
            ) VALUES (
                :student_id, :amount, :type, :created_by
            ) RETURNING id
        ");
        $stmtInsert->execute([
            'student_id' => $studentUuid,
            'amount' => $amount,
            'type' => $type,
            'created_by' => $user['id']
        ]);
        $newId = $stmtInsert->fetchColumn();

        // Write audit log
        logAudit(
            $user['id'],
            $user['email'],
            'StudentPaymentAdjustment',
            'payment_transactions',
            $newId,
            null,
            [
                'student_id' => $studentUuid,
                'student_name' => $student['full_name'],
                'amount' => $amount,
                'type' => $type,
                'description' => $description
            ]
        );

        sendSuccess([
            'id' => $newId
        ], 'Balance adjusted successfully');
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
    $prefix = $input['prefix'] ?? '';
    $nickname = $input['nickname'] ?? '';
    $class = $input['class'] ?? '';
    $academicYear = $input['academic_year'] ?? '';
    $status = $input['status'] ?? 'Active'; // 'Active', 'Inactive'

    // Split prefix and name dynamically if prefix is empty but fullName is provided
    if (empty($prefix) && !empty($fullName)) {
        $prefixes = ['นางสาว', 'นาง', 'นาย', 'เด็กหญิง', 'เด็กชาย', 'ด.ญ.', 'ด.ช.'];
        foreach ($prefixes as $p) {
            if (strpos($fullName, $p) === 0) {
                $prefix = $p;
                $fullName = trim(substr($fullName, strlen($p)));
                break;
            }
        }
    }

    // Validate inputs
    if (!preg_match('/^69\d{7}-\d$/', $studentId)) {
        sendError('Student ID must match format 69xxxxxxx-x');
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
                SET student_id = :student_id, prefix = :prefix, full_name = :full_name, nickname = :nickname, 
                    class = :class, academic_year = :academic_year, status = :status, updated_by = :updated_by
                WHERE id = :id
            ");
            $updateStmt->execute([
                'id' => $id,
                'student_id' => $studentId,
                'prefix' => $prefix,
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
                'prefix' => $prefix,
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
                INSERT INTO students (student_id, prefix, full_name, nickname, class, academic_year, status, created_by, updated_by)
                VALUES (:student_id, :prefix, :full_name, :nickname, :class, :academic_year, :status, :created_by, :updated_by)
                RETURNING id
            ");
            $insertStmt->execute([
                'student_id' => $studentId,
                'prefix' => $prefix,
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
