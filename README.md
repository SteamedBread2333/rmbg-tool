# AI Background Removal Tool

A local image background removal application built with Vite + React + ONNX Runtime Web, utilizing the RMBG-1.4 model for high-quality background separation, with integrated AI image generation capabilities.

## Features
- Runs entirely locally, protecting privacy
- Supports JPG/PNG image uploads
- Real-time background removal processing
- **NEW**: AI image generation using Stable Diffusion XL Base 1.0 via remote APIs
- Generate images from text prompts and remove backgrounds
- Clean and intuitive user interface
- Camera capture support

## Installation Steps

### Prerequisites
- Node.js (v14.0.0+)
- npm or yarn
- RMBG-1.4.onnx model file (requires separate download)

### Install Dependencies
```bash
npm install
```

### Prepare Model Files
1. Download the RMBG-1.4.onnx model file using the following command:
```bash
curl -L -o ./public/RMBG-1.4.onnx https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx
```

## AI Image Generation

### Supported API Providers

The application supports three AI image generation providers:

#### 1. Hugging Face Inference API (Recommended for beginners)
- **Cost**: Free tier available
- **Model**: Stable Diffusion XL Base 1.0
- **Get API Key**: [Hugging Face Tokens](https://huggingface.co/settings/tokens)
- **Features**: 
  - Free to use
  - High-quality generation
  - Good for development and testing

#### 2. Replicate API (Recommended for professionals)
- **Cost**: Pay-per-use
- **Model**: Stable Diffusion XL
- **Get API Key**: [Replicate API Tokens](https://replicate.com/account/api-tokens)
- **Features**:
  - High-quality output
  - Multiple model support
  - Reliable and stable

#### 3. Stability AI API (Official)
- **Cost**: Pay-per-use
- **Model**: Stable Diffusion XL
- **Get API Key**: [Stability AI Keys](https://platform.stability.ai/account/keys)
- **Features**:
  - Official API
  - Latest models
  - Enterprise-grade support

### Configuration Steps

1. **Get API Keys**
   - Visit the respective provider's website
   - Register an account and obtain API keys
   - Check usage limits and pricing

2. **Configure in Application**
   - Click the "🔧 API Configuration" button
   - Enter the respective API keys
   - Click "Save" button
   - Select the API provider to use

3. **Start Generating**
   - Enter descriptive prompts
   - Select API provider
   - Click "🎨 Generate Image"

### Demo Mode

If no API keys are configured, the application will automatically use local Canvas generation for demo purposes:
- Generates contextual scenes based on keyword analysis
- Supports multiple image types (animals, landscapes, buildings, etc.)
- No network connection required
- Suitable for demonstration and testing

## Usage
1. Start the development server
```bash
npm run dev
```
2. Open http://localhost:5173 in your browser
3. **Generate images using AI**:
   - Enter a text prompt describing the image you want
   - Configure API keys for real AI generation or use demo mode
   - Click "Generate Image" to create an AI-generated image
   - Use the generated image for background removal
4. Or upload an existing image using drag & drop or file selection
5. Use camera capture to take photos directly
6. Click "Remove Background" to process the image
7. View the result and download the processed image

## Technology Stack
- Vite + React
- ONNX Runtime Web (WASM backend)
- RMBG-1.4 model for background removal
- Stable Diffusion XL Base 1.0 for image generation (via APIs)
- Canvas API for demo image generation

## Notes
- First model load may take several seconds
- Larger images may require more processing time
- Ensure the model file path is correct
- AI image generation requires API keys for real models
- Demo mode provides contextual image generation without APIs

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
