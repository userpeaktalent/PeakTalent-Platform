import { supabase } from './services/supabaseClient';

async function testRPC() {
    try {
        console.log("Fetching a candidate...");
        const { data: cands, error: fetchErr } = await supabase.from('candidates').select('id, content').limit(1);
        
        if (fetchErr || !cands || cands.length === 0) {
            console.error("Failed to fetch candidate:", fetchErr);
            return;
        }

        let cand = cands[0].content;
        console.log("Candidate fetched:", cand.id);

        console.log("Testing update_debug_entity...");
        
        // Dummy modification
        cand.embedding_vector = Array(3072).fill(0.123);

        const { data: rpcData, error: rpcError } = await supabase.rpc('update_debug_entity', {
            p_type: 'candidate',
            p_id: cand.id,
            p_content: cand
        });

        console.log("RPC Result:", rpcData);
        if (rpcError) console.error("RPC Error:", rpcError);

        const { data: verify, error: vErr } = await supabase
            .from('candidates')
            .select('embedding')
            .eq('id', cand.id)
            .limit(1);
        
        console.log("Verify Result:", verify);
        if (vErr) console.error("Verify Error:", vErr);

    } catch (e) {
        console.error("Test failed:", e);
    }
}

testRPC();
