import React, { useState, useEffect } from 'react';
import { generateImage, apiKeyManager } from '../utils/diffusionUtils';
import './ImageGenerator.css';

const ImageGenerator = ({ onImageGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiKeys, setApiKeys] = useState({
    huggingface: '',
    replicate: '',
    stability: ''
  });
  const [selectedProvider, setSelectedProvider] = useState('huggingface');

  const samplePrompts = [
    "A beautiful sunset over mountains",
    "A cute golden retriever puppy playing in a garden",
    "A futuristic city skyline with flying cars",
    "A peaceful forest scene with a small stream",
    "A colorful abstract painting with geometric shapes",
    "A cozy coffee shop interior with warm lighting",
    "A majestic eagle soaring through clouds",
    "A serene beach with crystal clear water",
    "A steampunk robot in a Victorian setting",
    "A magical fairy tale castle in the clouds"
  ];

  useEffect(() => {
    setApiKeys({
      huggingface: apiKeyManager.getKey('huggingface') || '',
      replicate: apiKeyManager.getKey('replicate') || '',
      stability: apiKeyManager.getKey('stability') || ''
    });
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    try {
      const imageUrl = await generateImage(prompt, 1024, 1024, { 
        provider: selectedProvider,
        steps: 30,
        guidance_scale: 7.5
      });
      setGeneratedImage(imageUrl);
      if (onImageGenerated) {
        onImageGenerated(imageUrl);
      }
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Image generation failed: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSamplePrompt = (samplePrompt) => {
    setPrompt(samplePrompt);
  };

  const handleApiKeyChange = (provider, key) => {
    setApiKeys(prev => ({
      ...prev,
      [provider]: key
    }));
  };

  const saveApiKey = (provider) => {
    const key = apiKeys[provider];
    if (key.trim()) {
      apiKeyManager.setKey(provider, key.trim());
      alert(`${provider} API key saved successfully`);
    }
  };

  const clearApiKey = (provider) => {
    apiKeyManager.setKey(provider, '');
    setApiKeys(prev => ({
      ...prev,
      [provider]: ''
    }));
    alert(`${provider} API key cleared`);
  };

  const getAvailableProviders = () => {
    return ['huggingface', 'replicate', 'stability'].filter(provider => 
      apiKeyManager.hasKey(provider)
    );
  };

  const getProviderInfo = (provider) => {
    const info = {
      huggingface: {
        name: 'Hugging Face',
        description: 'Free tier available, uses SDXL model',
        url: 'https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained',
        model: 'stable-diffusion-xl-base-1.0'
      },
      replicate: {
        name: 'Replicate',
        description: 'Pay-per-use, uses SDXL model',
        url: 'https://replicate.com/account/api-tokens',
        model: 'SDXL'
      },
      stability: {
        name: 'Stability AI',
        description: 'Official API, high quality generation',
        url: 'https://platform.stability.ai/account/keys',
        model: 'SDXL'
      }
    };
    return info[provider];
  };

  return (
    <div className="image-generator">
      <h2>🎨 AI Image Generator</h2>
      
      <div className="api-config-header">
        <button 
          className="api-config-btn"
          onClick={() => setShowApiConfig(!showApiConfig)}
        >
          🔧 API Configuration {showApiConfig ? '▼' : '▶'}
        </button>
        <div className="provider-status">
          Available APIs: {getAvailableProviders().length > 0 ? 
            getAvailableProviders().join(', ') : 
            'None (will use local generation)'
          }
        </div>
      </div>

      {showApiConfig && (
        <div className="api-config-panel">
          <h3>🔑 API Key Configuration</h3>
          <p className="api-info">
            Configure API keys to use real AI models for image generation. If not configured, local Canvas generation will be used for demo purposes.
          </p>
          
          {['huggingface', 'replicate', 'stability'].map(provider => {
            const info = getProviderInfo(provider);
            return (
              <div key={provider} className="api-provider">
                <h4>{info.name}</h4>
                <p>{info.description} - Model: {info.model}</p>
                <div className="api-key-input">
                  <input
                    type="password"
                    placeholder={`Enter ${info.name} API key`}
                    value={apiKeys[provider]}
                    onChange={(e) => handleApiKeyChange(provider, e.target.value)}
                  />
                  <button onClick={() => saveApiKey(provider)}>Save</button>
                  <button onClick={() => clearApiKey(provider)}>Clear</button>
                </div>
                <a href={info.url} target="_blank" rel="noopener noreferrer">
                  Get API Key →
                </a>
              </div>
            );
          })}
        </div>
      )}

      {getAvailableProviders().length > 0 && (
        <div className="provider-selector">
          <label>Select API Provider:</label>
          <select 
            value={selectedProvider} 
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            {getAvailableProviders().map(provider => (
              <option key={provider} value={provider}>
                {getProviderInfo(provider).name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="prompt-input">
        <label htmlFor="prompt">Enter Prompt:</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to generate..."
          rows="3"
        />
      </div>

      <div className="sample-prompts">
        <h3>💡 Sample Prompts:</h3>
        <div className="prompt-buttons">
          {samplePrompts.map((samplePrompt, index) => (
            <button
              key={index}
              className="sample-prompt-btn"
              onClick={() => handleSamplePrompt(samplePrompt)}
            >
              {samplePrompt}
            </button>
          ))}
        </div>
      </div>

      <button 
        className={`generate-btn ${isGenerating ? 'generating' : ''}`}
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
      >
        {isGenerating ? '🔄 Generating...' : '🎨 Generate Image'}
      </button>

      {generatedImage && (
        <div className="generated-image">
          <h3>Generated Image:</h3>
          <img src={generatedImage} alt="Generated" />
          <div className="image-actions">
            <button onClick={() => onImageGenerated && onImageGenerated(generatedImage)}>
              Use This Image
            </button>
            <a href={generatedImage} download="generated-image.png">
              Download Image
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGenerator; 