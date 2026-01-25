export const OfflineAI = {
  // Analyze urgency based on keywords (Heuristic)
  analyzeUrgency: (text: string): 'Normal' | 'High' | 'Critical' => {
    const lowerText = text.toLowerCase();

    const criticalKeywords = ['cholera', 'dead', 'dying', 'outbreak', 'emergency', 'blood', 'severe', 'critical'];
    const highKeywords = ['sick', 'vomit', 'diarrhea', 'broken', 'leak', 'contaminated', 'urgent', 'fail'];

    if (criticalKeywords.some(k => lowerText.includes(k))) return 'Critical';
    if (highKeywords.some(k => lowerText.includes(k))) return 'High';

    return 'Normal';
  }
};
