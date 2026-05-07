import { generateEmbedding } from './services/geminiService';
import { cosineSimilarity } from './utils/vectorMath';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const text1 = "Senior Data Scientist with 10 years experience in machine learning, Python, and neural networks.";
    const text2 = "Intern at INPS working on data entry and basic validation.";
    const text3 = "Lead Data Scientist expert in AI, Python, ML, and deep learning models.";

    console.log("Generating embeddings...");
    const emb1 = await generateEmbedding(text1);
    const emb2 = await generateEmbedding(text2);
    const emb3 = await generateEmbedding(text3);

    console.log(`Length: ${emb1.length}`);

    const sim1_2 = cosineSimilarity(emb1, emb2);
    const sim1_3 = cosineSimilarity(emb1, emb3);

    console.log(`Cosine Similarity (Senior DS vs Intern): ${sim1_2}`);
    console.log(`Cosine Similarity (Senior DS vs Lead DS): ${sim1_3}`);
}

run().catch(console.error);
