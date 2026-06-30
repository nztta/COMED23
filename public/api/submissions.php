<?php
// api/submissions.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/audit.php';
require_once __DIR__ . '/helpers/discord.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/supabase.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

/**
 * Handle file upload securely.
 * Validates file type, size, and uploads either to Supabase Storage or saves locally.
 */
function handleFileUpload(array $file, PDO $db): string {
    // 1. Load settings from database
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key IN ('max_upload_size_mb', 'allowed_mime_types')");
    $stmt->execute();
    $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    $maxSizeMb = isset($settings['max_upload_size_mb']) ? (int)$settings['max_upload_size_mb'] : 5;
    $allowedMimeTypesStr = $settings['allowed_mime_types'] ?? 'image/png,image/jpeg,image/jpg,application/pdf';
    $allowedMimeTypes = array_map('trim', explode(',', $allowedMimeTypesStr));

    // Validate size
    $maxSizeBytes = $maxSizeMb * 1024 * 1024;
    if ($file['size'] > $maxSizeBytes) {
        sendError("File exceeds maximum size limit of {$maxSizeMb}MB.");
    }

    // Validate MIME type
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $detectedMimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($detectedMimeType, $allowedMimeTypes)) {
        sendError("File type not allowed. Allowed types: " . implode(', ', $allowedMimeTypes));
    }

    // Try Supabase Storage first if configured
    $supabase = getSupabaseConfig();
    if (!empty($supabase['url']) && !empty($supabase['anon_key'])) {
        $fileName = uuid_generate_php() . '_' . basename($file['name']);
        $bucket = $supabase['storage_bucket'];
        $uploadUrl = "{$supabase['url']}/storage/v1/object/{$bucket}/{$fileName}";

        $fileData = file_get_contents($file['tmp_name']);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $uploadUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $fileData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$supabase['anon_key']}",
            "Content-Type: {$detectedMimeType}"
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 || $httpCode === 201) {
            // Return public URL of the uploaded object
            return "{$supabase['url']}/storage/v1/object/public/{$bucket}/{$fileName}";
        }
    }

    // Fallback: Save file locally in public/uploads/
    $uploadDir = __DIR__ . '/../public/uploads/';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $fileExt = pathinfo($file['name'], PATHINFO_EXTENSION);
    $fileName = uuid_generate_php() . '.' . $fileExt;
    $targetPath = $uploadDir . $fileName;

    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
        // Return local web accessible path
        return 'uploads/' . $fileName;
    }

    sendError('Failed to upload file to storage.');
}

/**
 * Generate a UUID in PHP as fallback
 */
function uuid_generate_php() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// =============================================================================
// PUBLIC PORTAL ENDPOINTS (No login required)
// =============================================================================

