<?php
// api/ledger.php
require_once __DIR__ . '/helpers/auth.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/audit.php';
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = getDatabaseConnection();

    if ($method === 'GET') {
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

        sendSuccess($results);

    } elseif ($method === 'POST') {
        // Verify user role
        $user = requireRole(['Admin', 'Finance']);

        // Check action
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $action = $_GET['action'] ?? $input['action'] ?? '';

        if ($action === 'delete') {
            $id = $input['id'] ?? '';
            if (empty($id)) {
                sendError('Transaction ID is required', 400);
            }

            // Fetch transaction before deletion to log audit trail
            $stmtFetch = $db->prepare("SELECT * FROM treasurer_transactions WHERE id = :id AND is_deleted = false");
            $stmtFetch->execute(['id' => $id]);
            $txn = $stmtFetch->fetch(PDO::FETCH_ASSOC);

            if (!$txn) {
                sendError('Transaction not found or already deleted', 404);
            }

            $stmtDelete = $db->prepare("UPDATE treasurer_transactions SET is_deleted = true, updated_by = :user_id, updated_at = NOW() WHERE id = :id");
            $stmtDelete->execute([
                'id' => $id,
                'user_id' => $user['id']
            ]);

            logAudit(
                $user['id'],
                $user['email'],
                'LedgerTransactionDelete',
                'treasurer_transactions',
                $id,
                $txn,
                ['is_deleted' => true]
            );

            sendSuccess(null, 'Transaction deleted successfully');

        } else {
            // Create new transaction
            $title = trim($input['title'] ?? '');
            $amount = isset($input['amount']) ? floatval($input['amount']) : 0.0;
            $type = trim($input['type'] ?? '');
            $personName = trim($input['person_name'] ?? '');
            $month = isset($input['month']) && $input['month'] !== '' ? intval($input['month']) : intval(date('n'));
            $year = isset($input['year']) && $input['year'] !== '' ? intval($input['year']) : intval(date('Y'));

            if (empty($title)) {
                sendError('Title is required', 400);
            }
            if ($amount <= 0) {
                sendError('Amount must be greater than zero', 400);
            }
            if (!in_array($type, ['Income', 'Expense'])) {
                sendError('Type must be either Income or Expense', 400);
            }
            if (empty($personName)) {
                sendError('Person/Entity name is required', 400);
            }

            $stmtInsert = $db->prepare("
                INSERT INTO treasurer_transactions (
                    title, amount, type, person_name, month, year, created_by, updated_by
                ) VALUES (
                    :title, :amount, :type, :personName, :month, :year, :user_id, :user_id
                ) RETURNING id
            ");
            $stmtInsert->execute([
                'title' => $title,
                'amount' => $amount,
                'type' => $type,
                'personName' => $personName,
                'month' => $month,
                'year' => $year,
                'user_id' => $user['id']
            ]);
            $newRow = $stmtInsert->fetch(PDO::FETCH_ASSOC);
            $newId = $newRow['id'] ?? null;

            logAudit(
                $user['id'],
                $user['email'],
                'LedgerTransactionCreate',
                'treasurer_transactions',
                $newId,
                null,
                [
                    'title' => $title,
                    'amount' => $amount,
                    'type' => $type,
                    'person_name' => $personName,
                    'month' => $month,
                    'year' => $year
                ]
            );

            sendSuccess([
                'id' => $newId
            ], 'Transaction added successfully');
        }
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
