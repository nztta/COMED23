<?php
// api/settings.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/audit.php';
require_once __DIR__ . '/config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// 1. GET - Fetch Monthly settings (Public access is allowed for portal, but dashboard editing requires Admin/Finance)
if ($method === 'GET') {
    try {
        $db = getDatabaseConnection();
        $id = $_GET['id'] ?? null;

        if ($id) {
            $stmt = $db->prepare("SELECT * FROM monthly_payment_settings WHERE id = :id AND is_deleted = false");
            $stmt->execute(['id' => $id]);
            $setting = $stmt->fetch();

            if (!$setting) {
                sendError('Setting not found', 404);
            }

            // Parse PostgreSQL array string e.g., "{2026-06-07,2026-06-14}" to PHP array
            $cleanDates = trim($setting['due_dates'], '{}');
            $setting['due_dates'] = empty($cleanDates) ? [] : explode(',', $cleanDates);
            sendSuccess($setting);
        } else {
            // Fetch all settings ordered by year desc, month desc
            $stmt = $db->prepare("SELECT * FROM monthly_payment_settings WHERE is_deleted = false ORDER BY year DESC, month DESC");
            $stmt->execute();
            $settings = $stmt->fetchAll();

            foreach ($settings as &$s) {
                $cleanDates = trim($s['due_dates'], '{}');
                $s['due_dates'] = empty($cleanDates) ? [] : explode(',', $cleanDates);
            }

            sendSuccess($settings);
        }
    } catch (Exception $e) {
        sendError('Failed to fetch settings: ' . $e->getMessage(), 500);
    }
}

