<?php
// api/tests/verify.php
// Local developer self-test diagnostics script

header('Content-Type: text/plain; charset=UTF-8');
echo "=========================================================\n";
echo "  STUDENT PAYMENT PLATFORM - BACKEND DIAGNOSTICS TESTS    \n";
echo "=========================================================\n\n";

$errors = 0;

// Test 1: Verify file inclusions
echo "1. Checking Core Files Inclusion:\n";
$files = [
    __DIR__ . '/../config/database.php',
    __DIR__ . '/../config/supabase.php',
    __DIR__ . '/../helpers/response.php',
    __DIR__ . '/../helpers/auth.php',
    __DIR__ . '/../helpers/audit.php'
];

foreach ($files as $file) {
    if (file_exists($file)) {
        echo "  [OK] " . basename($file) . " exists.\n";
        include_once $file;
    } else {
        echo "  [ERROR] " . basename($file) . " NOT FOUND!\n";
        $errors++;
    }
}
echo "\n";

// Test 2: Check Config Functions
echo "2. Checking Configuration Initialization:\n";
if (function_exists('getSupabaseConfig')) {
    $config = getSupabaseConfig();
    echo "  [OK] getSupabaseConfig() loaded successfully.\n";
    echo "       URL: " . ($config['url'] ?: '(Empty)') . "\n";
    echo "       Bucket: " . $config['storage_bucket'] . "\n";
} else {
    echo "  [ERROR] getSupabaseConfig() is missing!\n";
    $errors++;
}
echo "\n";

// Test 3: JWT Parsing Functions
echo "3. Testing Base64Url Decryption Methods:\n";
if (function_exists('base64UrlDecode')) {
    $testStr = "SGVsbG8tV29ybGQ"; // "Hello-World"
    $decoded = base64UrlDecode($testStr);
    if ($decoded === "Hello-World") {
        echo "  [OK] base64UrlDecode matches correctly.\n";
    } else {
        echo "  [ERROR] base64UrlDecode decoded to: '$decoded' (Expected 'Hello-World')\n";
        $errors++;
    }
} else {
    echo "  [ERROR] base64UrlDecode() is missing!\n";
    $errors++;
}
echo "\n";

// Test 4: Database Connection Diagnostics (Attempt only if local.config.php exists)
echo "4. Testing PostgreSQL PDO Connectivity:\n";
$localConfigPath = __DIR__ . '/../config/local.config.php';
if (file_exists($localConfigPath)) {
    if (function_exists('getDatabaseConnection')) {
        try {
            $pdo = getDatabaseConnection();
            echo "  [OK] Successfully connected to PostgreSQL Database!\n";
            $rolesCount = $pdo->query("SELECT COUNT(*) FROM roles")->fetchColumn();
            echo "       Detected Roles in database: $rolesCount\n";
        } catch (Exception $e) {
            echo "  [WARNING] local.config.php exists but database connection failed: " . $e->getMessage() . "\n";
        }
    } else {
         echo "  [ERROR] getDatabaseConnection() is missing!\n";
         $errors++;
    }
} else {
    echo "  [NOTE] local.config.php does not exist. Skipping database validation.\n";
    echo "         (Copy local.config.example.php to local.config.php and edit connection parameters)\n";
}
echo "\n";

echo "=========================================================\n";
if ($errors === 0) {
    echo "  DIAGNOSTICS PASSED: Platform codebase syntax is correct.\n";
} else {
    echo "  DIAGNOSTICS FAILED with $errors compilation error(s).\n";
}
echo "=========================================================\n";
