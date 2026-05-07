import { attachEmbeddingMetadata } from './services/embeddingService';

async function test() {
    const fakeJob = {
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
        console.log('Enriched keys:', Object.keys(enriched));
        console.log('Has vector?:', !!enriched.embedding_vector);
        if (enriched.embedding_vector) {
            console.log('Vector len:', enriched.embedding_vector.length);
        } else {
            console.log('Embedding vector is missing. Entity:', enriched);
        }
    } catch (e) {
        console.error('Error during attach:', e);
    }
}
test();
