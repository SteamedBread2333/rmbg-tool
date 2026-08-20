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

// Image preprocessing: force 1024x1024 (RMBG-1.4 ONNX fixed input), normalize, convert to tensor
export async function preprocessImage(imageElement, targetSize = 1024) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // RMBG-1.4 requires fixed [1, 3, 1024, 1024] — match official bilinear resize to model_input_size
  const width = targetSize;
  const height = targetSize;

  canvas.width = width;
  canvas.height = height;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageElement, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = new Float32Array(3 * width * height);

  // Normalize to [0,1], then standardize with mean 0.5 / std 1.0 (official RMBG-1.4)
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const pixelIndex = (i * width + j) * 4;

      const r = imageData.data[pixelIndex] / 255.0;
      const g = imageData.data[pixelIndex + 1] / 255.0;
      const b = imageData.data[pixelIndex + 2] / 255.0;

      const tensorIndex = i * width + j;
      data[tensorIndex] = r - 0.5;
      data[height * width + tensorIndex] = g - 0.5;
      data[2 * height * width + tensorIndex] = b - 0.5;
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

// Postprocessing: resize mask back to original size (official RMBG-1.4) and composite
export function postprocessResult(originalImage, maskTensor, resizedWidth, resizedHeight, originalWidth, originalHeight) {
  console.log('Starting postprocessing, mask tensor shape:', maskTensor.dims);
  console.log('Original image size:', originalWidth, 'x', originalHeight);
  console.log('Processed size:', resizedWidth, 'x', resizedHeight);

  const maskData = maskTensor.data;
  console.log('Mask data length:', maskData.length);

  let minVal = maskData[0];
  let maxVal = maskData[0];
  for (let i = 1; i < maskData.length; i++) {
    if (maskData[i] < minVal) minVal = maskData[i];
    if (maskData[i] > maxVal) maxVal = maskData[i];
  }
  console.log('Mask data range:', minVal, 'to', maxVal);

  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');
  maskCanvas.width = resizedWidth;
  maskCanvas.height = resizedHeight;

  const maskImageData = maskCtx.createImageData(resizedWidth, resizedHeight);
  const range = maxVal - minVal || 1;

  for (let i = 0; i < resizedHeight; i++) {
    for (let j = 0; j < resizedWidth; j++) {
      const pixelIndex = i * resizedWidth + j;
      const normalizedValue = (maskData[pixelIndex] - minVal) / range;
      const alpha = Math.round(normalizedValue * 255);

      const imageDataIndex = pixelIndex * 4;
      maskImageData.data[imageDataIndex] = 255;
      maskImageData.data[imageDataIndex + 1] = 255;
      maskImageData.data[imageDataIndex + 2] = 255;
      maskImageData.data[imageDataIndex + 3] = alpha;
    }
  }

  maskCtx.putImageData(maskImageData, 0, 0);

  const resultCanvas = document.createElement('canvas');
  const resultCtx = resultCanvas.getContext('2d');
  resultCanvas.width = originalWidth;
  resultCanvas.height = originalHeight;

  resultCtx.clearRect(0, 0, originalWidth, originalHeight);
  resultCtx.drawImage(originalImage, 0, 0, originalWidth, originalHeight);

  // Stretch mask to original dimensions (matches official F.interpolate back to orig size)
  resultCtx.globalCompositeOperation = 'destination-in';
  resultCtx.imageSmoothingEnabled = true;
  resultCtx.imageSmoothingQuality = 'high';
  resultCtx.drawImage(maskCanvas, 0, 0, originalWidth, originalHeight);

  return resultCanvas.toDataURL('image/png');
}

// Load ONNX model
export async function loadModel() {
  try {
    await configureOrtEnvironment();

    // Use WASM as execution provider
    const executionProviders = ['wasm'];
    console.log('import.meta.env.PROD', import.meta.env.PROD)
    const session = await ort.InferenceSession.create(
      `${import.meta.env.PROD ? '/rmbg-tool' : ''}/RMBG-1.4.onnx`,
      // `${import.meta.env.PROD ? '/rmbg-tool' : ''}/RMBG-2.0.onnx`,
      {
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
    if (error?.message?.includes('Failed to fetch')) {
      throw new Error('Cannot find model file, please check public directory');
    } else if (error?.message?.includes('WebAssembly')) {
      throw new Error('WASM module error, please check wasm directory');
    } else {
      throw new Error('Model initialization failed: ' + error?.message);
    }
  }
}