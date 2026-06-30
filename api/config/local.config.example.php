<?php
// api/config/local.config.example.php
// Copy this file to local.config.php and update values for your environment.

return [
    // PostgreSQL Database Configuration
    'DB_HOST' => 'aws-0-ap-southeast-1.pooler.supabase.com',
    'DB_PORT' => '6543',
    'DB_NAME' => 'postgres',
    'DB_USER' => 'postgres.hmszskmpzfmtayhppuws',
    'DB_PASS' => '5&Ate!94uD9/9cu',

    // Supabase Credentials
    'SUPABASE_URL' => 'https://hmszskmpzfmtayhppuws.supabase.co',
    'SUPABASE_ANON_KEY' => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhtc3pza21wemZtdGF5aHBwdXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjUzMDIsImV4cCI6MjA5ODI0MTMwMn0.rcp7dPVUu0asaof4jfpy-pHeg6jUnL8PG21vIazbzxM_supabase_anon_key_here',
    'SUPABASE_JWT_SECRET' => '4jmVD8EBtw9HNZ4F+9qcFszQ2BjzNYNy/hMr9N+8zXuQkn+6YfJK0tEg9mbjErdgTvuuHUVPer5ysy6LWuyKfQ==', // Used to verify Supabase Auth JWT tokens in PHP
    'SUPABASE_STORAGE_BUCKET' => 'slips',
];