// Action: GET payment status for student portal
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'student_status') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    // Must be either student or guest
    if (!isset($_SESSION['student_id']) && (!isset($_SESSION['guest']) || $_SESSION['guest'] !== true)) {
        sendError('Unauthorized access. Session invalid or expired.', 401);
    }
    
    $studentId = $_GET['student_id'] ?? '';

    if (empty($studentId)) {
        sendError('Student ID (UUID) is required');
    }

    try {
        $db = getDatabaseConnection();

        // 1. Verify student exists and is active
        $studentStmt = $db->prepare("SELECT id, status FROM students WHERE id = :id AND is_deleted = false");
        $studentStmt->execute(['id' => $studentId]);
        $student = $studentStmt->fetch();
        if (!$student || $student['status'] !== 'Active') {
            sendError('Student is inactive or does not exist', 404);
        }

        // 2. Fetch all monthly settings (excluding archived settings for payment submission)
        // Keep archived settings for color rendering of past paid history, but flag them.
        $settingsStmt = $db->prepare("
            SELECT id, month, year, weekly_fee, number_of_weeks, open_date, due_dates, close_date, status
            FROM monthly_payment_settings
            WHERE is_deleted = false
            ORDER BY year ASC, month ASC
        ");
        $settingsStmt->execute();
        $monthlySettings = $settingsStmt->fetchAll();

        // 3. Fetch weekly payment records for this student
        $recordsStmt = $db->prepare("
            SELECT id, month_setting_id, week_number, status, amount, paid_date, verified_date, slip_submission_id
            FROM weekly_payment_records
            WHERE student_id = :student_id AND is_deleted = false
        ");
        $recordsStmt->execute(['student_id' => $studentId]);
        $records = $recordsStmt->fetchAll();

        // Group weekly records by month_setting_id
        $recordsByMonth = [];
        foreach ($records as $r) {
            $recordsByMonth[$r['month_setting_id']][$r['week_number']] = $r;
        }

        // 4. Fetch pending submission IDs for this student in any month
        $pendingSubmissionsStmt = $db->prepare("
            SELECT month_setting_id, id 
            FROM slip_submissions 
            WHERE student_id = :student_id AND verification_status = 'Pending' AND is_deleted = false
        ");
        $pendingSubmissionsStmt->execute(['student_id' => $studentId]);
        $pendingIds = $pendingSubmissionsStmt->fetchAll(PDO::FETCH_KEY_PAIR);

        $todayStr = date('Y-m-d');
        $resultMonths = [];

        foreach ($monthlySettings as $setting) {
            $settingId = $setting['id'];
            $dueDatesStr = trim($setting['due_dates'], '{}');
            $dueDates = empty($dueDatesStr) ? [] : explode(',', $dueDatesStr);
            $numWeeks = (int)$setting['number_of_weeks'];

            $weeksData = [];
            $allWeeksVerified = true;
            $hasUnpaidOrOverdue = false;
            $hasPending = isset($pendingIds[$settingId]);
            $pendingSubmissionId = $hasPending ? $pendingIds[$settingId] : null;

            for ($w = 1; $w <= $numWeeks; $w++) {
                $rec = $recordsByMonth[$settingId][$w] ?? null;
                $dueDate = $dueDates[$w - 1] ?? '';
                
                // Color Logic
                $color = 'gray'; // default: not started / not yet due
                $statusText = 'Unpaid';
                $slipUrl = '';

                if ($rec) {
                    $statusText = $rec['status'];
                    if ($rec['status'] === 'Verified') {
                        $color = 'green';
                    } elseif ($rec['status'] === 'Pending') {
                        $color = 'yellow';
                    } else {
                        // Unpaid: Check due date
                        if (!empty($dueDate) && $todayStr > $dueDate) {
                            $color = 'red'; // Past due
                            $statusText = 'Overdue';
                        } else {
                            $color = 'gray'; // Not yet due
                        }
                    }
                } else {
                    // No record: check due date
                    if (!empty($dueDate) && $todayStr > $dueDate) {
                        $color = 'red';
                        $statusText = 'Overdue';
                    }
                }

                if ($color !== 'green') {
                    $allWeeksVerified = false;
                }
                if ($color === 'red' || $color === 'gray') {
                    $hasUnpaidOrOverdue = true;
                }

                $weeksData[] = [
                    'week_number' => $w,
                    'status' => $statusText,
                    'amount' => $rec ? (float)$rec['amount'] : (float)$setting['weekly_fee'],
                    'due_date' => $dueDate,
                    'color' => $color,
                    'paid_date' => $rec ? $rec['paid_date'] : null,
                    'verified_date' => $rec ? $rec['verified_date'] : null
                ];
            }

            // Calculate overall Monthly Tab Color
            // Gray: Month not started (status = Closed or Archived with no payments)
            // Red: Outstanding payment exists
            // Yellow: Partially paid or waiting verification
            // Green: Fully verified
            $monthColor = 'gray';
            if ($setting['status'] === 'Archived') {
                $monthColor = $allWeeksVerified ? 'green' : 'red';
            } else if ($setting['status'] === 'Closed') {
                $monthColor = 'gray';
            } else { // status = 'Open'
                if ($allWeeksVerified) {
                    $monthColor = 'green';
                } elseif ($hasPending || (!$allWeeksVerified && !$hasUnpaidOrOverdue)) {
                    $monthColor = 'yellow'; // partially paid or waiting verification
                } elseif ($hasUnpaidOrOverdue) {
                    // Check if any payment was verified/pending. If yes, it's partially paid (yellow).
                    // If absolutely nothing is paid, but it is past open date, show red if outstanding exists.
                    $anyPaidOrPending = false;
                    foreach ($weeksData as $wd) {
                        if ($wd['color'] === 'green' || $wd['color'] === 'yellow') {
                            $anyPaidOrPending = true;
                            break;
                        }
                    }
                    $monthColor = $anyPaidOrPending ? 'yellow' : 'red';
                }
            }

            $resultMonths[] = [
                'id' => $settingId,
                'month' => (int)$setting['month'],
                'year' => (int)$setting['year'],
                'weekly_fee' => (float)$setting['weekly_fee'],
                'number_of_weeks' => $numWeeks,
                'status' => $setting['status'],
                'color' => $monthColor,
                'weeks' => $weeksData,
                'has_pending_slip' => $hasPending,
                'pending_submission_id' => $pendingSubmissionId
            ];
        }

        sendSuccess($resultMonths);
    } catch (Exception $e) {
        sendError('Failed to fetch status: ' . $e->getMessage(), 500);
    }
}

// Action: POST upload slip (Public portal)
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'submit') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (isset($_SESSION['guest']) && $_SESSION['guest'] === true) {
        sendError('โหมดผู้ใช้ทั่วไปไม่สามารถส่งหลักฐานการชำระเงินได้ กรุณาเข้าสู่ระบบ', 403);
    }
    if (!isset($_SESSION['student_id'])) {
        sendError('กรุณาเข้าสู่ระบบก่อนชำระเงิน', 401);
    }
    
    $studentId = $_SESSION['student_id'];
    $monthSettingId = $_POST['month_setting_id'] ?? '';
    $weeksInput = $_POST['weeks'] ?? ''; // JSON array e.g. "[2,3]"

    if (empty($studentId) || empty($monthSettingId) || empty($weeksInput)) {
        sendError('Student ID, Month Setting ID, and Weeks selection are required');
    }

    $weeks = json_decode($weeksInput, true);
    if (!is_array($weeks) || empty($weeks)) {
        sendError('Weeks must be a non-empty array');
    }

    if (!isset($_FILES['slip']) || $_FILES['slip']['error'] !== UPLOAD_ERR_OK) {
        sendError('Payment slip file upload is required');
    }

    try {
        $db = getDatabaseConnection();
        $db->beginTransaction();

        // 1. Verify month setting is open and not archived
        $settingStmt = $db->prepare("SELECT * FROM monthly_payment_settings WHERE id = :id AND is_deleted = false");
        $settingStmt->execute(['id' => $monthSettingId]);
        $setting = $settingStmt->fetch();

        if (!$setting) {
            $db->rollBack();
            sendError('Monthly payment setting not found', 404);
        }

        if ($setting['status'] === 'Archived') {
            $db->rollBack();
            sendError('Cannot submit payment for an archived month');
        }

        if ($setting['status'] === 'Closed') {
            $db->rollBack();
            sendError('Payment for this month is currently closed.');
        }

        // 2. Prevent student from submitting another slip for the SAME month while one is pending
        $pendingCheck = $db->prepare("
            SELECT id FROM slip_submissions 
            WHERE student_id = :student_id 
              AND month_setting_id = :month_setting_id 
              AND verification_status = 'Pending' 
              AND is_deleted = false
        ");
        $pendingCheck->execute([
            'student_id' => $studentId,
            'month_setting_id' => $monthSettingId
        ]);
        if ($pendingCheck->fetch()) {
            $db->rollBack();
            sendError('A previous slip submission for this month is still pending verification. You cannot submit another.');
        }

        // 3. Verify selected weeks are not already paid/pending
        $recordsStmt = $db->prepare("
            SELECT week_number, status FROM weekly_payment_records 
            WHERE student_id = :student_id AND month_setting_id = :month_setting_id AND is_deleted = false
        ");
        $recordsStmt->execute([
            'student_id' => $studentId,
            'month_setting_id' => $monthSettingId
        ]);
        $existingRecords = $recordsStmt->fetchAll(PDO::FETCH_KEY_PAIR);

        foreach ($weeks as $w) {
            $wStatus = $existingRecords[$w] ?? 'Unpaid';
            if ($wStatus === 'Verified' || $wStatus === 'Pending') {
                $db->rollBack();
                sendError("Week {$w} has already been paid or has a pending submission.");
            }
        }

        // 4. Calculate total amount automatically: Weeks * Fee
        $weeklyFee = (float)$setting['weekly_fee'];
        $calculatedAmount = count($weeks) * $weeklyFee;

        // 5. Handle slip file upload
        $slipUrl = handleFileUpload($_FILES['slip'], $db);

        // Convert weeks to PG array literal format e.g., "{2,3}"
        $pgWeeks = '{' . implode(',', array_map('intval', $weeks)) . '}';

        // 6. Insert slip submission
        $insertSubmission = $db->prepare("
            INSERT INTO slip_submissions (
                student_id, month_setting_id, weeks, amount, slip_url, verification_status
            ) VALUES (
                :student_id, :month_setting_id, :weeks::INT[], :amount, :slip_url, 'Pending'
            ) RETURNING id
        ");
        $insertSubmission->execute([
            'student_id' => $studentId,
            'month_setting_id' => $monthSettingId,
            'weeks' => $pgWeeks,
            'amount' => $calculatedAmount,
            'slip_url' => $slipUrl
        ]);
        $submissionId = $insertSubmission->fetchColumn();

        // 7. Update/insert weekly records to 'Pending'
        $updateRecord = $db->prepare("
            INSERT INTO weekly_payment_records (
                student_id, month_setting_id, week_number, status, amount, slip_submission_id
            ) VALUES (
                :student_id, :month_setting_id, :week_number, 'Pending', :amount, :slip_submission_id
            ) ON CONFLICT (student_id, month_setting_id, week_number) 
            DO UPDATE SET status = 'Pending', slip_submission_id = :slip_submission_id
        ");

        foreach ($weeks as $w) {
            $updateRecord->execute([
                'student_id' => $studentId,
                'month_setting_id' => $monthSettingId,
                'week_number' => $w,
                'amount' => $weeklyFee,
                'slip_submission_id' => $submissionId
            ]);
        }

        // 8. Log Verification history
        $logStmt = $db->prepare("
            INSERT INTO verification_logs (slip_submission_id, action, comments)
            VALUES (:slip_submission_id, 'Submit', 'Slip uploaded by student')
        ");
        $logStmt->execute(['slip_submission_id' => $submissionId]);

        // 9. Add notification for Finance
        $notifStmt = $db->prepare("
            INSERT INTO notifications (title, message, type)
            VALUES ('New Slip Submitted', 'A new payment slip has been submitted and is pending verification.', 'Submission')
        ");
        $notifStmt->execute();

        // 10. Audit log (Student portal actions logged with NULL user ID)
        logAudit(
            null,
            'student-portal',
            'submit_slip',
            'slip_submissions',
            $submissionId,
            null,
            [
                'student_id' => $studentId,
                'month_setting_id' => $monthSettingId,
                'weeks' => $weeks,
                'amount' => $calculatedAmount,
                'slip_url' => $slipUrl
            ]
        );

        // Fetch student details for Discord message
        $studentStmt = $db->prepare("SELECT full_name FROM students WHERE id = :id");
        $studentStmt->execute(['id' => $studentId]);
        $studentName = $studentStmt->fetchColumn();

        // Send Discord Notification on slip submission
        sendDiscordNotification(
            "New Slip Submitted / มีการส่งสลิปชำระเงินใหม่",
            "นักศึกษา **{$studentName}** ได้ส่งสลิปชำระเงินใหม่\nยอดเงิน **{$calculatedAmount}** บาท สำหรับรายสัปดาห์ในรอบบิลนี้\nกรุณาเข้าตรวจสอบในระบบจัดการของเจ้าหน้าที่",
            "3447003"
        );

        $db->commit();
        sendSuccess([
            'submission_id' => $submissionId,
            'amount' => $calculatedAmount,
            'weeks' => $weeks
        ], 'Payment slip submitted successfully');

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendError('Failed to submit payment: ' . $e->getMessage(), 500);
    }
}

// Action: POST update slip (For pending submissions to change slip file)
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update_slip') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (isset($_SESSION['guest']) && $_SESSION['guest'] === true) {
        sendError('โหมดผู้ใช้ทั่วไปไม่สามารถส่งหลักฐานการชำระเงินได้ กรุณาเข้าสู่ระบบ', 403);
    }
    if (!isset($_SESSION['student_id'])) {
        sendError('กรุณาเข้าสู่ระบบก่อนชำระเงิน', 401);
    }

    $studentId = $_SESSION['student_id'];
    $submissionId = $_POST['submission_id'] ?? '';

    if (empty($submissionId)) {
        sendError('Submission ID is required');
    }

    if (!isset($_FILES['slip']) || $_FILES['slip']['error'] !== UPLOAD_ERR_OK) {
        sendError('Payment slip file upload is required');
    }

    try {
        $db = getDatabaseConnection();
        $db->beginTransaction();

        // 1. Fetch submission details
        $subStmt = $db->prepare("SELECT * FROM slip_submissions WHERE id = :id AND student_id = :student_id AND is_deleted = false");
        $subStmt->execute(['id' => $submissionId, 'student_id' => $studentId]);
        $sub = $subStmt->fetch();

        if (!$sub) {
            $db->rollBack();
            sendError('Submission record not found', 404);
        }

        if ($sub['verification_status'] !== 'Pending') {
            $db->rollBack();
            sendError('This slip has already been processed and locked.');
        }

        // 2. Handle slip file upload
        $slipUrl = handleFileUpload($_FILES['slip'], $db);

        // 3. Update slip URL
        $updateStmt = $db->prepare("UPDATE slip_submissions SET slip_url = :url, submitted_at = NOW() WHERE id = :id");
        $updateStmt->execute(['url' => $slipUrl, 'id' => $submissionId]);

        // 4. Log Verification history
        $logStmt = $db->prepare("
            INSERT INTO verification_logs (slip_submission_id, action, comments)
            VALUES (:submission_id, 'Submit', 'Slip updated/replaced by student')
        ");
        $logStmt->execute(['submission_id' => $submissionId]);

        // Fetch student details
        $studentStmt = $db->prepare("SELECT full_name FROM students WHERE id = :id");
        $studentStmt->execute(['id' => $studentId]);
        $studentName = $studentStmt->fetchColumn();

        // 5. Send Discord Notification
        sendDiscordNotification(
            "Slip Replaced / อัปเดตสลิปใหม่",
            "นักศึกษา **{$studentName}** ได้ทำการอัปเดต/เปลี่ยนไฟล์สลิปชำระเงินใหม่ (ยอดเงิน **{$sub['amount']}** บาท)\nกรุณาตรวจสอบรายละเอียดความถูกต้อง",
            "15105570" // Orange
        );

        logAudit(
            null,
            'student-portal',
            'update_slip',
            'slip_submissions',
            $submissionId,
            $sub,
            ['slip_url' => $slipUrl]
        );

        $db->commit();
        sendSuccess(['slip_url' => $slipUrl], 'เปลี่ยนสลิปการโอนเงินเรียบร้อยแล้ว');

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendError('Failed to update slip: ' . $e->getMessage(), 500);
    }
}


// =============================================================================
// AUTHENTICATED STAFF ENDPOINTS (Verification Queue, Approvals, Rejections)
// =============================================================================
$user = requireRole(['Admin', 'Finance', 'Auditor']);

// Action: GET list of submissions / verification queue
if ($method === 'GET' && !isset($_GET['action'])) {
    try {
        $db = getDatabaseConnection();
        $status = $_GET['status'] ?? 'Pending'; // 'Pending', 'Approved', 'Rejected', or 'All'

        $query = "
            SELECT s.*, std.student_id as student_code, std.full_name as student_name, std.class,
                   m.month, m.year, m.weekly_fee
            FROM slip_submissions s
            JOIN students std ON s.student_id = std.id
            JOIN monthly_payment_settings m ON s.month_setting_id = m.id
            WHERE s.is_deleted = false
        ";

        $params = [];
        if ($status !== 'All') {
            $query .= " AND s.verification_status = :status";
            $params['status'] = $status;
        }

        $query .= " ORDER BY s.submitted_at DESC";

        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $submissions = $stmt->fetchAll();

        foreach ($submissions as &$sub) {
            $cleanWeeks = trim($sub['weeks'], '{}');
            $sub['weeks'] = empty($cleanWeeks) ? [] : array_map('intval', explode(',', $cleanWeeks));
        }

        sendSuccess($submissions);
    } catch (Exception $e) {
        sendError('Database error: ' . $e->getMessage(), 500);
    }
}

// Action: POST Verification Decisions (Approve/Reject/Revert)
if ($method === 'POST') {
    // Only Admin or Finance can Approve/Reject slips
    $user = requireRole(['Admin', 'Finance']);
    $input = json_decode(file_get_contents('php://input'), true);

    $submissionId = $input['submission_id'] ?? '';
    $action = $input['action'] ?? ''; // 'Approve', 'Reject', 'RequestInfo', 'Pending'
    $comments = $input['comments'] ?? '';

    if (empty($submissionId) || !in_array($action, ['Approve', 'Reject', 'RequestInfo', 'Pending'])) {
        sendError('Submission ID and valid Action (Approve/Reject/RequestInfo/Pending) are required');
    }

    try {
        $db = getDatabaseConnection();
        $db->beginTransaction();

        // 1. Fetch submission details
        $subStmt = $db->prepare("SELECT * FROM slip_submissions WHERE id = :id AND is_deleted = false");
        $subStmt->execute(['id' => $submissionId]);
        $sub = $subStmt->fetch();

        if (!$sub) {
            $db->rollBack();
            sendError('Submission record not found', 404);
        }

        $oldStatus = $sub['verification_status'];
        $newStatus = $action === 'Approve' ? 'Approved' : ($action === 'Reject' ? 'Rejected' : 'Pending');

        // Fetch student details
        $studentStmt = $db->prepare("SELECT full_name FROM students WHERE id = :id");
        $studentStmt->execute(['id' => $sub['student_id']]);
        $studentName = $studentStmt->fetchColumn();

        // If status actually changes, perform states transitions
        if ($oldStatus !== $newStatus) {
            // --- REVERT PREVIOUS STATE ---
            if ($oldStatus === 'Approved') {
                // Soft delete payment transaction
                $deleteTx = $db->prepare("UPDATE payment_transactions SET is_deleted = true WHERE slip_submission_id = :submission_id");
                $deleteTx->execute(['submission_id' => $submissionId]);
            }

            // --- APPLY NEW STATE ---
            if ($newStatus === 'Approved') {
                // Approve Slip
                $updateSub = $db->prepare("
                    UPDATE slip_submissions 
                    SET verification_status = 'Approved', comments = :comments, 
                        verified_at = CURRENT_TIMESTAMP, verified_by = :verified_by
                    WHERE id = :id
                ");
                $updateSub->execute([
                    'id' => $submissionId,
                    'comments' => $comments,
                    'verified_by' => $user['id']
                ]);

                // Update weekly payment records to 'Verified'
                $updateRecords = $db->prepare("
                    UPDATE weekly_payment_records
                    SET status = 'Verified', paid_date = CURRENT_TIMESTAMP, 
                        verified_date = CURRENT_TIMESTAMP, verified_by = :verified_by
                    WHERE slip_submission_id = :submission_id
                ");
                $updateRecords->execute([
                    'submission_id' => $submissionId,
                    'verified_by' => $user['id']
                ]);

                // Create financial transaction
                $insertTx = $db->prepare("
                    INSERT INTO payment_transactions (student_id, slip_submission_id, amount, transaction_type, created_by)
                    VALUES (:student_id, :submission_id, :amount, 'Payment', :created_by)
                ");
                $insertTx->execute([
                    'student_id' => $sub['student_id'],
                    'submission_id' => $submissionId,
                    'amount' => $sub['amount'],
                    'created_by' => $user['id']
                ]);

                // Log Verification history
                $logStmt = $db->prepare("
                    INSERT INTO verification_logs (slip_submission_id, action, comments, action_by)
                    VALUES (:submission_id, 'Approve', :comments, :action_by)
                ");
                $logStmt->execute([
                    'submission_id' => $submissionId,
                    'comments' => $comments ?: 'Slip verified and approved.',
                    'action_by' => $user['id']
                ]);

                // Create targeted inbox notification for student
                $notifStmt = $db->prepare("
                    INSERT INTO notifications (title, message, type, student_id, author_name, target_page, created_by)
                    VALUES ('ใบเสร็จอนุมัติแล้ว', :message, 'Approval', :student_id, :author, 'student.html', :created_by)
                ");
                $notifStmt->execute([
                    'message' => "หลักฐานการชำระเงินค่าห้องสัปดาห์ " . trim($sub['weeks'], '{}') . " ยอด " . $sub['amount'] . " บาท ได้รับอนุมัติแล้ว",
                    'student_id' => $sub['student_id'],
                    'author' => $user['full_name'],
                    'created_by' => $user['id']
                ]);

                // Send Discord notification
                sendDiscordNotification(
                    "Slip Approved / อนุมัติสลิปชำระเงินแล้ว",
                    "สลิปชำระเงินของ **{$studentName}** จำนวน **{$sub['amount']}** บาท ได้รับการอนุมัติโดย **{$user['full_name']}**\nเวลาอนุมัติ: " . date('Y-m-d H:i:s'),
                    "3066993"
                );

            } elseif ($newStatus === 'Rejected') {
                // Reject Slip
                $updateSub = $db->prepare("
                    UPDATE slip_submissions 
                    SET verification_status = 'Rejected', comments = :comments, 
                        verified_at = CURRENT_TIMESTAMP, verified_by = :verified_by
                    WHERE id = :id
                ");
                $updateSub->execute([
                    'id' => $submissionId,
                    'comments' => $comments,
                    'verified_by' => $user['id']
                ]);

                // Revert weekly records to Unpaid
                $revertRecords = $db->prepare("
                    UPDATE weekly_payment_records
                    SET status = 'Unpaid', slip_submission_id = NULL
                    WHERE slip_submission_id = :submission_id
                ");
                $revertRecords->execute(['submission_id' => $submissionId]);

                // Log Verification history
                $logStmt = $db->prepare("
                    INSERT INTO verification_logs (slip_submission_id, action, comments, action_by)
                    VALUES (:submission_id, 'Reject', :comments, :action_by)
                ");
                $logStmt->execute([
                    'submission_id' => $submissionId,
                    'comments' => $comments ?: 'Slip rejected by administrator.',
                    'action_by' => $user['id']
                ]);

                // Create targeted inbox notification for student
                $notifStmt = $db->prepare("
                    INSERT INTO notifications (title, message, type, student_id, author_name, target_page, created_by)
                    VALUES ('ใบเสร็จไม่ผ่านการอนุมัติ', :message, 'Rejection', :student_id, :author, 'student.html', :created_by)
                ");
                $notifStmt->execute([
                    'message' => "หลักฐานการชำระเงินจำนวน " . $sub['amount'] . " บาท ถูกปฏิเสธการอนุมัติ เหตุผล: " . ($comments ?: 'กรุณาอัปโหลดสลิปที่ถูกต้องใหม่'),
                    'student_id' => $sub['student_id'],
                    'author' => $user['full_name'],
                    'created_by' => $user['id']
                ]);

                // Send Discord notification
                sendDiscordNotification(
                    "Slip Rejected / ปฏิเสธสลิปชำระเงิน",
                    "สลิปชำระเงินของ **{$studentName}** จำนวน **{$sub['amount']}** บาท ถูกปฏิเสธการอนุมัติโดย **{$user['full_name']}**\nเหตุผล: " . ($comments ?: 'ไม่ได้ระบุเหตุผล'),
                    "15158332"
                );

            } elseif ($newStatus === 'Pending') {
                // Revert to Pending status
                $updateSub = $db->prepare("
                    UPDATE slip_submissions 
                    SET verification_status = 'Pending', comments = :comments, 
                        verified_at = NULL, verified_by = NULL
                    WHERE id = :id
                ");
                $updateSub->execute([
                    'id' => $submissionId,
                    'comments' => $comments
                ]);

                // Set weekly records back to Pending
                $revertRecords = $db->prepare("
                    UPDATE weekly_payment_records
                    SET status = 'Pending', slip_submission_id = :submission_id
                    WHERE id IN (
                        SELECT id FROM weekly_payment_records WHERE slip_submission_id = :submission_id
                        UNION
                        SELECT r.id FROM weekly_payment_records r
                        JOIN slip_submissions s ON r.student_id = s.student_id AND r.month_setting_id = s.month_setting_id
                        WHERE s.id = :submission_id AND r.week_number = ANY(s.weeks)
                    )
                ");
                $revertRecords->execute(['submission_id' => $submissionId]);

                // Log Verification history
                $logStmt = $db->prepare("
                    INSERT INTO verification_logs (slip_submission_id, action, comments, action_by)
                    VALUES (:submission_id, 'RequestInfo', :comments, :action_by)
                ");
                $logStmt->execute([
                    'submission_id' => $submissionId,
                    'comments' => $comments ?: 'Reverted back to pending.',
                    'action_by' => $user['id']
                ]);

                // Create targeted inbox notification for student
                $notifStmt = $db->prepare("
                    INSERT INTO notifications (title, message, type, student_id, author_name, target_page, created_by)
                    VALUES ('สถานะการชำระเงินถูกย้อนกลับ', :message, 'Submission', :student_id, :author, 'student.html', :created_by)
                ");
                $notifStmt->execute([
                    'message' => "รายการชำระเงินยอด {$sub['amount']} บาท ถูกดึงกลับมาเป็นสถานะรอตรวจสอบสลิปใหม่",
                    'student_id' => $sub['student_id'],
                    'author' => $user['full_name'],
                    'created_by' => $user['id']
                ]);

                // Send Discord notification
                sendDiscordNotification(
                    "Slip Decision Reverted / ย้อนสถานะตรวจสอบสลิป",
                    "รายการชำระเงินของ **{$studentName}** จำนวน **{$sub['amount']}** บาท ถูกย้อนสถานะกลับเป็น **รอการตรวจสอบ (Pending)** โดย **{$user['full_name']}**",
                    "15105570"
                );
            }

            logAudit($user['id'], $user['email'], 'revert_slip_status', 'slip_submissions', $submissionId, $sub, ['verification_status' => $newStatus, 'comments' => $comments]);
        } else {
            // No status changes, just comments update
            if ($action === 'RequestInfo') {
                $updateSub = $db->prepare("UPDATE slip_submissions SET comments = :comments WHERE id = :id");
                $updateSub->execute(['id' => $submissionId, 'comments' => $comments]);

                $logStmt = $db->prepare("
                    INSERT INTO verification_logs (slip_submission_id, action, comments, action_by)
                    VALUES (:submission_id, 'RequestInfo', :comments, :action_by)
                ");
                $logStmt->execute([
                    'submission_id' => $submissionId,
                    'comments' => $comments,
                    'action_by' => $user['id']
                ]);
            }
        }

        $db->commit();
        sendSuccess(null, "Slip processed successfully");

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendError('Failed to process slip: ' . $e->getMessage(), 500);
    }
}

sendError('Method not allowed', 405);
