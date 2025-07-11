import React, { useState, useEffect, useRef } from "react";
import {
  preprocessImage,
  postprocessResult,
  loadModel,
} from "../utils/imageUtils";
import "./ImageProcessor.css";

const ImageProcessor = () => {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Load model
  useEffect(() => {
    const initModel = async () => {
      try {
        const loadedModel = await loadModel();
        setModel(loadedModel);
      } catch (err) {
        setError("Model loading failed: " + err.message);
      } finally {
        setModelLoading(false);
      }
    };

    initModel();
  }, []);

  // Clean up camera when component unmounts or camera is closed
  useEffect(() => {
    return () => {
      if (isCameraActive && videoRef.current && videoRef.current.srcObject) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const videoElement = videoRef.current;
        if (videoElement && videoElement.srcObject) {
          videoElement.srcObject.getTracks().forEach((track) => track.stop());
        }
      }
    };
  }, [isCameraActive]);

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target.result);
        setProcessedImage(null);
        setError("");
      };
      reader.readAsDataURL(file);
    }
  };

  // Camera functions
  const startCamera = async () => {
    try {
      setCameraError("");
      // Request specific video resolution for better compatibility
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 720 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video metadata to load before playing
        await new Promise((resolve, reject) => {
          videoRef.current.onloadedmetadata = resolve;
          videoRef.current.onerror = reject;
        });

        // Ensure video starts playing
        try {
          await videoRef.current.play();
          console.log("Video playback started successfully");
        } catch (playError) {
          setCameraError("Video playback failed: " + playError.message);
          console.error("Playback error:", playError);
          // Clean up stream if playback fails
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setIsCameraActive(true);
        setUploadedImage(null);
        setProcessedImage(null);
      }
    } catch (err) {
      setCameraError("Camera access failed: " + err.message);
      console.error("Camera error:", err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
      setCameraError("");
    }
  };

  const captureImage = () => {
    if (!videoRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions to match video
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    // Draw current video frame to canvas
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // Convert canvas to data URL
    const imageDataUrl = canvas.toDataURL("image/png");
    setUploadedImage(imageDataUrl);
    stopCamera();
  };

  // Handle drag and drop functionality
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target.result);
        setProcessedImage(null);
        setError("");
      };
      reader.readAsDataURL(file);
    }
  };

  // Process background removal
  const processImage = async () => {
    if (!uploadedImage || !model) return;

    setIsProcessing(true);
    setError("");

    try {
      const img = new Image();
      img.src = uploadedImage;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Preprocess image
      const {
        tensor,
        originalWidth,
        originalHeight,
        resizedWidth,
        resizedHeight,
      } = await preprocessImage(img);

      // Modal inference
      const feeds = { input: tensor };
      const results = await model.run(feeds);
      const output = results.output;

      // Get postprocessed image
      const resultUrl = postprocessResult(
        img,
        output,
        resizedWidth,
        resizedHeight,
        originalWidth,
        originalHeight
      );
      setProcessedImage(resultUrl);
    } catch (err) {
      console.error("图像处理失败:", err);
      setError("Image processing failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download processed image
  const downloadImage = () => {
    if (!processedImage) return;
    const link = document.createElement("a");
    link.href = processedImage;
    link.download = "bg-removed-image.png";
    link.click();
  };

  console.log("isCameraActive", isCameraActive);
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
              <img
                src={uploadedImage}
                alt="Upload Preview"
                className="preview-image"
              />
            ) : (
              <div className="upload-prompt">
                <svg
                  className="upload-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Click or drag image here to upload</p>
                <p className="small-text">Supports JPG, PNG formats</p>
                <p className="small-text">
                  Recommended resolution: 800×600 to 2000×2000 pixels for best
                  results
                </p>
              </div>
            )}
          </div>

          {/* Camera section */}
          <div className="camera-section">
            <button className="camera-button" onClick={startCamera}>
              Use Camera
            </button>

            <div
              style={{ display: isCameraActive ? "block" : "none" }}
              className="camera-preview"
            >
              <div className="camera-video-container">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="camera-video"
                ></video>
              </div>
              <canvas ref={canvasRef} style={{ display: "none" }}></canvas>
              <div className="camera-controls">
                <button onClick={captureImage} className="capture-button">
                  Capture Image
                </button>
                <button onClick={stopCamera} className="stop-button">
                  Close Camera
                </button>
              </div>
              {cameraError && (
                <div className="error-message">{cameraError}</div>
              )}
            </div>
          </div>

          {/* Processing button */}
          {uploadedImage && !isProcessing && (
            <button className="process-button" onClick={processImage}>
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
                    <img
                      src={uploadedImage}
                      alt="Upload Preview"
                      className="comparison-image"
                    />
                  </div>
                  <div className="comparison-item">
                    <h4>After Background Removal</h4>
                    <div className="result-image-container">
                      <img
                        src={processedImage}
                        alt="Processed Result"
                        className="comparison-image"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <button className="download-button" onClick={downloadImage}>
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
