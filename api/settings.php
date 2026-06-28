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
                    updated_by = :updated_by
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
                    INSERT INTO notifications (title, message, type, created_by)
                    VALUES (:title, :message, :type, :created_by)
                ");
                $notifStmt->execute([
                    'title' => "Month Setting Status Changed",
                    'message' => "The status for " . date("F", mktime(0, 0, 0, $month, 1)) . " $year was changed to '$status'.",
                    'type' => $status === 'Closed' ? 'MonthClosed' : 'BudgetChange',
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
                'status' => $status
            ];

            logAudit($user['id'], $user['email'], 'edit_payment_setting', 'monthly_payment_settings', $id, $oldValue, $newValue);

        } else {
            // Create New Configuration
            // Check duplicate month/year
            $checkStmt = $db->prepare("SELECT id FROM monthly_payment_settings WHERE month = :month AND year = :year AND is_deleted = false");
            $checkStmt->execute(['month' => $month, 'year' => $year]);
            if ($checkStmt->fetch()) {
                $db->rollBack();
                sendError('A payment configuration for this month and year already exists.');
            }

            $insertStmt = $db->prepare("
                INSERT INTO monthly_payment_settings (
                    month, year, weekly_fee, number_of_weeks, open_date, due_dates, close_date, status, created_by, updated_by
                ) VALUES (
                    :month, :year, :weekly_fee, :number_of_weeks, :open_date, :due_dates::DATE[], :close_date, :status, :created_by, :updated_by
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
                'created_by' => $user['id'],
                'updated_by' => $user['id']
            ]);

            $id = $insertStmt->fetchColumn();

            // Populate weekly records for all existing active students for this new setting
            $studentsStmt = $db->prepare("SELECT id FROM students WHERE status = 'Active' AND is_deleted = false");
            $studentsStmt->execute();
            $activeStudents = $studentsStmt->fetchAll(PDO::FETCH_COLUMN);

            $insertRecordStmt = $db->prepare("
                INSERT INTO weekly_payment_records (
                    student_id, month_setting_id, week_number, status, amount, created_by, updated_by
                ) VALUES (
                    :student_id, :setting_id, :week_number, 'Unpaid', :amount, :created_by, :updated_by
                ) ON CONFLICT (student_id, month_setting_id, week_number) DO NOTHING
            ");

            foreach ($activeStudents as $studentId) {
                for ($week = 1; $week <= $numberOfWeeks; $week++) {
                    $insertRecordStmt->execute([
                        'student_id' => $studentId,
                        'setting_id' => $id,
                        'week_number' => $week,
                        'amount' => $weeklyFee,
                        'created_by' => $user['id'],
                        'updated_by' => $user['id']
                    ]);
                }
            }

            // Create notification
            $notifStmt = $db->prepare("
                INSERT INTO notifications (title, message, type, created_by)
                VALUES (:title, :message, :type, :created_by)
            ");
            $notifStmt->execute([
                'title' => "New Month Setting Created",
                'message' => "Payment configuration for " . date("F", mktime(0, 0, 0, $month, 1)) . " $year has been set with a fee of $weeklyFee THB/week.",
                'type' => 'BudgetChange',
                'created_by' => $user['id']
            ]);

            $newValue = [
                'id' => $id,
                'month' => $month,
                'year' => $year,
                'weekly_fee' => $weeklyFee,
                'number_of_weeks' => $numberOfWeeks,
                'open_date' => $openDate,
                'due_dates' => $dueDatePerWeek,
                'close_date' => $closeDate,
                'status' => $status
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

sendError('Method not allowed', 405);