// 2. POST - Create or Update setting (Admin/Finance only)
if ($method === 'POST') {
    // Authenticate user & check role
    $user = requireRole(['Admin', 'Finance']);

    // Parse input
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? null;
    $month = isset($input['month']) ? (int)$input['month'] : null;
    $year = isset($input['year']) ? (int)$input['year'] : null;
    $weeklyFee = isset($input['weekly_fee']) ? (float)$input['weekly_fee'] : null;
    $numberOfWeeks = isset($input['number_of_weeks']) ? (int)$input['number_of_weeks'] : 4;
    $openDate = $input['open_date'] ?? null;
    $dueDatePerWeek = $input['due_dates'] ?? []; // Array of dates
    $closeDate = $input['close_date'] ?? null;
    $status = $input['status'] ?? 'Closed'; // 'Open', 'Closed', 'Archived'
    $title = $input['title'] ?? '';
    $description = $input['description'] ?? '';
    $customMembers = $input['custom_members'] ?? null; // Array of student UUIDs or null

    // Validate inputs
    if (!$month || $month < 1 || $month > 12) {
        sendError('Invalid month (1-12 required)');
    }
    if (!$year || $year < 2000) {
        sendError('Invalid year');
    }
    if ($weeklyFee === null || $weeklyFee < 0) {
        sendError('Weekly fee must be a positive number');
    }
    if ($numberOfWeeks < 1 || $numberOfWeeks > 5) {
        sendError('Number of weeks must be between 1 and 5');
    }
    if (empty($openDate) || empty($closeDate)) {
        sendError('Open and Close dates are required');
    }
    if (count($dueDatePerWeek) !== $numberOfWeeks) {
        sendError("Please specify exactly $numberOfWeeks due dates");
    }

    try {
        $db = getDatabaseConnection();
        $db->beginTransaction();

        // Convert due_dates array to PostgreSQL array literal format
        $pgDueDates = '{' . implode(',', array_map(function($date) {
            return '"' . preg_replace('/[^0-9\-]/', '', $date) . '"';
        }, $dueDatePerWeek)) . '}';

        $oldValue = null;
        $newValue = null;

        // Custom members encoding
        $customMembersJson = is_array($customMembers) ? json_encode($customMembers) : null;
        
        // Resolve list of target student IDs
        $targetStudents = [];
        if (is_array($customMembers) && !empty($customMembers)) {
            $targetStudents = $customMembers;
        } else {
            // Fetch all active students
            $studentsStmt = $db->prepare("SELECT id FROM students WHERE status = 'Active' AND is_deleted = false");
            $studentsStmt->execute();
            $targetStudents = $studentsStmt->fetchAll(PDO::FETCH_COLUMN);
        }

        if ($id) {
            // Update Existing Configuration
            $stmt = $db->prepare("SELECT * FROM monthly_payment_settings WHERE id = :id AND is_deleted = false");
            $stmt->execute(['id' => $id]);
            $oldValue = $stmt->fetch();

            if (!$oldValue) {
                $db->rollBack();
                sendError('Setting not found to update', 404);
            }

            // Update database setting
            $updateStmt = $db->prepare("
                UPDATE monthly_payment_settings 
                SET month = :month, year = :year, weekly_fee = :weekly_fee, number_of_weeks = :number_of_weeks, 
                    open_date = :open_date, due_dates = :due_dates::DATE[], close_date = :close_date, status = :status,
                    title = :title, description = :description, custom_members = :custom_members,
                    updated_by = :updated_by, updated_at = NOW()
                WHERE id = :id
            ");
            $updateStmt->execute([
                'id' => $id,
                'month' => $month,
                'year' => $year,
                'weekly_fee' => $weeklyFee,
                'number_of_weeks' => $numberOfWeeks,
                'open_date' => $openDate,
                'due_dates' => $pgDueDates,
                'close_date' => $closeDate,
                'status' => $status,
                'title' => $title,
                'description' => $description,
                'custom_members' => $customMembersJson,
                'updated_by' => $user['id']
            ]);

            // If fee has changed, update amounts for ALL Unpaid weeks for this setting
            if ((float)$oldValue['weekly_fee'] !== $weeklyFee) {
                // Update existing unpaid or overdue weekly payment records for this month
                $updateRecordsStmt = $db->prepare("
                    UPDATE weekly_payment_records
                    SET amount = :weekly_fee
                    WHERE month_setting_id = :setting_id 
                      AND status IN ('Unpaid', 'Overdue')
                      AND is_deleted = false
                ");
                $updateRecordsStmt->execute([
                    'weekly_fee' => $weeklyFee,
                    'setting_id' => $id
                ]);
            }

            // If the status was changed, check if it was closed or archived
            if ($oldValue['status'] !== $status) {
                // Add system notification
                $notifStmt = $db->prepare("
                    INSERT INTO notifications (title, message, type, setting_id, created_by)
                    VALUES (:title, :message, :type, :setting_id, :created_by)
                ");
                $monthNameEn = date("F", mktime(0, 0, 0, $month, 1));
                $notifStmt->execute([
                    'title' => "สถานะของรอบบิลถูกเปลี่ยนเป็น {$status}",
                    'message' => "รายการเรียกเก็บเงิน '{$title}' ถูกเปลี่ยนสถานะเป็น '{$status}'",
                    'type' => $status === 'Closed' ? 'MonthClosed' : 'BudgetChange',
                    'setting_id' => $id,
                    'created_by' => $user['id']
                ]);
            }

            $newValue = [
                'id' => $id,
                'month' => $month,
                'year' => $year,
                'weekly_fee' => $weeklyFee,
                'number_of_weeks' => $numberOfWeeks,
                'open_date' => $openDate,
                'due_dates' => $dueDatePerWeek,
                'close_date' => $closeDate,
                'status' => $status,
                'title' => $title,
                'description' => $description
            ];

            logAudit($user['id'], $user['email'], 'edit_payment_setting', 'monthly_payment_settings', $id, $oldValue, $newValue);

        } else {
            // Create New Configuration
            // Check duplicate month/year (including soft-deleted)
            $checkStmt = $db->prepare("SELECT id, is_deleted FROM monthly_payment_settings WHERE month = :month AND year = :year");
            $checkStmt->execute(['month' => $month, 'year' => $year]);
            $existingRow = $checkStmt->fetch();

            if ($existingRow && !$existingRow['is_deleted']) {
                $db->rollBack();
                sendError('รายการเรียกเก็บเงินของเดือนและปีนี้มีอยู่แล้วในระบบ');
            }

            if ($existingRow && $existingRow['is_deleted']) {
                // Restore soft-deleted record with new data
                $id = $existingRow['id'];
                $restoreStmt = $db->prepare("
                    UPDATE monthly_payment_settings 
                    SET weekly_fee = :weekly_fee, number_of_weeks = :number_of_weeks, 
                        open_date = :open_date, due_dates = :due_dates::DATE[], close_date = :close_date, 
                        status = :status, title = :title, description = :description, 
                        custom_members = :custom_members, is_deleted = false,
                        created_by = :created_by, updated_by = :updated_by, updated_at = NOW()
                    WHERE id = :id
                ");
                $restoreStmt->execute([
                    'id' => $id,
                    'weekly_fee' => $weeklyFee,
                    'number_of_weeks' => $numberOfWeeks,
                    'open_date' => $openDate,
                    'due_dates' => $pgDueDates,
                    'close_date' => $closeDate,
                    'status' => $status,
                    'title' => $title,
                    'description' => $description,
                    'custom_members' => $customMembersJson,
                    'created_by' => $user['id'],
                    'updated_by' => $user['id']
                ]);
            } else {
                // Fresh insert
                $insertStmt = $db->prepare("
                    INSERT INTO monthly_payment_settings (
                        month, year, weekly_fee, number_of_weeks, open_date, due_dates, close_date, status, title, description, custom_members, created_by, updated_by
                    ) VALUES (
                        :month, :year, :weekly_fee, :number_of_weeks, :open_date, :due_dates::DATE[], :close_date, :status, :title, :description, :custom_members, :created_by, :updated_by
                    ) RETURNING id
                ");
                $insertStmt->execute([
                    'month' => $month,
                    'year' => $year,
                    'weekly_fee' => $weeklyFee,
                    'number_of_weeks' => $numberOfWeeks,
                    'open_date' => $openDate,
                    'due_dates' => $pgDueDates,
                    'close_date' => $closeDate,
                    'status' => $status,
                    'title' => $title,
                    'description' => $description,
                    'custom_members' => $customMembersJson,
                    'created_by' => $user['id'],
                    'updated_by' => $user['id']
                ]);
                $id = $insertStmt->fetchColumn();
            }

            // Populate weekly records for targeted students in a single query
            $studentIdsStr = implode(',', $targetStudents);
            $insertRecordStmt = $db->prepare("
                INSERT INTO weekly_payment_records (
                    student_id, month_setting_id, week_number, status, amount, created_by, updated_by
                )
                SELECT s.id, :setting_id, w.week, 'Unpaid', :amount, :created_by, :updated_by
                FROM students s
                CROSS JOIN (SELECT generate_series(1, :num_weeks) AS week) w
                WHERE s.id = ANY(string_to_array(:student_ids_str, ',')::UUID[]) AND s.is_deleted = false
                ON CONFLICT (student_id, month_setting_id, week_number) DO NOTHING
            ");
            $insertRecordStmt->execute([
                'setting_id' => $id,
                'amount' => $weeklyFee,
                'num_weeks' => $numberOfWeeks,
                'student_ids_str' => $studentIdsStr,
                'created_by' => $user['id'],
                'updated_by' => $user['id']
            ]);

            // Create notification (Global/Student specific depends on targets)
            $thMonthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            $monthText = $thMonthNames[$month - 1] . ' ' . $year;

            if (is_array($customMembers) && !empty($customMembers)) {
                // Targeted notifications in a single batch query
                $notifStmt = $db->prepare("
                    INSERT INTO notifications (title, message, type, setting_id, student_id, author_name, target_page, created_by)
                    SELECT :title, :message, 'BudgetChange', :setting_id, s.id, :author, 'student.html', :created_by
                    FROM students s
                    WHERE s.id = ANY(string_to_array(:student_ids_str, ',')::UUID[]) AND s.is_deleted = false
                ");
                $notifStmt->execute([
                    'title' => "คุณมีรายการเรียกเก็บเงินใหม่: {$title}",
                    'message' => "รายการเรียกเก็บเงินรอบบิลเดือน {$monthText} ค่าห้องสัปดาห์ละ {$weeklyFee} บาท จำนวน {$numberOfWeeks} สัปดาห์",
                    'setting_id' => $id,
                    'author' => $user['full_name'],
                    'student_ids_str' => $studentIdsStr,
                    'created_by' => $user['id']
                ]);
            } else {
                // Global notification for all students
                $notifStmt = $db->prepare("
                    INSERT INTO notifications (title, message, type, setting_id, student_id, author_name, target_page, created_by)
                    VALUES (:title, :message, 'BudgetChange', :setting_id, :student_id, :author, 'student.html', :created_by)
                ");
                $notifStmt->execute([
                    'title' => "เปิดรอบบิลเรียกเก็บเงินใหม่: {$title}",
                    'message' => "รายการเรียกเก็บเงินรอบบิลเดือน {$monthText} ค่าห้องสัปดาห์ละ {$weeklyFee} บาท จำนวน {$numberOfWeeks} สัปดาห์",
                    'setting_id' => $id,
                    'student_id' => null,
                    'author' => $user['full_name'],
                    'created_by' => $user['id']
                ]);
            }

            // Discord Notification
            require_once __DIR__ . '/helpers/discord.php';
            sendDiscordNotification(
                "New Billing Created / มีรายการเรียกเก็บเงินใหม่",
                "หัวข้อ: **{$title}**\nรายละเอียด: {$description}\nรอบบิลเดือน: **{$monthText}**\nค่าบริการ: **{$weeklyFee}** บาท/สัปดาห์ (ยอดรวมเป้าหมายรายคน: " . ($weeklyFee * $numberOfWeeks) . " บาท)\nจำนวนผู้ที่ต้องชำระ: **" . count($targetStudents) . "** คน",
                "3066993"
            );

            $newValue = [
                'id' => $id,
                'month' => $month,
                'year' => $year,
                'weekly_fee' => $weeklyFee,
                'number_of_weeks' => $numberOfWeeks,
                'open_date' => $openDate,
                'due_dates' => $dueDatePerWeek,
                'close_date' => $closeDate,
                'status' => $status,
                'title' => $title,
                'description' => $description
            ];

            logAudit($user['id'], $user['email'], 'create_payment_setting', 'monthly_payment_settings', $id, null, $newValue);
        }

        $db->commit();
        sendSuccess(['id' => $id], 'Payment settings saved successfully');

    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) {
            $db->rollBack();
        }
        sendError('Failed to save configuration: ' . $e->getMessage(), 500);
    }
}

// 3. DELETE - Soft delete/Cancel setting (Admin/Finance only)
if ($method === 'DELETE') {
    // Authenticate user & check role
    $user = requireRole(['Admin', 'Finance']);
    $id = $_GET['id'] ?? null;

    if (!$id) {
        sendError('Month Setting ID is required');
    }

    try {
        $db = getDatabaseConnection();
        $db->beginTransaction();

        // Fetch setting details
        $stmt = $db->prepare("SELECT * FROM monthly_payment_settings WHERE id = :id AND is_deleted = false");
        $stmt->execute(['id' => $id]);
        $setting = $stmt->fetch();

        if (!$setting) {
            $db->rollBack();
            sendError('Setting not found', 404);
        }

        // Soft delete monthly setting
        $deleteStmt = $db->prepare("UPDATE monthly_payment_settings SET is_deleted = true, updated_by = :updated_by WHERE id = :id");
        $deleteStmt->execute(['id' => $id, 'updated_by' => $user['id']]);

        // Soft delete corresponding weekly payment records
        $deleteRecordsStmt = $db->prepare("UPDATE weekly_payment_records SET is_deleted = true, updated_by = :updated_by WHERE month_setting_id = :id");
        $deleteRecordsStmt->execute(['id' => $id, 'updated_by' => $user['id']]);

        // Find notification created for this month setting and soft delete it
        $updateNotif = $db->prepare("
            UPDATE notifications 
            SET is_deleted = true,
                is_cancelled = true 
            WHERE setting_id = :setting_id
        ");
        $updateNotif->execute(['setting_id' => $id]);

        $thMonthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        $monthText = $thMonthNames[$setting['month'] - 1] . ' ' . $setting['year'];

        // Send Discord Webhook
        require_once __DIR__ . '/helpers/discord.php';
        sendDiscordNotification(
            "Billing Deleted / ยกเลิกรายการเรียกเก็บเงิน",
            "รายการเรียกเก็บเงินรอบบิล **{$monthText}** หัวข้อ: **{$setting['title']}** ถูกยกเลิกโดย **{$user['full_name']}** เรียบร้อยแล้ว",
            "15158332" // Red
        );

        logAudit($user['id'], $user['email'], 'delete_payment_setting', 'monthly_payment_settings', $id, $setting, ['is_deleted' => true]);

        $db->commit();
        sendSuccess(null, 'Payment settings deleted and canceled successfully');

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendError('Failed to delete setting: ' . $e->getMessage(), 500);
    }
}

sendError('Method not allowed', 405);
