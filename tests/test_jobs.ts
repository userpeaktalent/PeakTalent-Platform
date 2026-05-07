import { supabase } from './src/services/supabaseClient'; // need to fix paths maybe
// Wait, the project structure is:
// peaktalent/services/supabaseClient.ts
import { supabase } from './services/supabaseClient';
import { addJob } from './services/dbService';

async function test() {
    try {
        console.log("Testing supabase auth and job insertion...");
        const { data, error } = await supabase.from('jobs').select('*').limit(1);
        console.log("Jobs check:", data, error);
    } catch (e) {
        console.error("Test failed", e);
    }
}
test();
