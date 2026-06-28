<?php
// api/dashboard.php

require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle OPTIONS pre-flight
if ($method === 'OPTIONS') {
    sendResponse(200, []);
}

// Authenticate staff (Viewer, Finance, Admin, Auditor)
$user = requireRole(['Admin', 'Finance', 'Auditor', 'Viewer']);

try {
    $db = getDatabaseConnection();

    // 1. Expected Income (Total Budget based on all records seeded)
    $stmtExpected = $db->prepare("SELECT COALESCE(SUM(amount), 0) FROM weekly_payment_records WHERE is_deleted = false");
    $stmtExpected->execute();
    $expectedIncome = (float)$stmtExpected->fetchColumn();

    // 2. Collected Amount (Verified records)
    $stmtCollected = $db->prepare("SELECT COALESCE(SUM(amount), 0) FROM weekly_payment_records WHERE status = 'Verified' AND is_deleted = false");
    $stmtCollected->execute();
    $collectedAmount = (float)$stmtCollected->fetchColumn();

    // 3. Outstanding Amount (Unpaid or Overdue)
    $stmtOutstanding = $db->prepare("SELECT COALESCE(SUM(amount), 0) FROM weekly_payment_records WHERE status IN ('Unpaid', 'Overdue') AND is_deleted = false");
    $stmtOutstanding->execute();
    $outstandingAmount = (float)$stmtOutstanding->fetchColumn();

    // 4. Pending Slips Verification
    $stmtPending = $db->prepare("SELECT COUNT(*) FROM slip_submissions WHERE verification_status = 'Pending' AND is_deleted = false");
    $stmtPending->execute();
    $pendingSlips = (int)$stmtPending->fetchColumn();

    // 5. Rejected Slips
    $stmtRejected = $db->prepare("SELECT COUNT(*) FROM slip_submissions WHERE verification_status = 'Rejected' AND is_deleted = false");
    $stmtRejected->execute();
    $rejectedSlips = (int)$stmtRejected->fetchColumn();

    // 6. Today's Collection
    $stmtToday = $db->prepare("
        SELECT COALESCE(SUM(amount), 0) 
        FROM payment_transactions 
        WHERE transaction_type = 'Payment' 
          AND created_at >= CURRENT_DATE 
          AND is_deleted = false
    ");
    $stmtToday->execute();
    $todayCollection = (float)$stmtToday->fetchColumn();

    // 7. Monthly Collection (This calendar month)
    $stmtMonth = $db->prepare("
        SELECT COALESCE(SUM(amount), 0) 
        FROM payment_transactions 
        WHERE transaction_type = 'Payment' 
          AND created_at >= DATE_TRUNC('month', CURRENT_DATE) 
          AND is_deleted = false
    ");
    $stmtMonth->execute();
    $monthlyCollection = (float)$stmtMonth->fetchColumn();

    // 8. Collection Rate
    $collectionRate = $expectedIncome > 0 ? ($collectedAmount / $expectedIncome) * 100 : 0;

    // 9. Chart Data: Monthly Collection Trends (Expected vs Collected)
    $stmtMonthlyTrend = $db->prepare("
        SELECT m.month, m.year, 
               COALESCE(SUM(CASE WHEN r.status = 'Verified' THEN r.amount ELSE 0 END), 0) as collected,
               COALESCE(SUM(r.amount), 0) as expected
        FROM weekly_payment_records r
        JOIN monthly_payment_settings m ON r.month_setting_id = m.id
        WHERE r.is_deleted = false
        GROUP BY m.month, m.year
        ORDER BY m.year ASC, m.month ASC
    ");
    $stmtMonthlyTrend->execute();
    $monthlyTrend = $stmtMonthlyTrend->fetchAll();

    // Map month integers to names
    foreach ($monthlyTrend as &$t) {
        $t['month_name'] = date("F", mktime(0, 0, 0, (int)$t['month'], 1)) . ' ' . $t['year'];
        $t['collected'] = (float)$t['collected'];
        $t['expected'] = (float)$t['expected'];
        $t['outstanding'] = $t['expected'] - $t['collected'];
    }

    // 10. Chart Data: Weekly Collection rate of open months
    $stmtWeeklyTrend = $db->prepare("
        SELECT r.week_number,
               COALESCE(SUM(CASE WHEN r.status = 'Verified' THEN r.amount ELSE 0 END), 0) as collected,
               COALESCE(SUM(r.amount), 0) as expected
        FROM weekly_payment_records r
        JOIN monthly_payment_settings m ON r.month_setting_id = m.id
        WHERE r.is_deleted = false AND m.status = 'Open'
        GROUP BY r.week_number
        ORDER BY r.week_number ASC
    ");
    $stmtWeeklyTrend->execute();
    $weeklyTrend = $stmtWeeklyTrend->fetchAll();

    foreach ($weeklyTrend as &$wt) {
        $wt['week_name'] = 'Week ' . $wt['week_number'];
        $wt['collected'] = (float)$wt['collected'];
        $wt['expected'] = (float)$wt['expected'];
    }

    // 11. Student status distribution (For Pie chart / summary)
    // Categories: Fully Paid (all verified), Unpaid (no payments), Partially Paid (some verified, some pending/unpaid)
    $stmtStudentStatus = $db->prepare("
        WITH student_weeks AS (
            SELECT student_id,
                   COUNT(*) as total_weeks,
                   COUNT(CASE WHEN status = 'Verified' THEN 1 END) as verified_weeks,
                   COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_weeks
            FROM weekly_payment_records
            WHERE is_deleted = false
            GROUP BY student_id
        )
        SELECT 
            COUNT(CASE WHEN verified_weeks = total_weeks AND total_weeks > 0 THEN 1 END) as fully_paid,
            COUNT(CASE WHEN verified_weeks > 0 AND verified_weeks < total_weeks THEN 1 END) as partially_paid,
            COUNT(CASE WHEN verified_weeks = 0 AND pending_weeks > 0 THEN 1 END) as pending_verification,
            COUNT(CASE WHEN verified_weeks = 0 AND pending_weeks = 0 AND total_weeks > 0 THEN 1 END) as unpaid
        FROM student_weeks
    ");
    $stmtStudentStatus->execute();
    $studentStatusDistribution = $stmtStudentStatus->fetch();

    $studentStats = [
        'fully_paid' => (int)($studentStatusDistribution['fully_paid'] ?? 0),
        'partially_paid' => (int)($studentStatusDistribution['partially_paid'] ?? 0),
        'pending_verification' => (int)($studentStatusDistribution['pending_verification'] ?? 0),
        'unpaid' => (int)($studentStatusDistribution['unpaid'] ?? 0)
    ];

    // 12. Recent Activities (from audit log)
    $stmtActivities = $db->prepare("
        SELECT id, timestamp, user_email, action, table_name, ip_address 
        FROM audit_logs 
        ORDER BY timestamp DESC 
        LIMIT 10
    ");
    $stmtActivities->execute();
    $recentActivities = $stmtActivities->fetchAll();

    // 13. Notifications
    $stmtNotifs = $db->prepare("
        SELECT * FROM notifications 
        WHERE is_deleted = false 
        ORDER BY created_at DESC 
        LIMIT 5
    ");
    $stmtNotifs->execute();
    $notifications = $stmtNotifs->fetchAll();

    // Return aggregated payload
    sendSuccess([
        'metrics' => [
            'budget' => $expectedIncome,
            'collected' => $collectedAmount,
            'outstanding' => $outstandingAmount,
            'pending_verifications' => $pendingSlips,
            'rejected_slips' => $rejectedSlips,
            'today_collection' => $todayCollection,
            'monthly_collection' => $monthlyCollection,
            'collection_rate' => round($collectionRate, 2)
        ],
        'monthly_trend' => $monthlyTrend,
        'weekly_trend' => $weeklyTrend,
        'student_stats' => $studentStats,
        'recent_activities' => $recentActivities,
        'notifications' => $notifications
    ]);

} catch (Exception $e) {
    sendError('Dashboard analysis failed: ' . $e->getMessage(), 500);
}
