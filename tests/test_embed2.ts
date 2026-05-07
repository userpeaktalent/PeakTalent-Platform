import fs from 'fs';
import path from 'path';
import { attachEmbeddingMetadata } from './services/embeddingService';

function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        const envFile = fs.readFileSync(envPath, 'utf-8');
        for (const line of envFile.split('\n')) {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                let val = match[2] || '';
                val = val.replace(/^['"](.*)['"]$/, '$1'); // trim quotes
                process.env[match[1]] = val;
            }
        }
    } catch (e) { console.error('No .env.local found'); }
}

async function test() {
    loadEnv();
    console.log('API Key available:', !!process.env.GEMINI_API_KEY);
    const fakeJob = {
        id: 'test-node-job',
        title: 'Test Engineer',
        industry: 'Tech',
        job_function: 'QA',
        seniority_level: 'mid',
        summary_text: 'Test job for QA testing',
        skills: [{ skill_name: 'Testing', level: 5 }],
        it_skills: [],
        soft_skills: []
    };

    console.log('Attaching metadata...');
    try {
        const enriched = await attachEmbeddingMetadata(fakeJob as any, 'job');
        console.log('Has vector?:', !!enriched.embedding_vector);
        if (enriched.embedding_vector) {
            console.log('Vector len:', enriched.embedding_vector.length);
        } else {
            console.log('Embedding vector is missing.');
        }
    } catch (e) {
        console.error('Error during attach:', e);
    }
}
test();
