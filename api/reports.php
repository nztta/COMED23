<?php
// api/reports.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/audit.php';
require_once __DIR__ . '/config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// Authenticate user (Viewer, Finance, Admin, Auditor allowed to export)
$user = requireRole(['Admin', 'Finance', 'Auditor', 'Viewer']);

$reportType = $_GET['type'] ?? ''; // 'monthly', 'student', 'weekly', 'outstanding', 'verification', 'budget'
$format = $_GET['format'] ?? 'csv'; // 'csv' (We can also add html-print fallback)

if (empty($reportType)) {
    sendError('Report type is required');
}

try {
    $db = getDatabaseConnection();

    // Headers array and data array
    $headers = [];
    $data = [];
    $filename = $reportType . "_report_" . date('Ymd_His') . ".csv";

    if ($reportType === 'monthly') {
        $monthId = $_GET['month_setting_id'] ?? '';
        if (empty($monthId)) {
            sendError('Month Setting ID is required for monthly reports');
        }

        // Fetch month details
        $monthStmt = $db->prepare("SELECT month, year FROM monthly_payment_settings WHERE id = :id");
        $monthStmt->execute(['id' => $monthId]);
        $monthInfo = $monthStmt->fetch();
        $monthName = date("F", mktime(0, 0, 0, (int)$monthInfo['month'], 1)) . ' ' . $monthInfo['year'];
        $filename = "monthly_report_" . str_replace(' ', '_', $monthName) . "_" . date('Ymd') . ".csv";

        // Query students and their weekly status for this month
        $stmt = $db->prepare("
            SELECT s.student_id, s.full_name, s.class,
                   MAX(CASE WHEN r.week_number = 1 THEN r.status END) as w1_status,
                   MAX(CASE WHEN r.week_number = 1 THEN r.amount END) as w1_amount,
                   MAX(CASE WHEN r.week_number = 2 THEN r.status END) as w2_status,
                   MAX(CASE WHEN r.week_number = 2 THEN r.amount END) as w2_amount,
                   MAX(CASE WHEN r.week_number = 3 THEN r.status END) as w3_status,
                   MAX(CASE WHEN r.week_number = 3 THEN r.amount END) as w3_amount,
                   MAX(CASE WHEN r.week_number = 4 THEN r.status END) as w4_status,
                   MAX(CASE WHEN r.week_number = 4 THEN r.amount END) as w4_amount,
                   MAX(CASE WHEN r.week_number = 5 THEN r.status END) as w5_status,
                   MAX(CASE WHEN r.week_number = 5 THEN r.amount END) as w5_amount,
                   SUM(CASE WHEN r.status = 'Verified' THEN r.amount ELSE 0 END) as total_paid
            FROM students s
            LEFT JOIN weekly_payment_records r ON s.id = r.student_id AND r.month_setting_id = :month_id AND r.is_deleted = false
            WHERE s.is_deleted = false
            GROUP BY s.id, s.student_id, s.full_name, s.class
            ORDER BY s.student_id ASC
        ");
        $stmt->execute(['month_id' => $monthId]);
        $rawRecords = $stmt->fetchAll();

        $headers = ['Student ID', 'Full Name', 'Class', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Total Verified Paid (THB)'];
        foreach ($rawRecords as $r) {
            $data[] = [
                $r['student_id'],
                $r['full_name'],
                $r['class'],
                $r['w1_status'] ?: 'N/A',
                $r['w2_status'] ?: 'N/A',
                $r['w3_status'] ?: 'N/A',
                $r['w4_status'] ?: 'N/A',
                $r['w5_status'] ?: 'N/A',
                (float)$r['total_paid']
            ];
        }

    } elseif ($reportType === 'student') {
        // Query overall student summary
        $stmt = $db->prepare("
            SELECT s.student_id, s.full_name, s.class, s.academic_year, s.status,
                   COALESCE(SUM(r.amount), 0) as expected,
                   COALESCE(SUM(CASE WHEN r.status = 'Verified' THEN r.amount ELSE 0 END), 0) as paid,
                   COALESCE(SUM(CASE WHEN r.status IN ('Unpaid', 'Overdue') THEN r.amount ELSE 0 END), 0) as outstanding
            FROM students s
            LEFT JOIN weekly_payment_records r ON s.id = r.student_id AND r.is_deleted = false
            WHERE s.is_deleted = false
            GROUP BY s.id, s.student_id, s.full_name, s.class, s.academic_year, s.status
            ORDER BY s.student_id ASC
        ");
        $stmt->execute();
        $rawRecords = $stmt->fetchAll();

        $headers = ['Student ID', 'Full Name', 'Class', 'Academic Year', 'Status', 'Expected Fee (THB)', 'Paid Fee (THB)', 'Outstanding Fee (THB)'];
        foreach ($rawRecords as $r) {
            $data[] = [
                $r['student_id'],
                $r['full_name'],
                $r['class'],
                $r['academic_year'],
                $r['status'],
                (float)$r['expected'],
                (float)$r['paid'],
                (float)$r['outstanding']
            ];
        }

    } elseif ($reportType === 'outstanding') {
        // Query list of students who have outstanding or overdue payments
        $stmt = $db->prepare("
            SELECT s.student_id, s.full_name, s.class, 
                   m.month, m.year,
                   r.week_number, r.amount, r.status
            FROM weekly_payment_records r
            JOIN students s ON r.student_id = s.id
            JOIN monthly_payment_settings m ON r.month_setting_id = m.id
            WHERE r.status IN ('Unpaid', 'Overdue') 
              AND r.is_deleted = false 
              AND s.is_deleted = false
            ORDER BY m.year DESC, m.month DESC, s.student_id ASC, r.week_number ASC
        ");
        $stmt->execute();
        $rawRecords = $stmt->fetchAll();

        $headers = ['Student ID', 'Full Name', 'Class', 'Month', 'Year', 'Week Number', 'Amount Due (THB)', 'Payment Status'];
        foreach ($rawRecords as $r) {
            $monthName = date("F", mktime(0, 0, 0, (int)$r['month'], 1));
            $data[] = [
                $r['student_id'],
                $r['full_name'],
                $r['class'],
                $monthName,
                $r['year'],
                'Week ' . $r['week_number'],
                (float)$r['amount'],
                $r['status']
            ];
        }

    } elseif ($reportType === 'verification') {
        // Query verification log trail
        $stmt = $db->prepare("
            SELECT s.id as submission_id, std.student_id, std.full_name, std.class,
                   m.month, m.year, s.amount, s.verification_status, s.comments, 
                   s.submitted_at, s.verified_at, u.email as verified_by_email
            FROM slip_submissions s
            JOIN students std ON s.student_id = std.id
            JOIN monthly_payment_settings m ON s.month_setting_id = m.id
            LEFT JOIN users u ON s.verified_by = u.id
            WHERE s.is_deleted = false
            ORDER BY s.submitted_at DESC
        ");
        $stmt->execute();
        $rawRecords = $stmt->fetchAll();

        $headers = ['Submission ID', 'Student ID', 'Student Name', 'Class', 'Month', 'Year', 'Amount (THB)', 'Verification Status', 'Comments', 'Submitted At', 'Verified At', 'Verified By'];
        foreach ($rawRecords as $r) {
            $monthName = date("F", mktime(0, 0, 0, (int)$r['month'], 1));
            $data[] = [
                $r['submission_id'],
                $r['student_id'],
                $r['full_name'],
                $r['class'],
                $monthName,
                $r['year'],
                (float)$r['amount'],
                $r['verification_status'],
                $r['comments'] ?: '-',
                $r['submitted_at'],
                $r['verified_at'] ?: '-',
                $r['verified_by_email'] ?: '-'
            ];
        }

    } elseif ($reportType === 'budget') {
        // Query budget metrics aggregated by Month-Year
        $stmt = $db->prepare("
            SELECT m.id, m.month, m.year, m.weekly_fee, m.number_of_weeks, m.status,
                   COALESCE(SUM(r.amount), 0) as expected,
                   COALESCE(SUM(CASE WHEN r.status = 'Verified' THEN r.amount ELSE 0 END), 0) as collected
            FROM monthly_payment_settings m
            LEFT JOIN weekly_payment_records r ON m.id = r.month_setting_id AND r.is_deleted = false
            WHERE m.is_deleted = false
            GROUP BY m.id, m.month, m.year, m.weekly_fee, m.number_of_weeks, m.status
            ORDER BY m.year DESC, m.month DESC
        ");
        $stmt->execute();
        $rawRecords = $stmt->fetchAll();

        $headers = ['Month', 'Year', 'Weekly Fee (THB)', 'Number of Weeks', 'Setting Status', 'Expected Budget (THB)', 'Collected Amount (THB)', 'Outstanding Balance (THB)', 'Collection Rate'];
        foreach ($rawRecords as $r) {
            $monthName = date("F", mktime(0, 0, 0, (int)$r['month'], 1));
            $expected = (float)$r['expected'];
            $collected = (float)$r['collected'];
            $outstanding = $expected - $collected;
            $rate = $expected > 0 ? round(($collected / $expected) * 100, 2) . '%' : '0%';

            $data[] = [
                $monthName,
                $r['year'],
                (float)$r['weekly_fee'],
                $r['number_of_weeks'],
                $r['status'],
                $expected,
                $collected,
                $outstanding,
                $rate
            ];
        }
    } else {
        sendError('Invalid report type specified');
    }

    // Write CSV Output
    // Setup file headers
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Pragma: no-cache');
    header('Expires: 0');

    // Create file pointer
    $output = fopen('php://output', 'w');

    // Add UTF-8 BOM for Microsoft Excel compatibility (very important for Thai text)
    fwrite($output, "\xEF\xBB\xBF");

    // Output headers
    fputcsv($output, $headers);

    // Output data rows
    foreach ($data as $row) {
        fputcsv($output, $row);
    }

    fclose($output);

    // Log the audit event for exporting reports
    logAudit(
        $user['id'], 
        $user['email'], 
        'export_report', 
        null, 
        null, 
        null, 
        ['report_type' => $reportType, 'filename' => $filename]
    );

    exit;

} catch (Exception $e) {
    sendError('Export generation failed: ' . $e->getMessage(), 500);
}
