// public/js/config.js

// Supabase and Custom API Configurations
const CONFIG = {
    // Supabase Credentials (for Auth and Storage JS SDK client integration)
    SUPABASE_URL: window.env?.SUPABASE_URL || 'https://xxxx.supabase.co',
    SUPABASE_ANON_KEY: window.env?.SUPABASE_ANON_KEY || 'your_supabase_anon_key_here',
    
    // PHP API Base Endpoint (Relative path to direct backend files)
    API_BASE_URL: './api',
    
    // UI Constants
    MAX_UPLOAD_SIZE_MB: 5,
    ALLOWED_MIME_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
};
