<?php
// api/test_aws1.php
header('Content-Type: application/json');

$password = "5&Ate!94uD9/9cu";
$dbname = "postgres";
$host = "aws-1-ap-southeast-1.pooler.supabase.com";
$user = "postgres.hmszskmpzfmtayhppuws";

$results = [];

// Test with and without SSL
foreach (['require', null] as $ssl) {
    $dsn = "pgsql:host=$host;port=6543;dbname=$dbname";
    if ($ssl) {
        $dsn .= ";sslmode=$ssl";
    }
    
    $start = microtime(true);
    try {
        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 4
        ]);
        $results["SSL: " . ($ssl ?: 'none')] = [
            'status' => 'success',
            'time_taken' => round(microtime(true) - $start, 4) . 's'
        ];
    } catch (PDOException $e) {
        $results["SSL: " . ($ssl ?: 'none')] = [
            'status' => 'failed',
            'error' => $e->getMessage()
        ];
    }
}

echo json_encode($results, JSON_PRETTY_PRINT);
