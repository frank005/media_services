# Agora Media Services Demo

A comprehensive demo application showcasing four Agora media services:
- **Media Pull**: Pull video streams from external URLs into Agora channels
- **Media Push**: Push Agora channel streams to external platforms (Facebook, YouTube, Custom RTMP)
- **Media Gateway**: Bridge OBS Studio with Agora channels via WebSocket
- **Cloud Transcoding**: Real-time transcoding, audio mixing, and video compositing

## Features

### Media Pull
- Start Media Pull with custom video URL (default AWS URL provided)
- List all active Media Pulls
- Delete Media Pulls
- Join channel as audience member to view the pulled stream
- RESTful API integration for all operations

### Media Push
- Join as host using Agora SDK or use Media Pull as source
- Push streams to Facebook, YouTube, or custom RTMP endpoints
- Get converter status
- Update push configuration
- Delete converters
- Join channel as audience member

### Media Gateway
- Connect to OBS Studio via WebSocket
- Start/Stop Media Gateway streams
- Get gateway status
- Complete OBS setup instructions included
- Join channel as audience member to view gateway streams

### Cloud Transcoding
- Acquire transcoding resources
- Create transcoding configurations
- Query transcoding status
- Update transcoding settings
- Destroy transcoding sessions
- Create and query transcoding templates
- Join channel as audience member

## Project Structure

```
media_services/
├── frontend/              # Frontend application files
│   ├── index.html        # Main HTML file
│   ├── css/              # Stylesheets
│   │   └── modern-ui-library.css
│   └── js/               # JavaScript files
│       ├── app.js        # Main application logic
│       ├── AccessToken2.js
│       ├── RtcTokenBuilder2.js
│       └── pako.min.js
├── netlify/              # Netlify Functions (backend proxy)
│   └── functions/
│       └── proxy.js      # Generic API proxy function
├── netlify.toml          # Netlify configuration
└── package.json          # Node.js dependencies
```

## Deployment

### Deploy to Netlify

This application uses Netlify Functions to proxy API requests, avoiding CORS preflight issues. To deploy:

1. **Connect to Netlify**:
   - Push this repository to GitHub
   - Connect your GitHub repository to Netlify
   - Netlify will automatically detect the `netlify.toml` configuration

2. **Build Settings** (auto-detected):
   - Build command: (none required)
   - Publish directory: `frontend`
   - Functions directory: `netlify/functions`

3. **Deploy**:
   - Netlify will automatically deploy on every push to the main branch
   - Or trigger a manual deploy from the Netlify dashboard

### Local Development

For local development, you can use Netlify CLI:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Serve locally with Netlify Functions
netlify dev
```

This will start a local server with the proxy functions available at `http://localhost:8888`.

## Setup

1. **Clone or download this repository**

2. **Open `frontend/index.html` in a web browser** (or deploy to Netlify)

3. **Set API Credentials**:
   - Click "Set API Credentials" button
   - Enter your Agora:
     - Customer ID
     - Customer Secret
     - App ID
   - Credentials are saved in browser localStorage

4. **For Media Gateway (OBS Setup)**:
   - Install OBS Studio
   - Open OBS → Tools → WebSocket Server Settings
   - Enable WebSocket Server
   - Set Server Port to 4455
   - Enable Authentication
   - Set a custom Server Password (remember this!)
   - Enter the password in the demo interface
   - Click "Connect to OBS"

## Usage

### Media Pull
1. Enter a video URL (default AWS URL is pre-filled)
2. Enter channel name (default: "testChannel")
3. Optionally set UID and Token
4. Click "Start Media Pull"
5. Click "Join as Audience" to view the stream in the video player
6. Use "List Media Pulls" to see all active pulls
7. Use "Delete Media Pull" to stop a pull

