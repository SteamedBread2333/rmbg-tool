import React, { useState, useEffect, useRef } from 'react';
import { preprocessImage, postprocessResult, loadModel } from '../utils/imageUtils';
import './ImageProcessor.css';

const ImageProcessor = () => {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const fileInputRef = useRef(null);

  // Load model
  useEffect(() => {
    const initModel = async () => {
      try {
        const loadedModel = await loadModel();
        setModel(loadedModel);
      } catch (err) {
        setError('Model loading failed: ' + err.message);
      } finally {
        setModelLoading(false);
      }
    };

    initModel();
  }, []);

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target.result);
        setProcessedImage(null);
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle drag and drop functionality
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target.result);
        setProcessedImage(null);
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  // Process background removal
  const processImage = async () => {
    if (!uploadedImage || !model) return;

    setIsProcessing(true);
    setError('');

    try {
      const img = new Image();
      img.src = uploadedImage;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Preprocess image
      const { tensor, originalWidth, originalHeight, resizedWidth, resizedHeight } = await preprocessImage(img);

      // Modal inference
      const feeds = { input: tensor };
      const results = await model.run(feeds);
      const output = results.output;

      // Get postprocessed image
      const resultUrl = postprocessResult(img, output, resizedWidth, resizedHeight, originalWidth, originalHeight);
      setProcessedImage(resultUrl);
    } catch (err) {
      console.error('图像处理失败:', err);
      setError('Image processing failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download processed image
  const downloadImage = () => {
    if (!processedImage) return;
    const link = document.createElement('a');
    link.href = processedImage;
    link.download = 'bg-removed-image.png';
    link.click();
  };

  return (
    <div className="image-processor-container">
      <h2>AI Background Removal Tool</h2>

      {modelLoading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading model, please wait...</p>
        </div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <>          
          {/* Upload area */}
          <div 
            className="upload-area"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageUpload}
              className="file-input"
            />
            {uploadedImage ? (
              <img src={uploadedImage} alt="Upload Preview" className="preview-image" />
            ) : (
              <div className="upload-prompt">
                <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Click or drag image here to upload</p>
                <p className="small-text">Supports JPG, PNG formats</p>
                <p className="small-text">Recommended resolution: 800×600 to 2000×2000 pixels for best results</p>
              </div>
            )}
          </div>

          {/* Processing button */}
          {uploadedImage && !isProcessing && (
            <button 
              className="process-button"
              onClick={processImage}
            >
              Remove Background
            </button>
          )}

          {/* Processing state */}
          {isProcessing && (
            <div className="processing-state">
              <div className="spinner"></div>
              <p>Processing, please wait...</p>
            </div>
          )}

          {/* Result display */}
          {processedImage && (
            <div className="result-section">
              <h3>Processing Result</h3>
              <div className="comparison-container">
                <div className="image-comparison">
                  <div className="comparison-item">
                    <h4>Original Image</h4>
                    <img src={uploadedImage} alt="Upload Preview" className="comparison-image" />
                  </div>
                  <div className="comparison-item">
                    <h4>After Background Removal</h4>
                    <div className="result-image-container">
                      <img src={processedImage} alt="Processed Result" className="comparison-image" />
                    </div>
                  </div>
                </div>
              </div>
              <button 
                className="download-button"
                onClick={downloadImage}
              >
                Download Image
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ImageProcessor;