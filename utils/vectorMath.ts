
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
      return 0;
    }

    // Compare on shared prefix so legacy mixed-dimension vectors (e.g. 768 vs 3072)
    // do not collapse semantic similarity to zero.
    const dims = Math.min(vecA.length, vecB.length);

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < dims; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    const magnitudeA = Math.sqrt(normA);
    const magnitudeB = Math.sqrt(normB);
    
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
  };
  