### Media Push
1. Choose join method (SDK Host or Media Pull)
2. Enter channel name
3. Select destination (Facebook, YouTube, or Custom)
4. Enter RTMP URL and Stream Key for selected destination
5. Click "Start Push"
6. Converter ID will be auto-populated for status/update/delete operations
7. Click "Join as Audience" to view the stream

### Media Gateway
1. Set up OBS WebSocket (see Setup section)
2. Enter OBS WebSocket password and port
3. Click "Connect to OBS"
4. Enter channel name
5. Click "Start Gateway"
6. Start streaming from OBS
7. Click "Join as Audience" to view the stream

### Cloud Transcoding
1. Enter channel name
2. Click "Create" to start a transcoding task
3. Use "Query" to list all transcoding tasks
4. Use "Update" to modify transcoding settings (requires Task ID)
5. Use "Destroy" to delete a transcoding task
6. Click "Join as Audience" to view transcoded stream
7. Note: Acquire and Template functions are not available via REST API

## API Endpoints Used

All endpoints use the base URL `https://api.agora.io/v1/projects/{appid}/`

### Media Pull
- `POST /v1/projects/{appid}/cloud-player/players` - Create Cloud Player
- `GET /v1/projects/{appid}/cloud-player/players` - List Cloud Players
- `DELETE /v1/projects/{appid}/cloud-player/players/{playerId}` - Delete Cloud Player

### Media Push
- `POST /v1/projects/{appid}/rtmp-converters` - Create Converter
- `GET /v1/projects/{appid}/rtmp-converters` - List Converters
- `PATCH /v1/projects/{appid}/rtmp-converters/{converterId}` - Update Converter
- `DELETE /v1/projects/{appid}/rtmp-converters/{converterId}` - Delete Converter

### Media Gateway
- `PUT /v1/projects/{appid}/rtls/ingress/streamkeys` - Create Streaming Key
- `GET /v1/projects/{appid}/rtls/ingress/streamkeys` - List Streaming Keys
- `DELETE /v1/projects/{appid}/rtls/ingress/streamkeys/{streamKey}` - Delete Streaming Key

### Cloud Transcoding
- `POST /v1/projects/{appid}/cloud-transcoding/tasks` - Create Transcoding Task
- `GET /v1/projects/{appid}/cloud-transcoding/tasks` - List Transcoding Tasks
- `PATCH /v1/projects/{appid}/cloud-transcoding/tasks/{taskId}` - Update Transcoding Task
- `DELETE /v1/projects/{appid}/cloud-transcoding/tasks/{taskId}` - Delete Transcoding Task

## Video Player

Each service tab includes a video player that allows you to join the channel as an audience member. The player will automatically display remote video tracks when available.

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Dependencies

- Agora RTC SDK (loaded via CDN)
- Tailwind CSS (loaded via CDN)
- Modern UI Library (included)

## Notes

- All API credentials are stored in browser localStorage
- Video players are per-service (separate for each tab)
- OBS WebSocket connection is required for Media Gateway
- Media Gateway returns a streaming key that should be used in OBS with server: `rtmp://rtmp.agora.io/live`
- Some operations require IDs from previous operations (Player ID, Converter ID, Task ID, Stream Key)
- **API requests are proxied through Netlify Functions** to avoid CORS preflight issues
- The proxy function handles all Agora API calls (api.agora.io and api.sd-rtn.com)

## Documentation Links

- [Media Pull Documentation](https://docs.agora.io/en/media-pull/overview/product-overview)
- [Media Push Documentation](https://docs.agora.io/en/media-push/overview/product-overview)
- [Media Gateway Documentation](https://docs.agora.io/en/media-gateway/overview/product-overview)
- [Cloud Transcoding Documentation](https://docs.agora.io/en/cloud-transcoding/overview/product-overview)
- [Agora REST API Examples (Postman)](https://documenter.getpostman.com/view/6319646/SVSLr9AM#6aed9690-285e-45f0-a329-c995adbd0956)

## License

This demo is provided as-is for demonstration purposes.

