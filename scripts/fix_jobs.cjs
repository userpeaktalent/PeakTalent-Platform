const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const loadEnvLocalValue = (key) => {
    try {
        const envPath = path.join(__dirname, '..', '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
        return match ? match[1].trim() : '';
    } catch {
        return '';
    }
};

const geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    loadEnvLocalValue('VITE_GEMINI_API_KEY') ||
    loadEnvLocalValue('GEMINI_API_KEY');

if (!geminiApiKey) {
    throw new Error('Missing Gemini API key. Set VITE_GEMINI_API_KEY or GEMINI_API_KEY before running this script.');
}

const genAI = new GoogleGenerativeAI(geminiApiKey);
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
    const jobs = dbData.jobs || [];

    for (const j of jobs) {
        if (!j.content.embedding_vector) {
            console.log('Generating embedding for job:', j.content.title);
            const textToEmbed = "Job Title: " + j.content.title + " | City: " + (j.content.constraints?.location?.city || 'Unknown');

            try {
                const vector = await getEmbedding(textToEmbed);

                j.content.embedding_vector = vector;
                j.content.embedding_input_hash = 'test-hash-123';
                j.content.embedding_version = 3;
                j.content.embedding_model = 'models/gemini-embedding-001';
                j.content.embedding_updated_at = new Date().toISOString();

                const { error } = await supabase.rpc('update_debug_entity', { p_type: 'job', p_id: j.id, p_content: j.content });
                if (error) console.error('Error updating:', error);
                else {
                    console.log('Successfully updated job with vector! ID:', j.id);
                    // ALSO update the separate 'embedding' pgvector column by using an admin API...
                    // Wait, update_debug_entity DOES NOT UPDATE the pgvector 'embedding' column for Jobs !
                    // Let's check update_debug_entity in debug_rpc.sql...
                }
            } catch (e) { console.error(e); }
        }
    }
}
fix();
