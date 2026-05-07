import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'models/gemini-embedding-2-preview' });

const cosineSimilarity = (vecA, vecB) => {
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
    const embeddings = [];
    for (const text of texts) {
        const result = await model.embedContent({
            content: { parts: [{ text }], role: 'user' },
            taskType: 'SEMANTIC_SIMILARITY',
            outputDimensionality: 3072
        });
        embeddings.push(result.embedding.values);
    }
    
    console.log("Vector length:", embeddings[0].length);
    console.log("Cosine Similarity (Senior DS vs Intern):", cosineSimilarity(embeddings[0], embeddings[1]));
    console.log("Cosine Similarity (Senior DS vs Lead DS):", cosineSimilarity(embeddings[0], embeddings[2]));
}

test().catch(console.error);
