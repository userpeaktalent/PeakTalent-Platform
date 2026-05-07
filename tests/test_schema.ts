import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
// Needs service role key to do DDL, but usually if RLS is off or if it's local dev, maybe we can run RPC?
// Wait, we can't do DDL (create table) with Anon key!

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing supabase credentials from .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    // See if we can query applications
    const { data: apps, error: appsErr } = await supabase.from('applications').select('id').limit(1);
    console.log("Apps table check:", appsErr ? appsErr.message : "Exists");

    // Check if job_invitations exists
    const { data: invs, error: invsErr } = await supabase.from('job_invitations').select('id').limit(1);
    console.log("Invitations table check:", invsErr ? invsErr.message : "Exists");
}

run();
