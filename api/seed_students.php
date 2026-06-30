<?php
// api/seed_students.php
// CLI seeder to insert the student list into the database.

if (php_sapi_name() !== 'cli') {
    die("This script can only be run via command line.\n");
}

require_once __DIR__ . '/config/database.php';

// Allow database credentials override from command line arguments
// Usage: php api/seed_students.php <password>
//   or: php api/seed_students.php <host> <dbname> <user> <password>
if ($argc >= 5) {
    putenv("DB_HOST=" . $argv[1]);
    putenv("DB_NAME=" . $argv[2]);
    putenv("DB_USER=" . $argv[3]);
    putenv("DB_PASS=" . $argv[4]);
} elseif ($argc === 2) {
    putenv("DB_PASS=" . $argv[1]);
}

echo "Attempting database connection...\n";

try {
    $db = getDatabaseConnection();
    echo "Successfully connected to the database!\n";
} catch (Exception $e) {
    die("Database connection failed: " . $e->getMessage() . "\n" .
        "Usage options:\n" .
        "  1. Run with environment variables set.\n" .
        "  2. Pass database password as argument: php api/seed_students.php <password>\n" .
        "  3. Pass all credentials: php api/seed_students.php <host> <dbname> <user> <password>\n");
}

// Student Data
$studentsData = [
    ["693050120-5", "นางสาวกชกร แสนอินทร์", "มิวสิค"],
    ["693050121-3", "นางสาวกนกพร คำพิทูล", "โดนัท"],
    ["693050122-1", "นายกรกต บรรเจิดวัฒนกุล", "โนว่า"],
    ["693050123-9", "นางสาวกัญชณิกา นันททิพรักษ์", "โบนัส"],
    ["693050124-7", "นายกิตติชัย สิงเนิน", "น้ำเต้า"],
    ["693050125-5", "นายขลุ่ยไทย เคนมี", "ขลุ่ย"],
    ["693050126-3", "นายจิรทีปต์ ชัยศรี", "บีน"],
    ["693050127-1", "นายชัยพงค์ วรรณทวี", "มาร์ค"],
    ["693050128-9", "นางสาวธัญชนก สุตะโคตร", "เค้ก"],
    ["693050129-7", "นางสาวธันยนันท์ สุวัฒนะ", "วาน"],
    ["693050130-2", "นายธีรดนย์ ศรีโพธิ์ชัย", "ยูโร"],
    ["693050131-0", "นางสาวบุญญรัตน์ ชะนะพาล", "อันอัน"],
    ["693050132-8", "นางสาวปภาดา เพิ่มพูล", "แตงโม"],
    ["693050133-6", "นายปุณเมศ บุญสง", "คิว"],
    ["693050134-4", "นายพรหมพิริยะ หอมจันทร์", "โอปอน"],
    ["693050135-2", "นางสาวพิชชาพร เดชกุล", "แพนนี่"],
    ["693050136-0", "นายพีระพัฒน์ เกียมา", "ต้นกล้า"],
    ["693050137-8", "นายภาณุวิชญ์ ขัตติสอน", "ไกด์"],
    ["693050138-6", "นายภูธเนศ วงษ์ชาดี", "ภู"],
    ["693050139-4", "นายวชรพล อินธิกาย", "เนคไท"],
    ["693050140-9", "นายวชิรวิทย์ ทรัพย์เพิ่ม", "นิว"],
    ["693050141-7", "นายวชิรวิทย์ บุญขันธ์", "คิว"],
    ["693050142-5", "นายวัชรากร บุญโสม", "ออย"],
    ["693050143-3", "นายศุกลวัฒน์ พาพลงาม", "เปรม"],
    ["693050144-1", "นายอธิชา พิมพ์ทอง", "ไอคิว"],
    ["693050145-9", "นางสาวเขมนิจ บุตรชน", "เขม"],
    ["693050146-7", "นางสาวเพ็ญพิชชา โกมลวรรค", "นานา"],
    ["693050147-5", "นายแก่นพนม เฉลิมวงศ์วิวัฒน", "ข้าวเหนียว"],
    ["693050148-3", "นางสาวโสภิตรา หุนสุวงค์", "เค้ก"],
    ["693050383-3", "นางสาวฉัตรรดา กะไรยะ", "ฟ่าง"],
    ["693050384-1", "นายชลากร กุลสอนนาน", "ต้น"],
    ["693050385-9", "นางสาวฐิติกานต์ บุญสอน", "มะปราง"],
    ["693050386-7", "นายณัฏฐชัย โพธิ์ทับไทย", "โอ้"],
    ["693050387-5", "นายณิชคุณ ชำนาญ", "นาโน"],
    ["693050388-3", "นายธนาธิป ภูนาเหนือ", "ซี"],
    ["693050389-1", "นายธิติวุฒิ อารีเอื้อ", "ภูผา"],
    ["693050390-6", "นายธีระพล บัวรัตน์", "แม็คมิน"],
    ["693050391-4", "นายประกฤษฎิ์ เหยียดชัยภูมิ", "ต้นกล้า"],
    ["693050393-0", "นางสาวพิชามญธุ์ สามสี", "หมูหวาน"],
    ["693050394-8", "นายภูวกร มูลเหลา", "เฟส"],
    ["693050395-6", "นายรัชชานนท์ แสนสว่าง", "ภูมิ"],
    ["693050396-4", "นางสาววรัญญา อามาตย์", "อุ้ม"],
    ["693050397-2", "นางสาววริศรา งามประเสริฐ", "นุ่น"],
    ["693050398-0", "นางสาววิมลสิริ วงศ์คำชาว", "แพรวา"],
    ["693050399-8", "นายวีรภัทร เพชรอ้อม", "ตะวัน"],
    ["693050400-9", "นายสิรวิชญ์ บุญหล้า", "อั้ม"],
    ["693050401-7", "นางสาวเบญญาภา มีสวัสดิ์", ""],
    ["693050534-8", "นางสาวกัลยรัตน์ ไชยเดช", "อเล็ก"],
    ["693050535-6", "นายกิตติพัฒน์ เพียรยิ่ง", ""],
    ["693050537-2", "นางสาวทิติภา มาสุข", "ดีดี้"],
    ["693050538-0", "นางสาวภริดา เด่นไชยรัตน์", "ต้นอ้อ"],
    ["693050539-8", "นายภูมรินทร์ บุญมี", "ภูมิ"],
    ["693050540-3", "นายรณชัย สายเนตร์", "น็อต"],
    ["693050541-1", "นายอัษฎากร ศรีสังข์", "บาส"],
    ["693050562-3", "นายชิษณุพงศ์ แสนสีงาม", "ไผ่"],
    ["693050563-1", "นางสาวธาราทิพย์ การร้อย", "บีม"],
    ["693050564-9", "นางสาวปุณยพัฒน์ สินโพธิ์", "โบนัส"],
    ["693050565-7", "นางสาวพิยดา สารทอง", "โซอี้"],
    ["693050566-5", "นางสาวสุธีกานต์ บัตเลอร์", "เจสซี่"],
    ["693050567-3", "นางสาวอาภัสรา นากลาง", ""]
];

