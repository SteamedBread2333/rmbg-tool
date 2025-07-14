import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime environment
async function configureOrtEnvironment() {
  ort.env.wasm.wasmPaths = '/src/wasm/';
  ort.env.wasm.numThreads = 4;
  ort.env.wasm.simd = true;
  
  try {
    ort.env.logLevel = 'warning';
    console.log('ONNX Runtime configured successfully');
  } catch (error) {
    console.warn('ONNX Runtime configuration warning:', error);
  }
}

// Initialize ONNX Runtime
configureOrtEnvironment();

// Load diffusion model
export async function loadDiffusionModel() {
  try {
    console.log('Loading Stable Diffusion XL model...');
    
    const modelPath = '/stable-diffusion-xl-base-1.0-unet.onnx';
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
    
    console.log('Model loaded successfully');
    console.log('Input names:', session.inputNames);
    console.log('Output names:', session.outputNames);
    
    return session;
  } catch (error) {
    console.error('Failed to load diffusion model:', error);
    throw new Error('Model loading failed: ' + error.message);
  }
}

// API Configuration
const API_CONFIG = {
  huggingface: {
    url: 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
    headers: {
      'Authorization': 'Bearer YOUR_HF_TOKEN',
      'Content-Type': 'application/json'
    }
  },
  replicate: {
    url: 'https://api.replicate.com/v1/predictions',
    headers: {
      'Authorization': 'Token YOUR_REPLICATE_TOKEN',
      'Content-Type': 'application/json'
    }
  },
  stability: {
    url: 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
    headers: {
      'Authorization': 'Bearer YOUR_STABILITY_TOKEN',
      'Content-Type': 'application/json'
    }
  }
};

// API Key Manager
class APIKeyManager {
  constructor() {
    this.keys = this.loadKeys();
  }

  loadKeys() {
    try {
      return JSON.parse(localStorage.getItem('ai_api_keys') || '{}');
    } catch {
      return {};
    }
  }

  saveKeys() {
    localStorage.setItem('ai_api_keys', JSON.stringify(this.keys));
  }

  setKey(provider, key) {
    this.keys[provider] = key;
    this.saveKeys();
  }

  getKey(provider) {
    return this.keys[provider];
  }

  hasKey(provider) {
    return !!this.keys[provider];
  }
}

const apiKeyManager = new APIKeyManager();

