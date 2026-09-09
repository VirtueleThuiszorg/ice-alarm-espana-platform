// Hand-maintained. This file's header used to read "automatically generated, do not edit it
// directly" — a leftover from the Lovable era. It has not been generated for a long time (the
// `auth` options below were written by hand), and it now carries a real decision, so the stale
// warning is worse than no warning: it tells the next reader not to touch the one line that
// decides how long a session lasts. `./types.ts` IS still generated.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

import { adoptExistingSession, authStorage } from '@/lib/authStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// BEFORE the client is built, so it runs before anything reads a token: everybody signed in
// today is signed in through localStorage with no preference recorded, and an absent preference
// must not be read as "throw that session away". See `authStorage.ts`.
adoptExistingSession();

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    /**
     * NOT `localStorage`. A "Keep me signed in on this device" checkbox chooses per login
     * between `localStorage` (survives the browser closing) and `sessionStorage` (does not, and
     * never reaches the disk of a shared call-centre machine). The adapter reads that choice on
     * every call, because this client is constructed at import time — long before anybody has
     * ticked anything.
     */
    storage: authStorage as never,
    /**
     * Both stay TRUE, and together they are why no timer is needed. Supabase keeps the session
     * and refreshes the access token on its own, so a signed-in user stays signed in until the
     * browser closes or they sign out — which is the whole requirement.
     */
    persistSession: true,
    autoRefreshToken: true,
  }
});
