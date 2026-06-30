<?php
// api/test_db_ssl.php
header('Content-Type: application/json');

$password = "5&Ate!94uD9/9cu";
$dbname = "postgres";

$scenarios = [
    'hmszskmpzfmtayhppuws with SSL' => [
        'host' => 'aws-0-ap-southeast-1.pooler.supabase.com',
        'port' => '6543',
        'user' => 'postgres.hmszskmpzfmtayhppuws',
        'ssl' => 'require'
    ],
    'hmszskmpzfmtayhppuws without SSL' => [
        'host' => 'aws-0-ap-southeast-1.pooler.supabase.com',
        'port' => '6543',
        'user' => 'postgres.hmszskmpzfmtayhppuws',
        'ssl' => null
    ],
    'cfcgchkmnwsoexhlbdbz with SSL' => [
        'host' => 'aws-0-ap-southeast-1.pooler.supabase.com',
        'port' => '6543',
        'user' => 'postgres.cfcgchkmnwsoexhlbdbz',
        'ssl' => 'require'
    ]
];

$results = [];

foreach ($scenarios as $name => $config) {
    $dsn = "pgsql:host={$config['host']};port={$config['port']};dbname=$dbname";
    if ($config['ssl']) {
        $dsn .= ";sslmode={$config['ssl']}";
    }
    
    $start = microtime(true);
    try {
        $pdo = new PDO($dsn, $config['user'], $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 4
        ]);
        $results[$name] = [
            'status' => 'success',
            'time_taken' => round(microtime(true) - $start, 4) . 's'
        ];
    } catch (PDOException $e) {
        $results[$name] = [
            'status' => 'failed',
            'time_taken' => round(microtime(true) - $start, 4) . 's',
            'error' => $e->getMessage()
        ];
    }
}

echo json_encode($results, JSON_PRETTY_PRINT);
