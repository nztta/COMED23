<?php
// api/run_migration_upgrade.php
require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json');

try {
    $db = getDatabaseConnection();
    
    // 1. Add profile columns to students table if not exist
    $db->exec("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS english_first_name VARCHAR(100) DEFAULT NULL;");
    $db->exec("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS english_last_name VARCHAR(100) DEFAULT NULL;");
    $db->exec("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS english_nickname VARCHAR(100) DEFAULT NULL;");
    $db->exec("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS age INT DEFAULT NULL;");
    
    // 2. Add title, description, and custom target members to monthly_payment_settings
    $db->exec("ALTER TABLE public.monthly_payment_settings ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT NULL;");
    $db->exec("ALTER TABLE public.monthly_payment_settings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;");
    $db->exec("ALTER TABLE public.monthly_payment_settings ADD COLUMN IF NOT EXISTS custom_members TEXT DEFAULT NULL;");
    
    // 3. Add targeted notifications tracking columns to notifications table
    $db->exec("ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_id UUID DEFAULT NULL;");
    $db->exec("ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL;");
    $db->exec("ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;");
    $db->exec("ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS author_name VARCHAR(255) DEFAULT NULL;");
    $db->exec("ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_page VARCHAR(255) DEFAULT NULL;");
    $db->exec("ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;");
    $db->exec("ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS setting_id UUID DEFAULT NULL;");
    
    // Add foreign key constraints if not exist
    try {
        $db->exec("ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;");
    } catch (Exception $e) { /* ignore if already exists */ }
    try {
        $db->exec("ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;");
    } catch (Exception $e) { /* ignore if already exists */ }
    try {
        $db->exec("ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_setting FOREIGN KEY (setting_id) REFERENCES public.monthly_payment_settings(id) ON DELETE CASCADE;");
    } catch (Exception $e) { /* ignore if already exists */ }
    
    // 4. Seed required Roles
    $roles = ['ฝ่ายจัดการระบบ', 'หัวหน้า', 'รองหัวหน้า', 'เลขานุการ', 'เหรัญญิก', 'นักศึกษา'];
    $stmtRole = $db->prepare("INSERT INTO public.roles (name) VALUES (:name) ON CONFLICT (name) DO NOTHING");
    foreach ($roles as $role) {
        $stmtRole->execute(['name' => $role]);
    }

    // 5. Add role column to students table and migrate existing data
    $db->exec("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'นักศึกษา';");
    $db->exec("UPDATE public.students SET role = 'นักศึกษา' WHERE role IS NULL;");

    // Migrate existing users with old English roles to the new Thai roles
    $db->exec("
        UPDATE public.users 
        SET role_id = (SELECT id FROM roles WHERE name = 'ฝ่ายจัดการระบบ') 
        WHERE role_id = (SELECT id FROM roles WHERE name = 'Admin') 
          AND EXISTS (SELECT 1 FROM roles WHERE name = 'ฝ่ายจัดการระบบ');
    ");
    $db->exec("
        UPDATE public.users 
        SET role_id = (SELECT id FROM roles WHERE name = 'เหรัญญิก') 
        WHERE role_id = (SELECT id FROM roles WHERE name = 'Finance') 
          AND EXISTS (SELECT 1 FROM roles WHERE name = 'เหรัญญิก');
    ");
    $db->exec("
        UPDATE public.users 
        SET role_id = (SELECT id FROM roles WHERE name = 'รองหัวหน้า') 
        WHERE role_id = (SELECT id FROM roles WHERE name = 'Auditor') 
          AND EXISTS (SELECT 1 FROM roles WHERE name = 'รองหัวหน้า');
    ");
    $db->exec("
        UPDATE public.users 
        SET role_id = (SELECT id FROM roles WHERE name = 'นักศึกษา') 
        WHERE (role_id = (SELECT id FROM roles WHERE name = 'Viewer') OR role_id = (SELECT id FROM roles WHERE name = 'Student')) 
          AND EXISTS (SELECT 1 FROM roles WHERE name = 'นักศึกษา');
    ");
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Successfully upgraded schema, seeded roles, and migrated existing data.'
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'failed',
        'error' => $e->getMessage()
    ]);
}
