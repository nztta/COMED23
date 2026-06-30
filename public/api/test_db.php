<?php
// api/test_db.php
header('Content-Type: application/json');

$password = "5&Ate!94uD9/9cu";
$dbname = "postgres";
$user = 'postgres.hmszskmpzfmtayhppuws';

$regions = [
    'ap-southeast-1' => 'Singapore',
    'ap-southeast-2' => 'Sydney',
    'ap-northeast-1' => 'Tokyo',
    'ap-northeast-2' => 'Seoul',
    'us-east-1' => 'N. Virginia',
    'us-east-2' => 'Ohio',
    'us-west-1' => 'N. California',
    'us-west-2' => 'Oregon',
    'eu-central-1' => 'Frankfurt',
    'eu-west-1' => 'Ireland',
    'eu-west-2' => 'London',
    'eu-west-3' => 'Paris',
    'ca-central-1' => 'Canada'
];

$results = [];

foreach ($regions as $code => $name) {
    $host = "aws-0-{$code}.pooler.supabase.com";
    $dsn = "pgsql:host={$host};port=6543;dbname=$dbname";
    $start = microtime(true);
    try {
        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 2
        ]);
        $results[$code . " ($name)"] = [
            'status' => 'success',
            'time_taken' => round(microtime(true) - $start, 4) . 's'
        ];
    } catch (PDOException $e) {
        $results[$code . " ($name)"] = [
            'status' => 'failed',
            'error' => $e->getMessage()
        ];
    }
}

echo json_encode($results, JSON_PRETTY_PRINT);
