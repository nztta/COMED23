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

    // 1-3. Consolidate Expected, Collected and Outstanding amounts from weekly_payment_records
    $stmtWeeklyMetrics = $db->prepare("
        SELECT 
            COALESCE(SUM(amount), 0) as expected,
            COALESCE(SUM(CASE WHEN status = 'Verified' THEN amount ELSE 0 END), 0) as collected,
            COALESCE(SUM(CASE WHEN status IN ('Unpaid', 'Overdue') THEN amount ELSE 0 END), 0) as outstanding
        FROM weekly_payment_records 
        WHERE is_deleted = false
    ");
    $stmtWeeklyMetrics->execute();
    $weeklyMetrics = $stmtWeeklyMetrics->fetch();
    
    $expectedIncome = (float)$weeklyMetrics['expected'];
    $collectedAmount = (float)$weeklyMetrics['collected'];
    $outstandingAmount = (float)$weeklyMetrics['outstanding'];

    // 4-5. Consolidate Pending and Rejected verification counts from slip_submissions
    $stmtSlipMetrics = $db->prepare("
        SELECT 
            COUNT(CASE WHEN verification_status = 'Pending' THEN 1 END) as pending,
            COUNT(CASE WHEN verification_status = 'Rejected' THEN 1 END) as rejected
        FROM slip_submissions 
        WHERE is_deleted = false
    ");
    $stmtSlipMetrics->execute();
    $slipMetrics = $stmtSlipMetrics->fetch();
    
    $pendingSlips = (int)$slipMetrics['pending'];
    $rejectedSlips = (int)$slipMetrics['rejected'];

    // 6-7. Consolidate Today and Monthly collection from payment_transactions
    $stmtTransactionMetrics = $db->prepare("
        SELECT 
            COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount ELSE 0 END), 0) as today,
            COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN amount ELSE 0 END), 0) as monthly
        FROM payment_transactions 
        WHERE transaction_type = 'Payment' AND is_deleted = false
    ");
    $stmtTransactionMetrics->execute();
    $transactionMetrics = $stmtTransactionMetrics->fetch();
    
    $todayCollection = (float)$transactionMetrics['today'];
    $monthlyCollection = (float)$transactionMetrics['monthly'];

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
