const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check your .env file (see .env.example).'
  );
}

// service_role key is used here because this client only ever runs on the server.
// Never send this key to the browser/frontend.
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
});

// signInWithPassword/signUp/refreshSession mutate the calling client's
// internal session, which then gets used as the auth header for that
// client's subsequent .from()/.rpc() calls -- overriding the service_role
// key. Since `supabase` above is a long-lived singleton shared by every
// request in a warm serverless instance, ever calling those methods on it
// would silently downgrade EVERY later query on that instance (for every
// user, on every table) from service_role to whichever session logged in
// last, which is catastrophic under RLS. Auth flows that establish a
// session must use a throwaway client instead; see authController.js.
function createSessionClient() {
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

module.exports = supabase;
module.exports.createSessionClient = createSessionClient;
