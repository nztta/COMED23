// public/js/auth.js

// Initialize Supabase Client
let supabaseClient = null;

function getSupabaseClient() {
    if (!supabaseClient) {
        if (typeof supabase === 'undefined') {
            console.error('Supabase library not loaded. Make sure script CDN is included.');
            return null;
        }
        supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

/**
 * Perform sign in using Supabase Auth.
 */
async function signIn(email, password) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    // Store access token in localStorage for easy API access
    if (data.session) {
        localStorage.setItem('sb_access_token', data.session.access_token);
    }
    return data;
}

/**
 * Perform sign out.
 */
async function signOut() {
    const client = getSupabaseClient();
    if (!client) return;

    localStorage.removeItem('sb_access_token');
    await client.auth.signOut();
    window.location.href = 'index.html';
}

/**
 * Fetch authentication header helper for PHP API calls.
 */
function getAuthHeaders() {
    const token = localStorage.getItem('sb_access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

/**
 * Check if user is logged in, redirect if not.
 * Returns user profile metadata.
 */
async function checkAuthState(redirectOnFail = true) {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data: { session }, error } = await client.auth.getSession();
    
    if (error || !session) {
        localStorage.removeItem('sb_access_token');
        if (redirectOnFail) {
            window.location.href = 'index.html';
        }
        return null;
    }

    // Refresh token cache
    localStorage.setItem('sb_access_token', session.access_token);
    
    // Fetch profile role from local PHP API
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth.php`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });
        
        if (response.status === 401 || response.status === 403) {
            if (redirectOnFail) {
                alert('Access denied. You do not have permissions to access the dashboard.');
                await signOut();
            }
            return null;
        }

        const result = await response.json();
        if (result.status === 'success') {
            localStorage.setItem('user_role', result.data.role);
        } else {
            if (redirectOnFail) {
                alert('Access denied. Role synchronization failed.');
                await signOut();
            }
            return null;
        }
    } catch (e) {
        console.warn('Could not sync user with backend:', e);
    }

    return session.user;
}