$successCount = 0;
$duplicateCount = 0;

$class = "COMED23";
$academicYear = "2026";

echo "Starting student data seeding...\n";

foreach ($studentsData as $student) {
    $studentId = $student[0];
    $fullName = $student[1];
    $nickname = empty($student[2]) ? null : $student[2];

    try {
        // Check if student_id already exists to prevent duplicate insertion error
        $checkStmt = $db->prepare("SELECT id FROM students WHERE student_id = :student_id");
        $checkStmt->execute(['student_id' => $studentId]);
        if ($checkStmt->fetch()) {
            $duplicateCount++;
            continue;
        }

        // Split prefix and name dynamically
        $prefix = '';
        $name = trim($fullName);
        $prefixes = ['นางสาว', 'นาง', 'นาย', 'เด็กหญิง', 'เด็กชาย', 'ด.ญ.', 'ด.ช.'];
        foreach ($prefixes as $p) {
            if (strpos($name, $p) === 0) {
                $prefix = $p;
                $name = trim(substr($name, strlen($p)));
                break;
            }
        }

        // Insert new student
        $insertStmt = $db->prepare("
            INSERT INTO students (student_id, prefix, full_name, nickname, class, academic_year, status)
            VALUES (:student_id, :prefix, :full_name, :nickname, :class, :academic_year, 'Active')
        ");
        $insertStmt->execute([
            'student_id' => $studentId,
            'prefix' => $prefix,
            'full_name' => $name,
            'nickname' => $nickname,
            'class' => $class,
            'academic_year' => $academicYear
        ]);
        $successCount++;
    } catch (Exception $e) {
        echo "Error inserting student {$studentId} ({$fullName}): " . $e->getMessage() . "\n";
    }
}

echo "\nSeeding complete!\n";
echo "Total students successfully inserted: {$successCount}\n";
echo "Duplicates skipped: {$duplicateCount}\n";
