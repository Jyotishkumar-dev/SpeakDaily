const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing required Supabase environment variables');
  process.exit(1);
}

// Public client — uses the anon (publishable) key.
// Safe for client-context operations that respect RLS.
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — uses the service role key.
// Bypasses RLS; use only for server-side admin operations (e.g. fetching topics).
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

// Scoped client helper: forwards the user's JWT from the request Authorization header
// so that PostgreSQL RLS policies correctly identify auth.uid()
function getScopedClient(req) {
  if (supabaseAdmin) return supabaseAdmin;
  const authHeader = req?.headers?.authorization;
  if (authHeader) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabase;
}

module.exports = { supabase, supabaseAdmin, getScopedClient };
