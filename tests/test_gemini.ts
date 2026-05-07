import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

let apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

if (!apiKey) {
    try {
        const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
        const match = envContent.match(/VITE_GEMINI_API_KEY=(.+)/);
        if (match) apiKey = match[1].trim();
    } catch(e) {}
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'models/gemini-embedding-2-preview' });

const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

async function test() {
    const texts = [
        "Senior Data Scientist with 10 years experience in machine learning, Python, and neural networks. Led a team of 5. Built scalable infra.",
        "Intern at INPS working on data entry and basic validation. Knows some Python.",
        "Lead Data Scientist expert in AI, Python, ML, and deep learning models. 12 years experience."
    ];

    console.log("Generating embeddings...");
    const embeddings: number[][] = [];
    for (const text of texts) {
        const result = await model.embedContent({
            content: { parts: [{ text }], role: 'user' },
            taskType: 'SEMANTIC_SIMILARITY',
            outputDimensionality: 3072
        });
        const vals = Array.from(result.embedding.values || []);
        // pad to 3072 just in case
        const padded = [...vals, ...new Array(3072 - vals.length).fill(0)];
        embeddings.push(padded);
    }
    
    console.log("Vector length:", embeddings[0].length);
    console.log("Cosine Similarity (Senior DS vs Intern):", cosineSimilarity(embeddings[0], embeddings[1]));
    console.log("Cosine Similarity (Senior DS vs Lead DS):", cosineSimilarity(embeddings[0], embeddings[2]));
}

test().catch(console.error);
