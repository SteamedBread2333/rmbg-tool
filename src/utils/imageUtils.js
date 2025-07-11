import * as ort from 'onnxruntime-web';
import wasmSimdThreadedUrl from '../wasm/ort-wasm-simd-threaded.mjs?url';

// Extract WASM file directory path
const wasmDir = wasmSimdThreadedUrl.substring(0, wasmSimdThreadedUrl.lastIndexOf('/') + 1);

// Configure ONNX runtime environment
async function configureOrtEnvironment() {
  try {
    // Set WASM path and optimization configuration
    ort.env.wasm.wasmPaths = wasmDir;
    ort.env.logLevel = 'error';
    ort.env.debug = false;
    
    console.log('ONNX Runtime Web environment configuration completed');
    return true;
  } catch (error) {
    console.warn('ONNX environment configuration warning:', error);
    return false;
  }
}

// Image preprocessing: resize, normalize, and convert to tensor
export async function preprocessImage(imageElement, targetSize = 1024) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Keep width and height while maintaining aspect ratio
  let width = imageElement.width;
  let height = imageElement.height;
  const maxDim = Math.max(width, height);
  const scale = targetSize / maxDim;
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  canvas.width = width;
  canvas.height = height;
  
  // Set high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageElement, 0, 0, width, height);

  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = new Float32Array(3 * width * height);

  // RMBG model preprocessing: normalize to [0,1], then standardize
  // According to Hugging Face documentation, use mean 0.5 and standard deviation 1.0
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const pixelIndex = (i * width + j) * 4;
      
      // Extract RGB values and normalize to [0,1]
      const r = imageData.data[pixelIndex] / 255.0;
      const g = imageData.data[pixelIndex + 1] / 255.0;
      const b = imageData.data[pixelIndex + 2] / 255.0;
      
      // Standardization: (x - 0.5) / 1.0 = x - 0.5
      const tensorIndex = i * width + j;
      data[tensorIndex] = r - 0.5;                                    // R channel
      data[height * width + tensorIndex] = g - 0.5;                  // G channel  
      data[2 * height * width + tensorIndex] = b - 0.5;              // B channel
    }
  }

  return {
    tensor: new ort.Tensor('float32', data, [1, 3, height, width]),
    originalWidth: imageElement.width,
    originalHeight: imageElement.height,
    resizedWidth: width,
    resizedHeight: height
  };
}

// Postprocessing: convert model output to mask and composite with original image
export function postprocessResult(originalImage, maskTensor, resizedWidth, resizedHeight, originalWidth, originalHeight) {
  console.log('Starting postprocessing, mask tensor shape:', maskTensor.dims);
  console.log('Original image size:', originalWidth, 'x', originalHeight);
  console.log('Processed size:', resizedWidth, 'x', resizedHeight);
  
  // Get mask data
  const maskData = maskTensor.data;
  console.log('Mask data length:', maskData.length);
  
  // Calculate mask data range
  let minVal = maskData[0];
  let maxVal = maskData[0];
  for (let i = 1; i < maskData.length; i++) {
    if (maskData[i] < minVal) minVal = maskData[i];
    if (maskData[i] > maxVal) maxVal = maskData[i];
  }
  console.log('Mask data range:', minVal, 'to', maxVal);
  
  // Create mask canvas
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');
  maskCanvas.width = resizedWidth;
  maskCanvas.height = resizedHeight;
  
  // Create mask image data
  const maskImageData = maskCtx.createImageData(resizedWidth, resizedHeight);
  
  // Postprocess mask data
  // According to reference project, mask needs to be normalized
  for (let i = 0; i < resizedHeight; i++) {
    for (let j = 0; j < resizedWidth; j++) {
      const pixelIndex = i * resizedWidth + j;
      const maskValue = maskData[pixelIndex];
      
      // Normalize mask value to [0,1] range
      const normalizedValue = (maskValue - minVal) / (maxVal - minVal);
      
      // Create alpha channel
      const alpha = Math.round(normalizedValue * 255);
      
      const imageDataIndex = pixelIndex * 4;
      maskImageData.data[imageDataIndex] = 255;     // Red channel
      maskImageData.data[imageDataIndex + 1] = 255; // Green channel
      maskImageData.data[imageDataIndex + 2] = 255; // Blue channel
      maskImageData.data[imageDataIndex + 3] = alpha; // Alpha channel
    }
  }
  
  // Put the mask data to canvas
  maskCtx.putImageData(maskImageData, 0, 0);
  
  // Create result canvas
  const resultCanvas = document.createElement('canvas');
  const resultCtx = resultCanvas.getContext('2d');
  resultCanvas.width = originalWidth;
  resultCanvas.height = originalHeight;
  
  // Clear the result canvas with transparent background
  resultCtx.clearRect(0, 0, originalWidth, originalHeight);
  
  // Draw original image
  resultCtx.drawImage(originalImage, 0, 0, originalWidth, originalHeight);
  
  // Use mask to draw image - try a different approach
  resultCtx.globalCompositeOperation = 'destination-in';
  resultCtx.imageSmoothingEnabled = true;
  resultCtx.imageSmoothingQuality = 'high';
  
  // Calculate the exact scaling to maintain aspect ratio
  const scaleX = originalWidth / resizedWidth;
  const scaleY = originalHeight / resizedHeight;
  
  // Use the same scale for both dimensions to maintain aspect ratio
  const uniformScale = Math.min(scaleX, scaleY);
  const scaledMaskWidth = resizedWidth * uniformScale;
  const scaledMaskHeight = resizedHeight * uniformScale;
  
  // Center the mask
  const offsetX = (originalWidth - scaledMaskWidth) / 2;
  const offsetY = (originalHeight - scaledMaskHeight) / 2;
  
  // Draw mask with proper scaling and positioning
  resultCtx.drawImage(maskCanvas, offsetX, offsetY, scaledMaskWidth, scaledMaskHeight);
  
  console.log('Drawing mask image with uniform scaling');
  return resultCanvas.toDataURL('image/png');
}

// Load ONNX model
export async function loadModel() {
  try {
    await configureOrtEnvironment();
    
    // Use WASM as execution provider
    const executionProviders = ['wasm'];
    
    const session = await ort.InferenceSession.create('/RMBG-1.4.onnx', {
      executionProviders: executionProviders,
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true
    });
    
    console.log('Model loaded successfully, executionProviders: ', session.executionProviders);
    return session;
  } catch (error) {
    console.error('Model loading failed: ', error);
    // Provide detailed error message
    if (error.message.includes('Failed to fetch')) {
      throw new Error('Cannot find model file, please check public directory');
    } else if (error.message.includes('WebAssembly')) {
      throw new Error('WASM module error, please check wasm directory');
    } else {
      throw new Error('Model initialization failed: ' + error.message);
    }
  }
}