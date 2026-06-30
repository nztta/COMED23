<?php
// api/test_db_cfcg.php
header('Content-Type: application/json');

$password = "5&Ate!94uD9/9cu";
$dbname = "postgres";

$config = [
    'host' => 'aws-0-ap-southeast-1.pooler.supabase.com',
    'port' => '6543',
    'user' => 'postgres.cfcgchkmnwsoexhlbdbz'
];

$dsn = "pgsql:host={$config['host']};port={$config['port']};dbname=$dbname";
$start = microtime(true);
try {
    $pdo = new PDO($dsn, $config['user'], $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 3
    ]);
    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully connected to cfcgchkmnwsoexhlbdbz!',
        'time_taken' => round(microtime(true) - $start, 4) . 's'
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'failed',
        'time_taken' => round(microtime(true) - $start, 4) . 's',
        'error' => $e->getMessage()
    ]);
}
