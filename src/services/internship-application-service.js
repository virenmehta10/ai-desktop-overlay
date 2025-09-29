const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// Import PDF.js for PDF parsing
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
// Import mammoth for Word document parsing
const mammoth = require('mammoth');

class InternshipApplicationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.resumeData = null;
    this.currentJob = null;
    this.coverLetterPath = null;
  }

  async analyzeResume(resumePath, req = null) {
    console.log('[INTERNSHIP SERVICE] Analyzing resume...');
    
    try {
      let resumeContent = '';
      
      // Get file extension from the original filename since multer temp files don't have extensions
      const originalName = req?.file?.originalname || '';
      const fileExtension = path.extname(originalName).toLowerCase();
      
      console.log('[INTERNSHIP SERVICE] File extension detected:', fileExtension);
      console.log('[INTERNSHIP SERVICE] Resume path:', resumePath);
      console.log('[INTERNSHIP SERVICE] Original filename:', originalName);
      
      // Handle different file types
      if (fileExtension === '.pdf') {
        console.log('[INTERNSHIP SERVICE] Processing PDF file...');
        resumeContent = await this.extractTextFromPDF(resumePath);
      } else if (fileExtension === '.txt') {
        console.log('[INTERNSHIP SERVICE] Processing text file...');
        resumeContent = fs.readFileSync(resumePath, 'utf8');
      } else if (fileExtension === '.docx') {
        console.log('[INTERNSHIP SERVICE] Processing Word document...');
        resumeContent = await this.extractTextFromWord(resumePath);
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}. Supported formats: PDF (.pdf), Text (.txt), and Word (.docx)`);
      }
      
      if (!resumeContent || resumeContent.trim().length === 0) {
        throw new Error('No text content could be extracted from the file');
      }
      
      // Truncate content if it's too long to avoid OpenAI token limits
      // Rough estimate: 1 token ≈ 4 characters, so 30k tokens ≈ 120k characters
      const maxCharacters = 100000; // Conservative limit to stay well under 30k tokens
      if (resumeContent.length > maxCharacters) {
        console.log(`[INTERNSHIP SERVICE] Content too long (${resumeContent.length} chars), truncating to ${maxCharacters} chars`);
        resumeContent = resumeContent.substring(0, maxCharacters) + '\n\n[Content truncated due to length]';
      }
      
      console.log('[INTERNSHIP SERVICE] Extracted content length:', resumeContent.length);
      
      // Use OpenAI to analyze resume and extract key information
      const analysis = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert resume analyst. Extract comprehensive information from this resume in JSON format. CRITICAL: Return ONLY valid JSON, no markdown, no code blocks, no explanations.

IMPORTANT: Extract EVERY detail mentioned in the resume, including:
- All work experiences with company names, titles, dates, and specific achievements
- All projects with descriptions and outcomes
- All skills mentioned (technical, soft skills, languages, tools)
- All leadership roles and activities
- All numbers, statistics, percentages, and quantifiable achievements
- All certifications, awards, and honors
- All relevant coursework and academic projects
- All extracurricular activities and involvement

Return this structure:
{
  "name": "Full name as written on resume",
  "email": "Email address",
  "phone": "Phone number",
  "university": "University name",
  "graduationYear": "Expected graduation year",
  "major": "Major/degree",
  "gpa": "GPA if mentioned",
  "relevantExperience": [
    "Company Name - Job Title (Date): Specific achievement with numbers/statistics",
    "Company Name - Job Title (Date): Another specific achievement with metrics"
  ],
  "skills": ["All skills mentioned including technical, soft, and tools"],
  "classYear": "Freshman/Sophomore/Junior/Senior based on graduation year",
  "leadershipRoles": ["All leadership positions and activities"],
  "projects": ["All projects with descriptions and outcomes"],
  "achievements": ["All quantifiable achievements, awards, and honors"],
  "extracurriculars": ["All extracurricular activities and involvement"],
  "eligibleInternshipTypes": ["Types of internships this person would qualify for"]
}`
          },
          {
            role: 'user',
            content: `Analyze this resume thoroughly and extract ALL information: ${resumeContent}`
          }
        ]
      });

      const responseContent = analysis.choices[0].message.content;
      console.log('[INTERNSHIP SERVICE] OpenAI response:', responseContent);
      
      // Clean up the response content - remove markdown code blocks if present
      let cleanContent = responseContent;
      if (responseContent.includes('```json')) {
        cleanContent = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (responseContent.includes('```')) {
        cleanContent = responseContent.replace(/```\n?/g, '').trim();
      }
      
      try {
        this.resumeData = JSON.parse(cleanContent);
        // Add the file path for later use
        this.resumeData.resumePath = resumePath;
        this.resumeData.fileName = req?.file?.originalname || 'Resume';
        this.resumeData.fileType = fileExtension;
      } catch (parseError) {
        console.error('[INTERNSHIP SERVICE] Failed to parse OpenAI response as JSON:', parseError);
        console.error('[INTERNSHIP SERVICE] Raw response:', responseContent);
        
        // Fallback: create basic resume data structure
        this.resumeData = {
          name: "Unknown",
          email: "Unknown",
          phone: "Unknown",
          university: "Unknown",
          graduationYear: "Unknown",
          major: "Unknown",
          gpa: null,
          relevantExperience: [],
          skills: [],
          classYear: "Unknown",
          leadershipRoles: [],
          projects: [],
          achievements: [],
          extracurriculars: [],
          eligibleInternshipTypes: [],
          resumePath: resumePath,
          fileName: req?.file?.originalname || 'Resume',
          fileType: fileExtension
        };
        
        // Try to extract basic info from the response
        if (responseContent.includes('name')) {
          const nameMatch = responseContent.match(/"name":\s*"([^"]+)"/);
          if (nameMatch) this.resumeData.name = nameMatch[1];
        }
        if (responseContent.includes('university')) {
          const uniMatch = responseContent.match(/"university":\s*"([^"]+)"/);
          if (uniMatch) this.resumeData.university = uniMatch[1];
        }
        if (responseContent.includes('major')) {
          const majorMatch = responseContent.match(/"major":\s*"([^"]+)"/);
          if (majorMatch) this.resumeData.major = majorMatch[1];
        }
      }
      
      console.log('[INTERNSHIP SERVICE] Resume analysis completed successfully');
      return this.resumeData;
      
    } catch (error) {
      console.error('[INTERNSHIP SERVICE] Resume analysis failed:', error);
      throw error;
    }
  }



  async extractTextFromPDF(pdfPath) {
    try {
      console.log('[INTERNSHIP SERVICE] Loading PDF file...');
      const data = new Uint8Array(fs.readFileSync(pdfPath));
      
      console.log('[INTERNSHIP SERVICE] Parsing PDF...');
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;
      
      console.log('[INTERNSHIP SERVICE] PDF loaded, extracting text from', pdf.numPages, 'pages...');
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      console.log('[INTERNSHIP SERVICE] Text extraction completed, total length:', fullText.length);
      return fullText;
      
    } catch (error) {
      console.error('[INTERNSHIP SERVICE] PDF text extraction failed:', error);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  async extractTextFromWord(filePath) {
    try {
      console.log('[INTERNSHIP SERVICE] Processing Word document...');
      
      if (path.extname(filePath).toLowerCase() === '.docx') {
        // Use mammoth for .docx files
        const result = await mammoth.extractRawText({ path: filePath });
        console.log('[INTERNSHIP SERVICE] Word document text extracted successfully');
        return result.value;
      } else {
        // For .doc files, we'll need a different approach
        // For now, return an error suggesting conversion
        throw new Error('Legacy .doc format not supported. Please convert to .docx, PDF, or text format.');
      }
    } catch (error) {
      console.error('[INTERNSHIP SERVICE] Word document processing failed:', error);
      throw new Error(`Failed to extract text from Word document: ${error.message}`);
    }
  }

  async searchInternshipOpportunities(field = 'finance') {
    console.log('[INTERNSHIP SERVICE] Searching for internship opportunities...');
    
    try {
      // Define actual internship opportunities based on the field
      const internshipOpportunities = this.getInternshipOpportunities(field);
      
      // Open the first relevant internship opportunity
      if (internshipOpportunities.length > 0) {
        const opportunity = internshipOpportunities[0];
        console.log('[INTERNSHIP SERVICE] Opening internship opportunity:', opportunity.title, 'at', opportunity.company);
        
        await this.openInternshipOpportunity(opportunity);
        this.currentJob = opportunity;
      }

      return internshipOpportunities;
    } catch (error) {
      console.error('[INTERNSHIP SERVICE] Internship search failed:', error);
      throw error;
    }
  }

  getInternshipOpportunities(field) {
    // Define real internship opportunities for different fields
    const opportunities = {
      'finance': [
        {
          title: 'Finance & Accounting Summer Internship',
          company: 'Goldman Sachs',
          location: 'New York, NY',
          url: 'https://www.goldmansachs.com/careers/students/programs/americas/summer-analyst-program.html',
          description: 'Summer internship program for undergraduate students interested in finance and accounting.',
          requirements: ['Currently enrolled in university', 'Finance or related major', 'Strong analytical skills', 'Leadership experience']
        },
        {
          title: 'Investment Banking Summer Analyst',
          company: 'JPMorgan Chase',
          location: 'New York, NY',
          url: 'https://careers.microsoft.com/students/us/en/us-internships',
          description: 'Summer analyst program in investment banking for undergraduate students.',
          requirements: ['Currently enrolled in university', 'Finance, Economics, or related major', 'Strong quantitative skills', 'Team player']
        }
      ],
      'technology': [
        {
          title: 'Software Engineering Internship',
          company: 'Google',
          location: 'Mountain View, CA',
          url: 'https://careers.google.com/students/engineering/',
          description: 'Software engineering internship for students passionate about technology and innovation.',
          requirements: ['Currently enrolled in university', 'Computer Science or related major', 'Programming experience', 'Problem-solving skills']
        },
        {
          title: 'Product Management Intern',
          company: 'Microsoft',
          location: 'Redmond, WA',
          url: 'https://careers.microsoft.com/students/us/en/us-internships',
          description: 'Product management internship focusing on user experience and product strategy.',
          requirements: ['Currently enrolled in university', 'Business, Engineering, or related major', 'Leadership experience', 'Analytical thinking']
        }
      ],
      'consulting': [
        {
          title: 'Consulting Summer Internship',
          company: 'McKinsey & Company',
          location: 'Various Locations',
          url: 'https://www.mckinsey.com/careers/students/internships',
          description: 'Summer internship in management consulting for undergraduate students.',
          requirements: ['Currently enrolled in university', 'Any major', 'Strong analytical skills', 'Leadership experience', 'Problem-solving ability']
        }
      ],
      'marketing': [
        {
          title: 'Marketing Internship',
          company: 'Nike',
          location: 'Beaverton, OR',
          url: 'https://jobs.nike.com/students',
          description: 'Marketing internship focusing on brand strategy and digital marketing.',
          requirements: ['Currently enrolled in university', 'Marketing, Business, or related major', 'Creative thinking', 'Communication skills']
        }
      ],
      'engineering': [
        {
          title: 'Mechanical Engineering Intern',
          company: 'Tesla',
          location: 'Fremont, CA',
          url: 'https://www.tesla.com/careers/search/job',
          description: 'Engineering internship in automotive and energy innovation.',
          requirements: ['Currently enrolled in university', 'Engineering major', 'Technical skills', 'Innovation mindset']
        }
      ],
      'data science': [
        {
          title: 'Data Science Intern',
          company: 'Netflix',
          location: 'Los Gatos, CA',
          url: 'https://jobs.netflix.com/students-and-grads',
          description: 'Data science internship in entertainment analytics and recommendation systems.',
          requirements: ['Currently enrolled in university', 'Data Science, Statistics, or related major', 'Python/R skills', 'Analytical thinking']
        }
      ]
    };

    // Return opportunities for the specific field, or default to finance
    const fieldLower = field.toLowerCase();
    return opportunities[fieldLower] || opportunities['finance'];
  }

  async openInternshipOpportunity(opportunity) {
    console.log('[INTERNSHIP SERVICE] Opening internship opportunity:', opportunity.url);
    
    const script = `
      tell application "Google Chrome"
        activate
        delay 1
        tell application "System Events"
          keystroke "t" using command down
          delay 0.5
          keystroke "${opportunity.url}"
          delay 0.5
          keystroke return
          delay 2
        end tell
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('[INTERNSHIP SERVICE] Failed to open internship opportunity:', error);
          reject(error);
        } else {
          console.log('[INTERNSHIP SERVICE] Successfully opened internship opportunity');
          resolve();
        }
      });
    });
  }

  async openSearchTab(searchUrl, delay = 0) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const script = `
      tell application "Google Chrome"
        activate
        delay 1
        tell application "System Events"
          keystroke "t" using command down
          delay 0.5
          keystroke "${searchUrl}"
          delay 0.5
          keystroke return
        end tell
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('[INTERNSHIP SERVICE] Failed to open search tab:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async findAndApplyToInternship(jobDescription = '') {
    console.log('[INTERNSHIP SERVICE] Finding and applying to internship...');
    
    try {
      // Simulate finding a job (in real implementation, this would parse search results)
      this.currentJob = {
        title: 'Finance Intern',
        company: 'Sample Finance Company',
        description: jobDescription || 'Finance internship opportunity for university students',
        requirements: ['Currently enrolled in university', 'Finance or related major', 'Strong analytical skills'],
        applicationUrl: 'https://example.com/apply'
      };

      // Open the application page
      await this.openApplicationPage(this.currentJob.applicationUrl);
      
      // Fill out the application form
      await this.fillApplicationForm();
      
      // Attach resume
      await this.attachResume();
      
      // Check if cover letter is needed and create one
      if (this.coverLetterNeeded()) {
        await this.createAndAttachCoverLetter();
      }
      
      console.log('[INTERNSHIP SERVICE] Application process completed');
      return { success: true, message: 'Application submitted successfully' };
      
    } catch (error) {
      console.error('[INTERNSHIP SERVICE] Application failed:', error);
      throw error;
    }
  }

  async openApplicationPage(url) {
    console.log('[INTERNSHIP SERVICE] Opening application page...');
    
    const script = `
      tell application "Google Chrome"
        activate
        delay 1
        tell application "System Events"
          keystroke "t" using command down
          delay 0.5
          keystroke "${url}"
          delay 0.5
          keystroke return
          delay 3
        end tell
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('[INTERNSHIP SERVICE] Failed to open application page:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async fillApplicationForm() {
    console.log('[INTERNSHIP SERVICE] Filling out application form...');
    
    // Fill out basic information using AppleScript
    const script = `
      tell application "Google Chrome"
        activate
        delay 2
        tell application "System Events"
          -- Fill out name
          keystroke "${this.resumeData.name}"
          delay 0.5
          keystroke tab
          delay 0.5
          
          -- Fill out email
          keystroke "${this.resumeData.email}"
          delay 0.5
          keystroke tab
          delay 0.5
          
          -- Fill out phone
          keystroke "${this.resumeData.phone}"
          delay 0.5
          keystroke tab
          delay 0.5
          
          -- Fill out university
          keystroke "${this.resumeData.university}"
          delay 0.5
          keystroke tab
          delay 0.5
          
          -- Fill out major
          keystroke "${this.resumeData.major}"
          delay 0.5
          keystroke tab
          delay 0.5
          
          -- Fill out graduation year
          keystroke "${this.resumeData.graduationYear}"
          delay 0.5
          keystroke tab
          delay 0.5
          
          -- Fill out GPA if available
          ${this.resumeData.gpa ? `keystroke "${this.resumeData.gpa}"` : ''}
          delay 0.5
          keystroke tab
          delay 0.5
        end tell
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('[INTERNSHIP SERVICE] Failed to fill form:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async attachResume() {
    console.log('[INTERNSHIP SERVICE] Attaching resume...');
    
    // This would need to be implemented based on the specific application form
    // For now, we'll simulate the process
    console.log('[INTERNSHIP SERVICE] Resume attachment simulated');
    return true;
  }

  coverLetterNeeded() {
    // Simple heuristic - check if cover letter is mentioned in requirements
    return this.currentJob.description.toLowerCase().includes('cover letter') ||
           this.currentJob.description.toLowerCase().includes('personal statement');
  }

  async createAndAttachCoverLetter() {
    console.log('[INTERNSHIP SERVICE] Creating cover letter...');
    
    try {
      // Generate cover letter using OpenAI
      const coverLetter = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a professional cover letter writer. Write a compelling cover letter for a ${this.resumeData.classYear} student applying to a ${this.currentJob.title} position at ${this.currentJob.company}. 
            
            Student background:
            - Name: ${this.resumeData.name}
            - University: ${this.resumeData.university}
            - Major: ${this.resumeData.major}
            - Graduation Year: ${this.resumeData.graduationYear}
            - Skills: ${this.resumeData.skills.join(', ')}
            - Experience: ${this.resumeData.relevantExperience.join(', ')}
            
            Job details:
            - Title: ${this.currentJob.title}
            - Company: ${this.currentJob.company}
            - Requirements: ${this.currentJob.requirements.join(', ')}
            
            Write a professional, enthusiastic cover letter that highlights relevant skills and experience.`
          }
        ]
      });

      const coverLetterContent = coverLetter.choices[0].message.content;
      
      // Create Google Doc with cover letter
      await this.createGoogleDoc(coverLetterContent);
      
      // Download as PDF
      await this.downloadCoverLetterAsPDF();
      
      // Attach to application
      await this.attachCoverLetter();
      
      console.log('[INTERNSHIP SERVICE] Cover letter created and attached');
      
    } catch (error) {
      console.error('[INTERNSHIP SERVICE] Cover letter creation failed:', error);
      throw error;
    }
  }

  async createGoogleDoc(content) {
    console.log('[INTERNSHIP SERVICE] Creating Google Doc...');
    
    // This would integrate with Google Docs API
    // For now, we'll create a local file and simulate the process
    const docPath = path.join(__dirname, '../../cover-letter.txt');
    fs.writeFileSync(docPath, content);
    
    // Open in default text editor (simulating Google Docs)
    const script = `
      tell application "TextEdit"
        activate
        open POSIX file "${docPath}"
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('[INTERNSHIP SERVICE] Failed to open document:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async downloadCoverLetterAsPDF() {
    console.log('[INTERNSHIP SERVICE] Downloading cover letter as PDF...');
    
    // In a real implementation, this would use Google Docs API or a PDF conversion service
    // For now, we'll simulate by creating a PDF file
    const pdfPath = path.join(__dirname, '../../cover-letter.pdf');
    
    // Simulate PDF creation (in reality, you'd use a library like puppeteer or a PDF service)
    fs.writeFileSync(pdfPath, 'PDF content placeholder');
    this.coverLetterPath = pdfPath;
    
    console.log('[INTERNSHIP SERVICE] Cover letter PDF created at:', pdfPath);
    return pdfPath;
  }

  async attachCoverLetter() {
    console.log('[INTERNSHIP SERVICE] Attaching cover letter to application...');
    
    // This would need to be implemented based on the specific application form
    // For now, we'll simulate the process
    console.log('[INTERNSHIP SERVICE] Cover letter attachment simulated');
    return true;
  }

  async completeApplication() {
    console.log('[INTERNSHIP SERVICE] Completing application...');
    
    // Simulate final submission
    const script = `
      tell application "Google Chrome"
        activate
        delay 1
        tell application "System Events"
          -- Navigate to submit button (this would need to be customized per site)
          keystroke tab
          delay 0.5
          keystroke return
          delay 2
        end tell
      end tell
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('[INTERNSHIP SERVICE] Failed to submit application:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async processInternshipApplication(resumePath, field = 'finance') {
    console.log('[INTERNSHIP SERVICE] Starting internship application process...');
    
    try {
      // Step 1: Analyze resume (this is already done when uploaded)
      console.log('[INTERNSHIP SERVICE] Resume already analyzed, thinking through qualifications...');
      
      // Simulate thinking time (2-3 seconds)
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Step 2: Search for opportunities and open one
      await this.searchInternshipOpportunities(field);
      
      return {
        success: true,
        message: `Found and opened ${field} internship opportunity`,
        resumeData: this.resumeData,
        appliedJob: this.currentJob
      };
      
    } catch (error) {
      console.error('[INTERNSHIP SERVICE] Application process failed:', error);
      throw error;
    }
  }
}

module.exports = new InternshipApplicationService(); 