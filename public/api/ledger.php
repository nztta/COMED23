<?php
// api/ledger.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    $db = getDatabaseConnection();
    
    // Get query filters
    $month = isset($_GET['month']) && $_GET['month'] !== '' ? intval($_GET['month']) : null;
    $year = isset($_GET['year']) && $_GET['year'] !== '' ? intval($_GET['year']) : null;
    $type = isset($_GET['type']) && $_GET['type'] !== '' ? $_GET['type'] : null; // 'Income' or 'Expense'
    $search = isset($_GET['search']) && $_GET['search'] !== '' ? trim($_GET['search']) : null;

    // Build query conditions
    $conditions = [];
    $params = [];

    if ($month !== null) {
        $conditions[] = "month = :month";
        $params['month'] = $month;
    }
    
    if ($year !== null) {
        $conditions[] = "year = :year";
        $params['year'] = $year;
    }

    if ($type !== null) {
        $conditions[] = "type = :type";
        $params['type'] = $type;
    }

    if ($search !== null) {
        // Search by title or person_name
        $conditions[] = "(title ILIKE :search OR person_name ILIKE :search)";
        $params['search'] = '%' . $search . '%';
    }

    $whereSql = "";
    if (count($conditions) > 0) {
        $whereSql = "WHERE " . implode(" AND ", $conditions);
    }

    // Query view_classroom_ledger sorted by created_at DESC
    $query = "SELECT * FROM view_classroom_ledger {$whereSql} ORDER BY created_at DESC";
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'data' => $results
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Failed to load ledger: ' . $e->getMessage()
    ]);
}
