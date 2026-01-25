import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

// Define the model type
let model: mobilenet.MobileNet | null = null;

export const OfflineAI = {
  // Load the model
  loadModel: async () => {
    if (!model) {
      console.log('Loading MobileNet model...');
      try {
        model = await mobilenet.load();
        console.log('MobileNet model loaded successfully');
      } catch (error) {
        console.error('Failed to load MobileNet model:', error);
      }
    }
    return model;
  },

  // Classify an image
  classifyImage: async (imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => {
    if (!model) {
      await OfflineAI.loadModel();
    }
    
    if (model) {
      const predictions = await model.classify(imageElement);
      return predictions;
    }
    return [];
  },

  // Analyze water quality based on visual turbidity/color (Heuristic)
  analyzeWaterQuality: (canvas: HTMLCanvasElement): 'Clear' | 'Dirty' | 'Unknown' => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'Unknown';

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let r = 0, g = 0, b = 0;

    // Calculate average color
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    r = Math.floor(r / (data.length / 4));
    g = Math.floor(g / (data.length / 4));
    b = Math.floor(b / (data.length / 4));

    // Simple heuristic: Dark or very brown/green water is "Dirty"
    // This is a basic approximation for demo purposes
    const brightness = (r + g + b) / 3;
    
    // Check for brown/muddy tones (Red > Blue, Green > Blue)
    const isBrownish = r > b + 20 && g > b;
    
    if (brightness < 50 || (isBrownish && brightness < 150)) {
      return 'Dirty';
    }
    
    return 'Clear';
  },

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
