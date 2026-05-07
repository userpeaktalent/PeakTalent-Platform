const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI('AIzaSyDS9GBKbZMvEnUTWtjQT7fCDiSatdoDY6U');
const model = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' });

const supabase = createClient('https://xcqzhoietkrlwcczgjiu.supabase.co', 'sb_publishable_Kg3qg9gHBlqx0EPJodHMVg_kVtjA6wK');

async function getEmbedding(text) {
    const result = await model.embedContent({
        content: { parts: [{ text }], role: 'user' },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: 3072,
    });
    return Array.from(result.embedding.values).slice(0, 3072);
}

async function fix() {
    const { data: dbData } = await supabase.rpc('get_debug_data');
    const candidates = dbData.candidates || [];

    for (const c of candidates) {
        if (!c.content.embedding_vector) {
            console.log('Generating embedding for candidate:', c.content.personal_info?.first_name || c.id);
            const title = c.content.current_job_title || 'Software Engineer';
            const city = c.content.residence?.city || 'Unknown';
            const textToEmbed = "Candidate Title: " + title + " | City: " + city;

            try {
                const vector = await getEmbedding(textToEmbed);

                c.content.embedding_vector = vector;
                c.content.embedding_input_hash = 'test-hash-123';
                c.content.embedding_version = 3;
                c.content.embedding_model = 'models/gemini-embedding-001';
                c.content.embedding_updated_at = new Date().toISOString();

                const { error } = await supabase.rpc('update_debug_entity', { p_type: 'candidate', p_id: c.id, p_content: c.content });
                if (error) console.error('Error updating:', c.id, error);
                else console.log('Successfully updated candidate with vector! ID:', c.id);
            } catch (e) { console.error(e); }
        } else {
            console.log('Candidate already has vector:', c.content.personal_info?.first_name || c.id);
        }
    }
}
fix();
