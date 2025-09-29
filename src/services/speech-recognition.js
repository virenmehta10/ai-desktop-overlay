const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SpeechRecognitionService {
  constructor() {
    this.ffmpegProcess = null;
    this.isRecording = false;
    this.tempDir = os.tmpdir();
    this.audioFilePath = path.join(this.tempDir, 'temp_audio.wav');
    this.pythonPath = 'python3';
    this.preferredMicrophoneIndex = null;
    this.cachedMicrophones = null;
    this.lastMicrophoneScan = 0;
    this.microphoneScanInterval = 30000; // Cache for 30 seconds
    this.recordingStartTime = null;
  }

  async getAvailableMicrophones() {
    // Use cached microphones if available and not expired
    const now = Date.now();
    if (this.cachedMicrophones && (now - this.lastMicrophoneScan) < this.microphoneScanInterval) {
      return this.cachedMicrophones;
    }

    return new Promise((resolve, reject) => {
      const ffmpegProcess = spawn('ffmpeg', [
        '-f', 'avfoundation',
        '-list_devices', 'true',
        '-i', ''
      ]);

      let output = '';
      let error = '';

      ffmpegProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffmpegProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      ffmpegProcess.on('close', (code) => {
        const lines = output.split('\n');
        const audioDevices = [];
        let inAudioSection = false;

        for (const line of lines) {
          if (line.includes('AVFoundation audio devices:')) {
            inAudioSection = true;
            continue;
          }
          if (inAudioSection && line.includes('AVFoundation video devices:')) {
            break;
          }
          if (inAudioSection && line.includes('[') && line.includes(']')) {
            const match = line.match(/\[(\d+)\]\s+(.+)/);
            if (match) {
              const index = parseInt(match[1]);
              const name = match[2].trim();
              audioDevices.push({ index, name });
            }
          }
        }

        // Cache the results
        this.cachedMicrophones = audioDevices;
        this.lastMicrophoneScan = now;

        resolve(audioDevices);
      });

      ffmpegProcess.on('error', (err) => {
        reject(new Error(`Failed to get microphone list: ${err.message}`));
      });
    });
  }

  async selectBestMicrophone() {
    try {
      const microphones = await this.getAvailableMicrophones();
      console.log('Available microphones:', microphones);

      // Prefer built-in microphones over Bluetooth devices
      const preferredNames = [
        'MacBook Air Microphone',
        'MacBook Pro Microphone',
        'MacBook Microphone',
        'Built-in Microphone',
        'Internal Microphone',
        'Default Microphone',
        'System Microphone',
        'Computer Microphone',
        'Laptop Microphone'
      ];

      // First, try to find a built-in microphone
      for (const mic of microphones) {
        if (preferredNames.some(name => mic.name.includes(name))) {
          console.log(`Selected built-in microphone: ${mic.name} (index: ${mic.index})`);
          return mic.index;
        }
      }

      // If no built-in microphone found, avoid Bluetooth devices and use the first non-Bluetooth device
      const bluetoothKeywords = ['airpods', 'bluetooth', 'wireless', 'headphones'];
      for (const mic of microphones) {
        const isBluetooth = bluetoothKeywords.some(keyword => 
          mic.name.toLowerCase().includes(keyword)
        );
        if (!isBluetooth) {
          console.log(`Selected non-Bluetooth microphone: ${mic.name} (index: ${mic.index})`);
          return mic.index;
        }
      }

      // Fallback to the first available microphone
      if (microphones.length > 0) {
        console.log(`Fallback to first microphone: ${microphones[0].name} (index: ${microphones[0].index})`);
        return microphones[0].index;
      }

      throw new Error('No microphones found');
    } catch (error) {
      console.error('Error selecting microphone:', error);
      // Fallback to default microphone
      return 0;
    }
  }

  async prewarmMicrophoneSelection() {
    try {
      if (this.preferredMicrophoneIndex === null) {
        console.log('Prewarming microphone selection...');
        this.preferredMicrophoneIndex = await this.selectBestMicrophone();
        console.log('Microphone selection prewarmed:', this.preferredMicrophoneIndex);
      }
    } catch (error) {
      console.error('Failed to prewarm microphone selection:', error);
    }
  }

  async startRecording() {
    if (this.isRecording) return;

    try {
      // Clean up any existing audio file
      if (fs.existsSync(this.audioFilePath)) {
        fs.unlinkSync(this.audioFilePath);
      }

      // Use cached microphone index if available, otherwise select quickly
      let microphoneIndex = this.preferredMicrophoneIndex;
      
      if (microphoneIndex === null) {
        try {
          microphoneIndex = await this.selectBestMicrophone();
          this.preferredMicrophoneIndex = microphoneIndex;
        } catch (error) {
          console.error('Quick microphone selection failed, using default:', error);
          microphoneIndex = 0; // Fallback to default
        }
      }

      console.log(`Starting recording with microphone index: ${microphoneIndex}`);

      // Start recording immediately with optimized settings for faster startup
      this.ffmpegProcess = spawn('ffmpeg', [
        '-f', 'avfoundation',
        '-i', `:${microphoneIndex}`,
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-fflags', '+genpts', // Generate presentation timestamps
        '-avoid_negative_ts', 'make_zero', // Avoid negative timestamps
        '-y', // Overwrite output file if it exists
        this.audioFilePath
      ]);

      // Handle ffmpeg errors
      this.ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // Only log actual errors, not normal ffmpeg output
        if (output.includes('Error') || output.includes('error') || output.includes('Device busy')) {
          console.log('FFmpeg:', output);
        }
      });

      this.ffmpegProcess.on('error', (error) => {
        console.error('FFmpeg error:', error);
        this.isRecording = false;
      });

      // Minimal wait time - just enough to ensure process started
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check if the process is still running
      if (this.ffmpegProcess.killed) {
        throw new Error('FFmpeg process failed to start');
      }

      this.isRecording = true;
      this.recordingStartTime = Date.now();
      console.log('Started recording to:', this.audioFilePath);
    } catch (error) {
      console.error('Error starting recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  async stopRecording() {
    if (!this.isRecording) return;

    try {
      // Calculate recording duration
      const recordingDuration = Date.now() - this.recordingStartTime;
      const minRecordingDuration = 500; // Minimum 500ms recording
      
      if (recordingDuration < minRecordingDuration) {
        // Wait a bit more to ensure we have enough audio
        await new Promise((resolve) => setTimeout(resolve, minRecordingDuration - recordingDuration));
      }

      // Stop ffmpeg recording
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill();
        this.isRecording = false;
      }

      // Wait for file to be written and ensure it exists
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      if (!fs.existsSync(this.audioFilePath)) {
        throw new Error('Audio file was not created');
      }

      // Check if file is valid
      const stats = fs.statSync(this.audioFilePath);
      if (stats.size === 0) {
        throw new Error('Audio file is empty');
      }

      // Check minimum file size (at least 1KB for a meaningful recording)
      if (stats.size < 1024) {
        throw new Error('Recording too short, please speak longer');
      }

      // Transcribe using our Python script
      const transcription = await this.transcribeAudio();
      
      // Clean up the temporary audio file
      if (fs.existsSync(this.audioFilePath)) {
        fs.unlinkSync(this.audioFilePath);
      }

      return transcription;
    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }

  async transcribeAudio() {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.pythonPath, [
        path.join(process.cwd(), 'transcribe.py'),
        this.audioFilePath
      ]);

      let output = '';
      let error = '';

      // Add timeout for transcription (30 seconds)
      const timeout = setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        reject(new Error('Transcription timed out after 30 seconds'));
      }, 30000);

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
        console.log('Transcription stderr:', data.toString());
      });

      pythonProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start transcription process: ${err.message}`));
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          const transcription = output.trim();
          if (transcription) {
            resolve(transcription);
          } else {
            reject(new Error('Transcription returned empty result'));
          }
        } else {
          reject(new Error(`Transcription failed (code ${code}): ${error}`));
        }
      });
    });
  }
}

module.exports = new SpeechRecognitionService(); 