// Hugging Face API call
async function generateImageWithHuggingFace(prompt, options = {}) {
  const apiKey = apiKeyManager.getKey('huggingface');
  if (!apiKey) {
    throw new Error('Please set Hugging Face API key first');
  }

  const response = await fetch(API_CONFIG.huggingface.url, {
    method: 'POST',
    headers: {
      ...API_CONFIG.huggingface.headers,
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        num_inference_steps: options.steps || 30,
        guidance_scale: options.guidance_scale || 7.5,
        width: options.width || 1024,
        height: options.height || 1024,
        ...options
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Hugging Face API error: ${error.error || response.statusText}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// Replicate API call
async function generateImageWithReplicate(prompt, options = {}) {
  const apiKey = apiKeyManager.getKey('replicate');
  if (!apiKey) {
    throw new Error('Please set Replicate API key first');
  }

  const response = await fetch(API_CONFIG.replicate.url, {
    method: 'POST',
    headers: {
      ...API_CONFIG.replicate.headers,
      'Authorization': `Token ${apiKey}`
    },
    body: JSON.stringify({
      version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      input: {
        prompt: prompt,
        num_inference_steps: options.steps || 30,
        guidance_scale: options.guidance_scale || 7.5,
        width: options.width || 1024,
        height: options.height || 1024,
        ...options
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Replicate API error: ${error.detail || response.statusText}`);
  }

  const prediction = await response.json();
  return await pollReplicateResult(prediction.id, apiKey);
}

async function pollReplicateResult(predictionId, apiKey) {
  const maxAttempts = 60;
  const pollInterval = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to poll Replicate result');
    }

    const result = await response.json();
    
    if (result.status === 'succeeded') {
      return result.output[0];
    } else if (result.status === 'failed') {
      throw new Error(`Image generation failed: ${result.error}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Image generation timeout');
}

// Stability AI API call
async function generateImageWithStability(prompt, options = {}) {
  const apiKey = apiKeyManager.getKey('stability');
  if (!apiKey) {
    throw new Error('Please set Stability AI API key first');
  }

  const response = await fetch(API_CONFIG.stability.url, {
    method: 'POST',
    headers: {
      ...API_CONFIG.stability.headers,
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      text_prompts: [
        {
          text: prompt,
          weight: 1
        }
      ],
      cfg_scale: options.guidance_scale || 7.5,
      steps: options.steps || 30,
      width: options.width || 1024,
      height: options.height || 1024,
      samples: 1,
      ...options
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Stability AI API error: ${error.message || response.statusText}`);
  }

  const result = await response.json();
  
  const base64Data = result.artifacts[0].base64;
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/png' });
  
  return URL.createObjectURL(blob);
}

// Main image generation function with API support
async function generateImageWithAPI(prompt, provider = 'huggingface', options = {}) {
  try {
    switch (provider) {
      case 'huggingface':
        return await generateImageWithHuggingFace(prompt, options);
      case 'replicate':
        return await generateImageWithReplicate(prompt, options);
      case 'stability':
        return await generateImageWithStability(prompt, options);
      default:
        throw new Error(`Unsupported API provider: ${provider}`);
    }
  } catch (error) {
    console.error(`API generation failed, falling back to local generation:`, error);
    return await generateSimpleImage(prompt, options.width || 1024, options.height || 1024);
  }
}

// Local image generation for demo purposes
export async function generateSimpleImage(prompt, width = 1024, height = 1024) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('dog') || lowerPrompt.includes('puppy')) {
      generateDogImage(ctx);
    } else if (lowerPrompt.includes('cat') || lowerPrompt.includes('kitten')) {
      generateCatImage(ctx);
    } else if (lowerPrompt.includes('sunset') || lowerPrompt.includes('sky')) {
      generateSunsetImage(ctx);
    } else if (lowerPrompt.includes('mountain') || lowerPrompt.includes('landscape')) {
      generateMountainImage(ctx);
    } else if (lowerPrompt.includes('flower') || lowerPrompt.includes('garden')) {
      generateFlowerImage(ctx);
    } else if (lowerPrompt.includes('city') || lowerPrompt.includes('building')) {
      generateCityImage(ctx);
    } else if (lowerPrompt.includes('person') || lowerPrompt.includes('human')) {
      generatePersonImage(ctx);
    } else if (lowerPrompt.includes('car') || lowerPrompt.includes('vehicle')) {
      generateCarImage(ctx);
    } else if (lowerPrompt.includes('tree') || lowerPrompt.includes('forest')) {
      generateTreeImage(ctx);
    } else if (lowerPrompt.includes('house') || lowerPrompt.includes('home')) {
      generateHouseImage(ctx);
    } else if (lowerPrompt.includes('bird') || lowerPrompt.includes('eagle')) {
      generateBirdImage(ctx);
    } else if (lowerPrompt.includes('fish') || lowerPrompt.includes('ocean')) {
      generateFishImage(ctx);
    } else if (lowerPrompt.includes('star') || lowerPrompt.includes('night')) {
      generateStarryImage(ctx);
    } else if (lowerPrompt.includes('food') || lowerPrompt.includes('meal')) {
      generateFoodImage(ctx, prompt);
    } else if (lowerPrompt.includes('robot') || lowerPrompt.includes('machine')) {
      generateRobotImage(ctx);
    } else {
      generateGenericScene(ctx);
    }
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, height - 60, width, 60);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Generated from: "${prompt}"`, width / 2, height - 30);
    ctx.fillText('Demo Mode - Use API keys for AI generation', width / 2, height - 10);
    
    setTimeout(() => {
      resolve(canvas.toDataURL('image/png'));
    }, 1500);
  });
}

function generateDogImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#98FB98');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  
  ctx.fillStyle = '#D2691E';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.6, 80, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.ellipse(width * 0.4, height * 0.5, 25, 35, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.6, height * 0.5, 25, 35, 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(width * 0.47, height * 0.55, 3, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.53, height * 0.55, 3, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.6, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.65, 8, 0, Math.PI);
  ctx.stroke();
}

function generateCatImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#FFB6C1');
  gradient.addColorStop(1, '#FFF0F5');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(0, height * 0.8, width, height * 0.2);
  
  ctx.fillStyle = '#696969';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.6, 70, 55, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#696969';
  ctx.beginPath();
  ctx.moveTo(width * 0.45, height * 0.45);
  ctx.lineTo(width * 0.42, height * 0.35);
  ctx.lineTo(width * 0.48, height * 0.4);
  ctx.closePath();
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(width * 0.55, height * 0.45);
  ctx.lineTo(width * 0.58, height * 0.35);
  ctx.lineTo(width * 0.52, height * 0.4);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#32CD32';
  ctx.beginPath();
  ctx.ellipse(width * 0.46, height * 0.55, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.54, height * 0.55, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FFB6C1';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.6, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(width * 0.5 + (i - 2.5) * 15, height * 0.65);
    ctx.lineTo(width * 0.5 + (i - 2.5) * 20, height * 0.7);
    ctx.stroke();
  }
}

function generateSunsetImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#FF6B35');
  gradient.addColorStop(0.3, '#F7931E');
  gradient.addColorStop(0.6, '#FFD700');
  gradient.addColorStop(1, '#FF8C00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#FF4500';
  ctx.beginPath();
  ctx.arc(width * 0.7, height * 0.3, 60, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.6);
  ctx.lineTo(width * 0.3, height * 0.4);
  ctx.lineTo(width * 0.7, height * 0.5);
  ctx.lineTo(width, height * 0.3);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(width * (0.2 + i * 0.15), height * (0.2 + i * 0.05), 40 + i * 10, 20 + i * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateMountainImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#8B7355';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width * 0.2, height * 0.3);
  ctx.lineTo(width * 0.4, height * 0.5);
  ctx.lineTo(width * 0.6, height * 0.2);
  ctx.lineTo(width * 0.8, height * 0.4);
  ctx.lineTo(width, height * 0.3);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(width * 0.55, height * 0.2);
  ctx.lineTo(width * 0.65, height * 0.2);
  ctx.lineTo(width * 0.6, height * 0.15);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  
  ctx.fillStyle = '#32CD32';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * width;
    const y = height * 0.7 + Math.random() * height * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 3 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateFlowerImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#98FB98');
  gradient.addColorStop(1, '#90EE90');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  const colors = ['#FF69B4', '#FF1493', '#FFB6C1', '#FFC0CB', '#FF6347'];
  
  for (let i = 0; i < 8; i++) {
    const x = width * 0.2 + Math.random() * width * 0.6;
    const y = height * 0.3 + Math.random() * height * 0.4;
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    ctx.fillStyle = '#228B22';
    ctx.fillRect(x - 2, y, 4, height * 0.3);
    
    ctx.fillStyle = color;
    for (let j = 0; j < 8; j++) {
      const angle = (j / 8) * Math.PI * 2;
      const petalX = x + Math.cos(angle) * 20;
      const petalY = y + Math.sin(angle) * 20;
      ctx.beginPath();
      ctx.ellipse(petalX, petalY, 15, 8, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateCityImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#191970');
  gradient.addColorStop(1, '#4B0082');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  const buildingColors = ['#696969', '#778899', '#2F4F4F', '#708090'];
  
  for (let i = 0; i < 12; i++) {
    const buildingWidth = 40 + Math.random() * 60;
    const buildingHeight = 100 + Math.random() * 200;
    const x = i * (width / 12);
    const y = height - buildingHeight;
    
    ctx.fillStyle = buildingColors[Math.floor(Math.random() * buildingColors.length)];
    ctx.fillRect(x, y, buildingWidth, buildingHeight);
    
    ctx.fillStyle = '#FFD700';
    for (let j = 0; j < Math.floor(buildingHeight / 30); j++) {
      for (let k = 0; k < Math.floor(buildingWidth / 15); k++) {
        if (Math.random() > 0.7) {
          ctx.fillRect(x + k * 15 + 3, y + j * 30 + 3, 8, 8);
        }
      }
    }
  }
  
  ctx.fillStyle = '#FFD700';
  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height * 0.3, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}



function generatePersonImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#F5DEB3';
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.3, 40, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.25, 45, 20, 0, 0, Math.PI);
  ctx.fill();
  
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(width * 0.46, height * 0.28, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.54, height * 0.28, 3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.35, 5, 0, Math.PI);
  ctx.stroke();
  
  ctx.fillStyle = '#4169E1';
  ctx.fillRect(width * 0.42, height * 0.4, 16, 30);
  
  ctx.fillStyle = '#F5DEB3';
  ctx.beginPath();
  ctx.arc(width * 0.38, height * 0.45, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.62, height * 0.45, 8, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#000080';
  ctx.fillRect(width * 0.45, height * 0.7, 10, 20);
  
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(width * 0.44, height * 0.9, 12, 8);
}

function generateCarImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#696969';
  ctx.fillRect(0, height * 0.8, width, height * 0.2);
  
  ctx.fillStyle = '#FF0000';
  ctx.fillRect(width * 0.3, height * 0.5, 120, 40);
  
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(width * 0.35, height * 0.45, 50, 20);
  
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(width * 0.37, height * 0.47, 20, 12);
  ctx.fillRect(width * 0.6, height * 0.47, 20, 12);
  
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(width * 0.35, height * 0.7, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.65, height * 0.7, 15, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#C0C0C0';
  ctx.beginPath();
  ctx.arc(width * 0.35, height * 0.7, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.65, height * 0.7, 8, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(width * 0.28, height * 0.55, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.72, height * 0.55, 5, 0, Math.PI * 2);
  ctx.fill();
}

function generateTreeImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, height * 0.8, width, height * 0.2);
  
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(width * 0.48, height * 0.4, 20, height * 0.4);
  
  ctx.fillStyle = '#228B22';
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.3, 60, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#32CD32';
  ctx.beginPath();
  ctx.arc(width * 0.45, height * 0.25, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.55, height * 0.25, 40, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FF69B4';
  for (let i = 0; i < 10; i++) {
    const x = width * 0.4 + Math.random() * width * 0.2;
    const y = height * 0.2 + Math.random() * height * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateHouseImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(width * 0.3, height * 0.4, 160, 120);
  
  ctx.fillStyle = '#DC143C';
  ctx.beginPath();
  ctx.moveTo(width * 0.25, height * 0.4);
  ctx.lineTo(width * 0.5, height * 0.25);
  ctx.lineTo(width * 0.75, height * 0.4);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#654321';
  ctx.fillRect(width * 0.42, height * 0.48, 30, 50);
  
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(width * 0.35, height * 0.45, 20, 15);
  ctx.fillRect(width * 0.6, height * 0.45, 20, 15);
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.35, height * 0.525);
  ctx.lineTo(width * 0.55, height * 0.525);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width * 0.45, height * 0.45);
  ctx.lineTo(width * 0.45, height * 0.6);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(width * 0.6, height * 0.525);
  ctx.lineTo(width * 0.8, height * 0.525);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width * 0.7, height * 0.45);
  ctx.lineTo(width * 0.7, height * 0.6);
  ctx.stroke();
  
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(width * 0.45, height * 0.52, 2, 0, Math.PI * 2);
  ctx.fill();
}

function generateBirdImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.ellipse(width * (0.1 + i * 0.1), height * (0.2 + i * 0.05), 30 + i * 5, 15 + i * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(width * 0.1, height * 0.8, 30, 10);
  
  ctx.fillStyle = '#4169E1';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.5, 40, 25, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#4169E1';
  ctx.beginPath();
  ctx.ellipse(width * 0.45, height * 0.5, 30, 15, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.55, height * 0.5, 30, 15, 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(width * 0.48, height * 0.47, 3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(width * 0.52, height * 0.5);
  ctx.lineTo(width * 0.57, height * 0.52);
  ctx.lineTo(width * 0.52, height * 0.54);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#FF4500';
  ctx.fillRect(width * 0.47, height * 0.6, 6, 15);
  ctx.fillRect(width * 0.51, height * 0.6, 6, 15);
  
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(width * 0.46, height * 0.75, 8, 3);
  ctx.fillRect(width * 0.5, height * 0.75, 8, 3);
}

function generateFishImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#4682B4');
  gradient.addColorStop(1, '#191970');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.fillStyle = '#228B22';
  ctx.fillRect(width * 0.1, height * 0.8, 15, 80);
  ctx.fillRect(width * 0.8, height * 0.7, 12, 100);
  
  ctx.fillStyle = '#32CD32';
  ctx.beginPath();
  ctx.ellipse(width * 0.175, height * 0.75, 20, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.86, height * 0.65, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FF6347';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.5, 60, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FF4500';
  ctx.beginPath();
  ctx.moveTo(width * 0.41, height * 0.5);
  ctx.lineTo(width * 0.3, height * 0.45);
  ctx.lineTo(width * 0.3, height * 0.55);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(width * 0.53, height * 0.47, 4, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(width * 0.59, height * 0.5);
  ctx.lineTo(width * 0.7, height * 0.45);
  ctx.lineTo(width * 0.7, height * 0.55);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#FF6347';
  ctx.beginPath();
  ctx.moveTo(width * 0.52, height * 0.4);
  ctx.lineTo(width * 0.48, height * 0.3);
  ctx.lineTo(width * 0.56, height * 0.3);
  ctx.closePath();
  ctx.fill();
}

function generateStarryImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#000428');
  gradient.addColorStop(1, '#004e92');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#FFD700';
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height * 0.7;
    const size = Math.random() * 3 + 1;
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.fillStyle = '#FFFF00';
  const moonX = width * 0.8;
  const moonY = height * 0.2;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 40, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#000428';
  ctx.beginPath();
  ctx.arc(moonX - 15, moonY - 10, 35, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#2F4F4F';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.7);
  ctx.lineTo(width * 0.3, height * 0.5);
  ctx.lineTo(width * 0.7, height * 0.6);
  ctx.lineTo(width, height * 0.4);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#228B22';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * width;
    const y = height * 0.6 + Math.random() * height * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, 2 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateFoodImage(ctx, prompt) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#FFF8DC');
  gradient.addColorStop(1, '#F5DEB3');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.6, 120, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  
  if (prompt.toLowerCase().includes('pizza')) {
    ctx.fillStyle = '#DAA520';
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, 80, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FF6347';
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, 70, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFFF00';
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = width * 0.5 + Math.cos(angle) * 40;
      const y = height * 0.5 + Math.sin(angle) * 40;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, 60, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#32CD32';
    ctx.beginPath();
    ctx.arc(width * 0.45, height * 0.45, 15, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FF6347';
    ctx.beginPath();
    ctx.arc(width * 0.55, height * 0.45, 12, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.55, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

function generateRobotImage(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#2F4F4F');
  gradient.addColorStop(1, '#696969');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#C0C0C0';
  ctx.fillRect(width * 0.4, height * 0.3, 80, 60);
  
  ctx.fillStyle = '#00FF00';
  ctx.beginPath();
  ctx.arc(width * 0.45, height * 0.4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.55, height * 0.4, 8, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FF0000';
  ctx.fillRect(width * 0.47, height * 0.5, 6, 3);
  
  ctx.fillStyle = '#C0C0C0';
  ctx.fillRect(width * 0.42, height * 0.4, 56, 40);
  
  ctx.fillStyle = '#808080';
  ctx.fillRect(width * 0.35, height * 0.45, 20, 30);
  ctx.fillRect(width * 0.65, height * 0.45, 20, 30);
  
  ctx.fillStyle = '#C0C0C0';
  ctx.fillRect(width * 0.45, height * 0.6, 30, 50);
  
  ctx.fillStyle = '#808080';
  ctx.fillRect(width * 0.42, height * 0.75, 10, 25);
  ctx.fillRect(width * 0.68, height * 0.75, 10, 25);
  
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.25, 5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.25);
  ctx.lineTo(width * 0.5, height * 0.15);
  ctx.stroke();
}

function generateGenericScene(ctx) {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(width * 0.8, height * 0.2, 40, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(width * (0.2 + i * 0.15), height * (0.3 + i * 0.05), 40 + i * 10, 20 + i * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Main image generation function
export async function generateImage(prompt, width = 1024, height = 1024, options = {}) {
  try {
    const availableProviders = ['huggingface', 'replicate', 'stability']
      .filter(provider => apiKeyManager.hasKey(provider));

    if (availableProviders.length > 0) {
      const provider = options.provider || availableProviders[0];
      console.log(`Using ${provider} API to generate image...`);
      return await generateImageWithAPI(prompt, provider, { 
        width, 
        height, 
        steps: 30,
        guidance_scale: 7.5,
        ...options 
      });
    } else {
      console.log('No API keys available, using local generation...');
      return await generateSimpleImage(prompt, width, height);
    }
  } catch (error) {
    console.error('Image generation failed:', error);
    return await generateSimpleImage(prompt, width, height);
  }
}

export { apiKeyManager }; 