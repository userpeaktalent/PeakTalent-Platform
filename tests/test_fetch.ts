import { supabase } from './services/supabaseClient';

async function testFetch() {
    const candId = '593b632a-7c2b-4785-b524-bd9664a63d82';
    const { data } = await supabase.from('candidates').select('id, embedding').eq('id', candId);
    console.log("Found rows:", data?.length);
    console.log("Embeddings present?", data?.map(r => r.embedding ? 'Yes' : 'No'));
}

testFetch();
