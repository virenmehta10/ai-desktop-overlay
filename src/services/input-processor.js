import { memoryService } from './memory';

class InputProcessor {
  constructor() {
    this.supportedTypes = ['screen', 'pdf', 'audio', 'text', 'code'];
    this.processingQueue = [];
    this.isProcessing = false;
  }

  async processInput(input, type) {
    if (!this.supportedTypes.includes(type)) {
      throw new Error(`Unsupported input type: ${type}`);
    }

    // Add to processing queue
    const task = { input, type, timestamp: Date.now() };
    this.processingQueue.push(task);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.processingQueue.shift();

    try {
      let processedContent;
      switch (task.type) {
        case 'screen':
          processedContent = await this.processScreenCapture(task.input);
          break;
        case 'pdf':
          processedContent = await this.processPDF(task.input);
          break;
        case 'audio':
          processedContent = await this.processAudio(task.input);
          break;
        case 'text':
          processedContent = await this.processText(task.input);
          break;
        case 'code':
          processedContent = await this.processCode(task.input);
          break;
      }

      // Store processed content
      await memoryService.storeContent({
        ...processedContent,
        type: task.type,
        timestamp: task.timestamp
      });

    } catch (error) {
      console.error(`Error processing ${task.type}:`, error);
    } finally {
      this.isProcessing = false;
      if (this.processingQueue.length > 0) {
        this.processQueue();
      }
    }
  }

  async processScreenCapture(capture) {
    // Extract text using OCR
    const textContent = await this.performOCR(capture);
    
    // Analyze visual elements
    const visualElements = await this.analyzeVisualElements(capture);
    
    return {
      text: textContent,
      visualElements,
      metadata: {
        timestamp: Date.now(),
        type: 'screen'
      }
    };
  }

  async processPDF(pdfFile) {
    // Implementation for PDF processing
    // This would use a PDF parsing library
    return {
      text: 'PDF content...',
      pages: [],
      metadata: {
        timestamp: Date.now(),
        type: 'pdf'
      }
    };
  }

  async processAudio(audioData) {
    // Implementation for audio processing
    // This would use speech-to-text
    return {
      text: 'Transcribed audio...',
      metadata: {
        timestamp: Date.now(),
        type: 'audio'
      }
    };
  }

  async processText(text) {
    // Implementation for text processing
    return {
      text,
      metadata: {
        timestamp: Date.now(),
        type: 'text'
      }
    };
  }

  async processCode(code) {
    // Implementation for code processing
    return {
      text: code,
      language: this.detectLanguage(code),
      metadata: {
        timestamp: Date.now(),
        type: 'code'
      }
    };
  }

  async performOCR(image) {
    // OCR implementation would go here
    // This would use Tesseract.js or similar
    return 'Extracted text...';
  }

  async analyzeVisualElements(image) {
    // Visual element analysis implementation
    return {
      elements: [],
      layout: {},
      colors: []
    };
  }

  detectLanguage(code) {
    // Simple language detection implementation
    return 'javascript'; // placeholder
  }
}

export const inputProcessor = new InputProcessor(); 