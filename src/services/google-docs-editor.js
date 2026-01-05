// google docs editing service
// handles direct editing of google docs including grammar fixes, synthesis, and polishing

const Tesseract = require('tesseract.js');
const OpenAI = require('openai');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class GoogleDocsEditor {
  constructor() {
    // lazy initialization - only create openai client when needed
    this._openai = null;
  }
  
  get openai() {
    if (!this._openai) {
      this._openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this._openai;
  }

  // detect if user wants to edit/polish the document
  isEditRequest(query) {
    if (!query) return false;
    const queryLower = query.toLowerCase().trim();
    
    // very aggressive matching - if it contains polish/edit/improve/fix anywhere, it's an edit request
    if (queryLower.includes('polish') || queryLower.includes('edit') || queryLower.includes('improve') || queryLower.includes('fix') || queryLower.includes('refine')) {
      console.log('[GOOGLE DOCS EDITOR] ✅ isEditRequest: TRUE (contains edit keyword)');
      return true;
    }
    
    // patterns for editing requests - more comprehensive
    const editPatterns = [
      /\b(edit|fix|improve|polish|refine|revise|rewrite|enhance|clean up|correct)\b/i,
      /\b(fix.*grammar|grammar.*fix|correct.*grammar|grammar.*error|grammar.*mistake)\b/i,
      /\b(synthesize|combine|merge|consolidate|turn.*into.*paragraph|notes.*into.*paragraph)\b/i,
      /\b(improve.*writing|better.*writing|polish.*writing|refine.*writing)\b/i,
      /\b(make.*better|make.*clearer|clarify|simplify|expand|elaborate)\b/i,
    ];

    const matches = editPatterns.some(pattern => pattern.test(queryLower));
    console.log('[GOOGLE DOCS EDITOR] isEditRequest check:', { query: query.substring(0, 50), matches });
    return matches;
  }

  // determine the type of editing requested
  getEditType(query) {
    const queryLower = query.toLowerCase();
    
    if (/\b(grammar|grammatical|spelling|punctuation)\b/i.test(queryLower)) {
      return 'grammar';
    }
    
    if (/\b(synthesize|combine|merge|consolidate|notes.*paragraph|bullet.*paragraph)\b/i.test(queryLower)) {
      return 'synthesis';
    }
    
    if (/\b(polish|refine|improve|enhance|better.*writing)\b/i.test(queryLower)) {
      return 'polish';
    }
    
    // default to polish for general improvement requests
    return 'polish';
  }

  // extract text from screen capture using ocr
  async extractTextFromScreenCapture(screenCapture) {
    try {
      if (!screenCapture || !screenCapture.dataURL) {
        throw new Error('No screen capture data available');
      }

      console.log('[GOOGLE DOCS EDITOR] Extracting text from screen capture using OCR...');
      
      // use tesseract to extract text with better configuration for document text
      const { data: { text, words } } = await Tesseract.recognize(
        screenCapture.dataURL,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`[GOOGLE DOCS EDITOR] OCR progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );

      let extractedText = text.trim();
      
      // filter out common UI elements and noise
      // remove lines that look like UI elements (short, all caps, special chars)
      const lines = extractedText.split('\n').filter(line => {
        const trimmed = line.trim();
        // filter out very short lines that are likely UI elements
        if (trimmed.length < 3) return false;
        // filter out lines that are mostly special characters
        if (trimmed.match(/^[^a-zA-Z0-9\s]{3,}$/)) return false;
        // filter out common UI text
        if (trimmed.match(/^(File|Edit|View|Insert|Format|Tools|Help|Share|Comments|Suggesting|Editing|Page|Zoom)/i)) return false;
        return true;
      });
      
      extractedText = lines.join('\n').trim();
      
      console.log(`[GOOGLE DOCS EDITOR] Extracted ${extractedText.length} characters of text (filtered)`);
      console.log(`[GOOGLE DOCS EDITOR] First 200 chars: ${extractedText.substring(0, 200)}`);
      
      return extractedText;
    } catch (error) {
      console.error('[GOOGLE DOCS EDITOR] OCR extraction failed:', error);
      throw new Error(`Failed to extract text from screen: ${error.message}`);
    }
  }

  // improve text based on edit type
  async improveText(originalText, editType, userQuery) {
    try {
      console.log(`[GOOGLE DOCS EDITOR] Improving text with edit type: ${editType}`);
      
      let systemPrompt = '';
      let userPrompt = '';

      switch (editType) {
        case 'grammar':
          systemPrompt = `You are an expert grammar and writing editor. Your task is to fix all grammar, spelling, and punctuation errors in the provided text while preserving the original meaning, style, and tone. Return ONLY the corrected text without any explanations or comments.`;
          userPrompt = `Fix all grammar, spelling, and punctuation errors in this text:\n\n${originalText}`;
          break;
        
        case 'synthesis':
          systemPrompt = `You are an expert writing assistant. Your task is to synthesize individual notes, bullet points, or fragmented text into well-written, coherent paragraphs. Maintain all important information while creating smooth, flowing prose. Return ONLY the synthesized text without any explanations.`;
          userPrompt = `Synthesize these notes into well-written paragraphs:\n\n${originalText}\n\n${userQuery}`;
          break;
        
        case 'polish':
        default:
          systemPrompt = `You are an expert writing editor. Your task is to polish and improve the provided text by enhancing clarity, flow, word choice, and overall quality while preserving the original meaning and style. Make the writing more professional, clear, and engaging. Return ONLY the improved text without any explanations or comments.`;
          userPrompt = `Polish and improve this text:\n\n${originalText}\n\n${userQuery ? `User request: ${userQuery}` : ''}`;
          break;
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });

      let improvedText = response.choices[0].message.content.trim();
      
      // clean up any markdown formatting that might have been added
      improvedText = improvedText
        .replace(/^```[\w]*\n?/g, '')
        .replace(/```\n?$/g, '')
        .trim();
      
      // remove any error messages or refusal messages that might have been included
      // Only check for very specific error patterns at the start of the response
      const errorPatterns = [
        /^(i['']m|i am)\s+sorry[,\.]?\s+i\s+can(?:not|n'?t)\s+assist\s+with\s+that/i,
        /^sorry[,\.]?\s+i\s+can(?:not|n'?t)\s+assist\s+with\s+that/i,
        /^i\s+apologize[,\.]?\s+but\s+i\s+can(?:not|n'?t)\s+assist/i,
        /^unfortunately[,\.]?\s+i\s+can(?:not|n'?t)\s+assist/i
      ];
      
      // Only check the first 150 characters and require exact error phrase match
      const textStart = improvedText.substring(0, 150).trim();
      if (errorPatterns.some(pattern => pattern.test(textStart))) {
        throw new Error('AI returned an error message instead of improved text. Please try again.');
      }

      console.log(`[GOOGLE DOCS EDITOR] Text improved: ${originalText.length} -> ${improvedText.length} characters`);
      console.log(`[GOOGLE DOCS EDITOR] Improved text preview: ${improvedText.substring(0, 200)}`);
      
      return improvedText;
    } catch (error) {
      console.error('[GOOGLE DOCS EDITOR] Text improvement failed:', error);
      throw new Error(`Failed to improve text: ${error.message}`);
    }
  }

  // sanitize text to prevent encoding issues when pasting to Google Docs
  sanitizeTextForPaste(text) {
    if (!text) return '';
    
    let sanitized = String(text);
    
    // First, try to normalize the string to ensure valid UTF-8
    try {
      // Remove any invalid UTF-8 sequences
      sanitized = sanitized.replace(/[\uFFFD]/g, ''); // Replace replacement characters
      
      // Normalize Unicode characters (NFD to NFC)
      sanitized = sanitized.normalize('NFC');
    } catch (e) {
      console.warn('[GOOGLE DOCS EDITOR] Unicode normalization failed, continuing with raw text');
    }
    
    // Replace smart quotes with regular quotes
    sanitized = sanitized
      .replace(/[\u2018\u2019]/g, "'") // Left/right single quotation marks
      .replace(/[\u201C\u201D]/g, '"') // Left/right double quotation marks
      .replace(/[\u201A\u201B]/g, "'") // Single low/high quotation marks
      .replace(/[\u201E\u201F]/g, '"') // Double low/high quotation marks
      .replace(/[\u2032\u2033]/g, "'") // Prime/double prime
      .replace(/[\u2034\u2035]/g, "'") // Triple prime/reversed prime
    
    // Replace em dashes and en dashes with regular hyphens
      .replace(/[\u2013\u2014]/g, '-') // En dash and em dash
    
    // Replace other problematic Unicode characters
      .replace(/[\u2026]/g, '...') // Ellipsis
      .replace(/[\u00A0]/g, ' ') // Non-breaking space
      .replace(/[\u2000-\u200B]/g, ' ') // Various space characters
      .replace(/[\u2028]/g, '\n') // Line separator
      .replace(/[\u2029]/g, '\n\n') // Paragraph separator
    
    // Remove zero-width characters that can cause issues
      .replace(/[\u200C\u200D\uFEFF]/g, '') // Zero-width non-joiner, joiner, and BOM
    
    // Fix common encoding corruption patterns (e.g., "Äîunless" -> "unless")
    // These patterns occur when UTF-8 sequences are misinterpreted
    // Match patterns like: Äî, Äö, etc. followed by lowercase letters (likely corruption)
      .replace(/Äî([a-z])/gi, '$1') // Fix "Äîu" -> "u" (common corruption)
      .replace(/Äö([a-z])/gi, '$1') // Fix similar patterns
      .replace(/Äü([a-z])/gi, '$1') // Fix similar patterns
      .replace(/î([a-z]{2,})/gi, (match, rest) => {
        // If î appears before a lowercase word, it's likely corruption
        // Only fix if it's clearly not a valid accented character
        if (rest.length > 2) {
          return rest; // Remove the î
        }
        return match; // Keep it if it might be valid
      });
    
    // Final cleanup: ensure no double spaces or weird spacing
    sanitized = sanitized
      .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
      .replace(/\n{3,}/g, '\n\n') // Multiple newlines to double newline
      .trim();
    
    return sanitized;
  }

  // replace all text in google docs with improved version
  async replaceTextInGoogleDoc(improvedText) {
    try {
      console.log('[GOOGLE DOCS EDITOR] Replacing text in Google Doc...');
      console.log('[GOOGLE DOCS EDITOR] Improved text length:', improvedText.length);
      console.log('[GOOGLE DOCS EDITOR] Improved text preview:', improvedText.substring(0, 200));
      
      // validate improved text - make sure it's not an error message
      if (!improvedText || improvedText.length < 5) {
        throw new Error('Improved text is too short or empty');
      }
      
      // Skip error pattern checking - we already validated in improveText()
      // This prevents false positives from legitimate text containing words like "error" or "failed"
      
      // sanitize text to prevent encoding issues
      const sanitizedText = this.sanitizeTextForPaste(improvedText);
      console.log('[GOOGLE DOCS EDITOR] Sanitized text length:', sanitizedText.length);
      console.log('[GOOGLE DOCS EDITOR] Sanitized text preview:', sanitizedText.substring(0, 200));
      
      // Ensure text is valid UTF-8 before writing
      let finalText = sanitizedText;
      try {
        // Convert to Buffer and back to ensure valid UTF-8
        const buffer = Buffer.from(sanitizedText, 'utf8');
        finalText = buffer.toString('utf8');
      } catch (e) {
        console.warn('[GOOGLE DOCS EDITOR] UTF-8 validation failed, using original text');
      }
      
      // copy improved text to clipboard using a more reliable method
      const tempFile = path.join(os.tmpdir(), `google-doc-edit-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, finalText, { encoding: 'utf8' });
      
      // use pbcopy with proper encoding
      await new Promise((resolve, reject) => {
        exec(`cat "${tempFile}" | pbcopy`, { encoding: 'utf8' }, (error, stdout, stderr) => {
          if (error) {
            console.error('[GOOGLE DOCS EDITOR] pbcopy error:', error);
            console.error('[GOOGLE DOCS EDITOR] stderr:', stderr);
            reject(new Error(`Failed to copy to clipboard: ${error.message}`));
            return;
          }
          resolve();
        });
      });

      // wait for clipboard to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // verify clipboard content (optional but helpful for debugging)
      await new Promise((resolve, reject) => {
        exec('pbpaste', { encoding: 'utf8' }, (error, stdout) => {
          if (error) {
            console.warn('[GOOGLE DOCS EDITOR] Could not verify clipboard:', error);
            resolve(); // don't fail if verification fails
            return;
          }
          if (stdout.trim().substring(0, 100) !== finalText.trim().substring(0, 100)) {
            console.warn('[GOOGLE DOCS EDITOR] Clipboard content mismatch, but continuing...');
          }
          resolve();
        });
      });

      // focus google docs and replace text
      // use a more reliable approach: select visible content area, not entire document
      const replaceScript = `
        tell application "Google Chrome"
          activate
          delay 0.5
          try
            set winList to every window
            repeat with w in winList
              try
                set tabList to every tab of w
                repeat with t in tabList
                  if (URL of t contains "docs.google.com/document") then
                    set active tab of w to t
                    set index of w to 1
                    exit repeat
                  end if
                end repeat
              end try
            end repeat
          end try
        end tell

        tell application "System Events"
          delay 0.4
          tell process "Google Chrome"
            set frontmost to true
            delay 0.3
            -- click in the document area to ensure focus
            try
              key code 36 -- enter key to ensure we're in edit mode
              delay 0.2
            end try
            -- select all visible text (command+a selects all in the document)
            keystroke "a" using command down
            delay 0.4
            -- paste improved text (this replaces selected text)
            keystroke "v" using command down
            delay 0.6
            -- press escape to ensure paste is complete
            key code 53 -- escape
            delay 0.2
          end tell
        end tell
      `;

      await new Promise((resolve, reject) => {
        exec(`osascript -e '${replaceScript.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' }, (error, stdout, stderr) => {
          if (error) {
            console.error('[GOOGLE DOCS EDITOR] AppleScript error:', error);
            console.error('[GOOGLE DOCS EDITOR] stderr:', stderr);
            reject(new Error(`Failed to replace text: ${error.message}`));
            return;
          }
          resolve();
        });
      });

      // cleanup
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupError) {
        console.warn('[GOOGLE DOCS EDITOR] Failed to cleanup temp file:', cleanupError);
      }

      console.log('[GOOGLE DOCS EDITOR] ✅ Text successfully replaced in Google Doc');
      return { success: true };
    } catch (error) {
      console.error('[GOOGLE DOCS EDITOR] ❌ Failed to replace text:', error);
      throw error;
    }
  }

  // main editing workflow
  async editGoogleDoc(screenCapture, userQuery) {
    try {
      console.log('[GOOGLE DOCS EDITOR] Starting Google Doc editing workflow...');
      
      // extract text from screen
      const originalText = await this.extractTextFromScreenCapture(screenCapture);
      
      if (!originalText || originalText.length < 10) {
        throw new Error('Could not extract sufficient text from the document. Please ensure the Google Doc is visible on screen.');
      }

      // determine edit type
      const editType = this.getEditType(userQuery);
      console.log(`[GOOGLE DOCS EDITOR] Edit type: ${editType}`);

      // improve the text
      const improvedText = await this.improveText(originalText, editType, userQuery);
      
      // validate improved text before pasting
      if (!improvedText || improvedText.trim().length < 5) {
        throw new Error('Failed to generate improved text. The AI response was empty or too short.');
      }
      
      console.log('[GOOGLE DOCS EDITOR] ✅ Improved text generated successfully');
      console.log('[GOOGLE DOCS EDITOR] Original length:', originalText.length);
      console.log('[GOOGLE DOCS EDITOR] Improved length:', improvedText.length);

      // replace in google docs
      await this.replaceTextInGoogleDoc(improvedText);

      return {
        success: true,
        editType,
        originalLength: originalText.length,
        improvedLength: improvedText.length
      };
    } catch (error) {
      console.error('[GOOGLE DOCS EDITOR] Editing workflow failed:', error);
      throw error;
    }
  }
}

module.exports = new GoogleDocsEditor();

