# AI Background Removal Tool

A local image background removal application built with Vite + React + ONNX Runtime Web, utilizing the RMBG-1.4 model for high-quality background separation.

## Features
- Runs entirely locally, protecting privacy
- Supports JPG/PNG image uploads
- Real-time background removal processing
- Clean and intuitive user interface

## Installation Steps

### Prerequisites
- Node.js (v14.0.0+)
- npm or yarn
- RMBG-1.4.onnx model file (requires separate download)

### Install Dependencies
```bash
npm install
```

### Prepare Model File
1. Download the RMBG-1.4.onnx model file using the following command:
```bash
curl -L -o ./public/RMBG-1.4.onnx https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx
```

## Usage
1. Start the development server
```bash
npm run dev
```
2. Open http://localhost:5173 in your browser
3. Upload an image and click the "Remove Background" button
4. View the result and download the processed image

## Technology Stack
- Vite + React
- ONNX Runtime Web (WASM backend)
- RMBG-1.4 model

## Notes
- First model load may take several seconds
- Larger images may require more processing time
- Ensure the model file path is correct

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
