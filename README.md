# ai-desktop-overlay

an ai-powered desktop overlay application for learning and understanding, built with electron, react, and vite.

## prerequisites

- node.js (v20.17.0 or higher recommended)
- npm

## installation

```bash
npm install --legacy-peer-deps
```

note: the `--legacy-peer-deps` flag is required due to peer dependency conflicts with tensorflow packages.

## environment setup

create a `.env` file in the project root with the following variables:

```env
# OpenAI API Key (Required)
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here

# Spotify API Credentials (Optional - for music features)
# Get credentials from: https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# Search Engine API Key (Optional - for enhanced search features)
# SEARCH_ENGINE_API_KEY=your_search_engine_api_key_here

# Server Port (Optional - defaults to 3000)
# PORT=3000
```

**important:** the `OPENAI_API_KEY` is required for the application to function. other variables are optional.

## running the application

to start the development environment (runs vite dev server, electron app, and express server concurrently):

```bash
npm run dev
```

this will:
- start the vite development server on port 5174
- launch the electron desktop application
- start the express backend server

## available scripts

- `npm run dev` - start development environment (vite + electron + server)
- `npm run build` - build the vite application for development
- `npm run build:prod` - build the vite application for production
- `npm run server` - run only the express server
- `npm run package` - package the electron app for distribution (macos and windows)
- `npm run package:mac` - package only for macos
- `npm run package:win` - package only for windows

## beta distribution for users

### for developers/distributors

to create distributable packages for beta users:

1. **ensure your .env file is set up:**
   - make sure your `.env` file in the project root contains your `OPENAI_API_KEY`
   - this will be automatically included in the packaged app

2. **package for distribution:**
   ```bash
   # Package for both platforms
   npm run package
   
   # Or package for specific platform
   npm run package:mac    # macOS only
   npm run package:win    # Windows only
   ```

3. **find the packaged apps:**
   - packaged applications will be in the `dist/` directory
   - macos: `dist/ai-overlay-darwin-x64/ai-overlay.app`
   - windows: `dist/ai-overlay-win32-x64/ai-overlay.exe`
   - the `.env` file with your api key is automatically included

4. **create a distribution zip:**
   - zip the entire platform folder (e.g., `ai-overlay-darwin-x64` or `ai-overlay-win32-x64`)
   - users can download, extract, and run immediately - no setup required!

### for beta users

**system requirements:**
- macos 10.13+ or windows 10+
- no additional software or api keys needed - everything is included!

**installation & usage:**

1. **download and extract:**
   - download the zip file for your platform (macos or windows)
   - extract the zip file to any location on your computer

2. **macos:**
   - open the extracted folder
   - double-click `ai-overlay.app` to launch
   - if you see a security warning (app is not code-signed):
     - right-click the app → select "open"
     - or go to system preferences → security & privacy → click "open anyway"
   - grant screen recording and accessibility permissions when prompted (required for screen capture)

3. **windows:**
   - open the extracted folder
   - double-click `ai-overlay.exe` to launch
   - if windows shows a security warning:
     - click "more info" → "run anyway"
   - grant necessary permissions when prompted

4. **that's it!**
   - the app will start automatically
   - no configuration needed - the api key is already included
   - the ai assistant overlay will appear on your screen

**troubleshooting:**
- if the app doesn't start, ensure ports 3000 and 5174 are not in use by other applications
- on macos, make sure you've granted screen recording and accessibility permissions in system preferences
- if you see errors, check that you extracted the entire folder (not just the .app or .exe file)

**keyboard shortcuts:**
- `cmd+e` (mac) / `ctrl+e` (win): clear prompt and output
- `cmd+q` (mac) / `ctrl+q` (win): quit application

## project structure

- `src/` - react application source code
  - `components/` - react components
  - `services/` - backend service integrations
  - `styles/` - css stylesheets
  - `utils/` - utility functions
- `main.js` - electron main process
- `preload.js` - electron preload script
- `server.js` - express backend server
- `vite.config.js` - vite configuration

## features

- ai-powered learning assistant
- interactive tutoring overlay
- research workflow tools
- memory system for learning context
- speech recognition
- screen capture capabilities




