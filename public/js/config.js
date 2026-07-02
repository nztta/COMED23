// public/js/config.js

// Supabase and Custom API Configurations
const CONFIG = {
    // Supabase Credentials (for Auth and Storage JS SDK client integration)
    SUPABASE_URL: window.env?.SUPABASE_URL || 'https://hmszskmpzfmtayhppuws.supabase.co',
    SUPABASE_ANON_KEY: window.env?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhtc3pza21wemZtdGF5aHBwdXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjUzMDIsImV4cCI6MjA5ODI0MTMwMn0.rcp7dPVUu0asaof4jfpy-pHeg6jUnL8PG21vIazbzxM',

    // PHP API Base Endpoint (Relative path to direct backend files)
    API_BASE_URL: 'api',

    // UI Constants
    MAX_UPLOAD_SIZE_MB: 5,
    ALLOWED_MIME_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
};
