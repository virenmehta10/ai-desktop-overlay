const SpotifyWebApi = require('spotify-web-api-node');
const { exec } = require('child_process');

// Debug logging
console.log('Spotify Credentials Check:');
console.log('Client ID exists:', !!process.env.SPOTIFY_CLIENT_ID);
console.log('Client Secret exists:', !!process.env.SPOTIFY_CLIENT_SECRET);

// Initialize Spotify API client with exact redirect URI
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://127.0.0.1:3000/callback'
});

// Scopes we need for the application
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-modify-playback-state',
  'user-read-playback-state',
  'streaming'
];

/**
 * Get the authorization URL for Spotify login
 */
function getAuthUrl() {
  return spotifyApi.createAuthorizeURL(SCOPES, 'state');
}

/**
 * Exchange the authorization code for access and refresh tokens
 */
async function handleCallback(code) {
  const data = await spotifyApi.authorizationCodeGrant(code);
  
  // Save the access token and refresh token
  spotifyApi.setAccessToken(data.body['access_token']);
  spotifyApi.setRefreshToken(data.body['refresh_token']);

  return {
    accessToken: data.body['access_token'],
    refreshToken: data.body['refresh_token'],
    expiresIn: data.body['expires_in']
  };
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body['access_token']);
    return data.body['access_token'];
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

// Helper function to check if Spotify is running
async function isSpotifyRunning() {
  return new Promise((resolve) => {
    exec('pgrep -f "Spotify"', (error, stdout, stderr) => {
      resolve(!!stdout);
    });
  });
}

// Helper function to ensure Spotify is open
async function ensureSpotifyIsOpen() {
  const isRunning = await isSpotifyRunning();
  if (!isRunning) {
    await new Promise((resolve, reject) => {
      exec('open -a "Spotify"', (error) => {
        if (error) {
          reject(new Error('Failed to open Spotify'));
        } else {
          // Give Spotify a moment to start up
          setTimeout(resolve, 2000);
        }
      });
    });
  }
}

// Helper function to control Spotify via AppleScript
async function controlSpotify(command) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e 'tell application "Spotify" to ${command}'`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Function to play a specific song
async function playSong(songName, artist) {
  try {
    await ensureSpotifyIsOpen();
    
    // Search for the song
    const searchQuery = artist ? `${songName} artist:${artist}` : songName;
    const searchResult = await spotifyApi.searchTracks(searchQuery);
    
    if (!searchResult.body.tracks.items.length) {
      throw new Error('Song not found');
    }

    const track = searchResult.body.tracks.items[0];
    const trackUri = track.uri;

    // Use AppleScript to play the track
    await controlSpotify(`play track "${trackUri}"`);
    
    return {
      success: true,
      message: `Now playing "${track.name}" by ${track.artists[0].name}`,
      track: {
        name: track.name,
        artist: track.artists[0].name,
        uri: trackUri
      }
    };
  } catch (error) {
    console.error('Error playing song:', error);
    if (error.statusCode === 401) {
      try {
        // Try refreshing the token
        await refreshAccessToken();
        // Retry the operation
        return await playSong(songName, artist);
      } catch (refreshError) {
        throw new Error('Please authenticate with Spotify first');
      }
    }
    throw error;
  }
}

// Function to parse play commands
function parsePlayCommand(query) {
  // Pattern: play {song} by {artist} on spotify
  const playPattern = /^(?:can you )?(?:please )?play\s+([^"]+?)(?:\s+by\s+([^"]+?))?\s+(?:on\s+)?spotify$/i;
  const match = query.match(playPattern);
  
  if (match) {
    const [_, song, artist] = match;
    return {
      song: song.trim(),
      artist: artist ? artist.trim() : null
    };
  }
  
  return null;
}

module.exports = {
  playSong,
  parsePlayCommand,
  spotifyApi,
  getAuthUrl,
  handleCallback,
  refreshAccessToken
}; 