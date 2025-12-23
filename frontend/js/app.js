// Global variables
let customerId = localStorage.getItem("customerId") || "";
let customerSecret = localStorage.getItem("customerSecret") || "";
let appid = localStorage.getItem("appid") || "";
let appCertificate = localStorage.getItem("appCertificate") || "";
let region = localStorage.getItem("region") || "na"; // Default to North America (na/eu/ap/cn)

// Function to refresh credentials from localStorage
function refreshCredentials() {
    customerId = localStorage.getItem("customerId") || "";
    customerSecret = localStorage.getItem("customerSecret") || "";
    appid = localStorage.getItem("appid") || "";
    appCertificate = localStorage.getItem("appCertificate") || "";
    region = localStorage.getItem("region") || "na";
    console.log("Credentials refreshed from localStorage");
}

// Separate RTC clients for host and audience
let hostRtcClient = null;
let audienceRtcClient = null;
let localAudioTrack = null;
let localVideoTrack = null;

// Media Push converter ID
let mediaPushConverterId = null;

// Media Pull player ID
let mediaPullPlayerId = null;
// Track update sequence number for Media Pull
let mediaPullUpdateSequence = 0;

// Media Gateway streaming key
let mediaGatewayStreamKey = null;

// Cloud Transcoding task ID and instance ID
let transcodingTaskId = null;
let transcodingInstanceId = null;

// OBS WebSocket connection
let obsWebSocket = null;

// Popup notification system
var popups = 0;
function showPopup(message) {
    const newPopup = popups + 1;
    const y = document.createElement('div');
    y.id = `popup-${newPopup}`;
    y.className = "popupHidden";
    y.textContent = message;
    document.getElementById("popup-section").appendChild(y);
    const x = document.getElementById(`popup-${newPopup}`);
    x.className = "popupShow";
    const z = popups * 10;
    x.style.left = `${50 + z}%`;
    popups++;
    setTimeout(function() {
        const popup = document.getElementById(`popup-${newPopup}`);
        if (popup) {
            popup.remove();
            popups--;
        }
    }, 3000);
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });
});

// Tooltip positioning - ensure tooltips appear above elements and aren't clipped
let tooltipEl = null;
let tooltipTimeout = null;
let currentTooltipElement = null;
const tooltipElements = new WeakSet(); // Track which elements have tooltip listeners

function setupTooltips() {
    // Create a single tooltip element that we'll reuse
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'global-tooltip';
        document.body.appendChild(tooltipEl);
    }
    
    // Add tooltips to elements that don't have them yet
    document.querySelectorAll('[data-tooltip], [title]').forEach(element => {
        // Skip if we've already added listeners to this element
        if (tooltipElements.has(element)) return;
        
        // Get tooltip text (prefer data-tooltip over title)
        const tooltipText = element.getAttribute('data-tooltip') || element.getAttribute('title');
        if (!tooltipText) return;
        
        // Store original title if it exists, then remove it to prevent native browser tooltip
        const originalTitle = element.getAttribute('title');
        if (originalTitle) {
            element.setAttribute('data-original-title', originalTitle);
            element.removeAttribute('title');
        }
        
        // Also remove title if data-tooltip exists (prevent double tooltips)
        if (element.getAttribute('data-tooltip') && element.hasAttribute('title')) {
            element.removeAttribute('title');
        }
        
        // Mark this element as having tooltip listeners
        tooltipElements.add(element);
        
        element.addEventListener('mouseenter', function(e) {
            // Clear any existing timeout
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
            }
            
            currentTooltipElement = this;
            
            // Small delay to prevent tooltip flicker
            tooltipTimeout = setTimeout(() => {
                if (currentTooltipElement !== this) return;
                
                // Get element position relative to viewport FIRST
                const rect = this.getBoundingClientRect();
                
                // Set tooltip text and make it visible (but off-screen) to measure
                tooltipEl.textContent = tooltipText;
                tooltipEl.style.position = 'fixed';
                tooltipEl.style.visibility = 'hidden';
                tooltipEl.style.display = 'block';
                tooltipEl.style.left = '-9999px';
                tooltipEl.style.top = '-9999px';
                
                // Force a reflow to get accurate dimensions
                void tooltipEl.offsetHeight;
                
                // Calculate tooltip dimensions
                const tooltipWidth = tooltipEl.offsetWidth;
                const tooltipHeight = tooltipEl.offsetHeight;
                
                // Position above the element, centered horizontally
                // getBoundingClientRect() gives viewport coordinates, which work with position: fixed
                let left = rect.left + (rect.width / 2);
                let top = rect.top - tooltipHeight - 10;
                
                // Adjust if tooltip goes off screen horizontally
                if (left - tooltipWidth / 2 < 10) {
                    left = tooltipWidth / 2 + 10;
                } else if (left + tooltipWidth / 2 > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipWidth / 2 - 10;
                }
                
                // Adjust if tooltip goes off screen vertically (show below instead)
                if (top < 10) {
                    top = rect.bottom + 10;
                }
                
                // Set final position and make visible
                tooltipEl.style.left = left + 'px';
                tooltipEl.style.top = top + 'px';
                tooltipEl.style.transform = 'translateX(-50%)';
                tooltipEl.style.visibility = 'visible';
                tooltipEl.style.zIndex = '10001';
            }, 300); // Small delay to prevent flicker
        });
        
        element.addEventListener('mouseleave', function() {
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = null;
            }
            currentTooltipElement = null;
            tooltipEl.style.display = 'none';
        });
    });
}

// Initialize tooltips when DOM is ready
function initTooltips() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupTooltips);
    } else {
        setupTooltips();
    }
}

initTooltips();

// Re-setup tooltips when new elements are added (for dynamic content)
const observer = new MutationObserver(function(mutations) {
    let shouldResetup = false;
    mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1 && (node.hasAttribute('data-tooltip') || node.hasAttribute('title') || node.querySelector('[data-tooltip], [title]'))) {
                shouldResetup = true;
            }
        });
    });
    if (shouldResetup) {
        setTimeout(setupTooltips, 100);
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Auth popup
function toggleAuthPopup() {
    const popup = document.getElementById("authPopup");
    if (customerId) {
        document.getElementById("customerId").value = customerId;
    }
    if (customerSecret) {
        document.getElementById("customerSecret").value = customerSecret;
    }
    if (appid) {
        document.getElementById("appid").value = appid;
    }
    if (appCertificate) {
        document.getElementById("appCertificate").value = appCertificate;
    }
    if (region) {
        document.getElementById("region").value = region;
    }
    popup.classList.toggle("hidden");
    
    // Save on close
    if (!popup.classList.contains("hidden")) {
        const saveBtn = popup.querySelector('button');
        saveBtn.onclick = () => {
            customerId = document.getElementById("customerId").value.trim();
            customerSecret = document.getElementById("customerSecret").value.trim();
            appid = document.getElementById("appid").value.trim();
            appCertificate = document.getElementById("appCertificate").value.trim();
            region = document.getElementById("region").value.trim();
            localStorage.setItem("customerId", customerId);
            localStorage.setItem("customerSecret", customerSecret);
            localStorage.setItem("appid", appid);
            localStorage.setItem("appCertificate", appCertificate);
            localStorage.setItem("region", region);
            console.log("Credentials saved:", { customerId: customerId.substring(0, 10) + "...", appid, region });
            toggleAuthPopup();
            showPopup("Credentials saved!");
        };
    }
}

// Validate API credentials - read directly from localStorage
function validateCredentials() {
    const cid = localStorage.getItem("customerId") || "";
    const csecret = localStorage.getItem("customerSecret") || "";
    const aid = localStorage.getItem("appid") || "";
    
    if (!cid || cid.trim() === "") {
        throw new Error("Customer ID is required. Please set API credentials first.");
    }
    if (!csecret || csecret.trim() === "") {
        throw new Error("Customer Secret is required. Please set API credentials first.");
    }
    if (!aid || aid.trim() === "") {
        throw new Error("App ID is required. Please set API credentials first.");
    }
}

// Get auth headers - Basic Auth with base64 encoded customerId:customerSecret
// Read directly from localStorage like cloud-record-console reads from DOM, ensuring we always have latest values
function getAuthHeaders() {
    // Always read fresh from localStorage to ensure we have the latest values
    const cid = localStorage.getItem("customerId") || "";
    const csecret = localStorage.getItem("customerSecret") || "";
    
    if (!cid || !csecret) {
        throw new Error("Customer ID and Customer Secret are required. Please set API credentials first.");
    }
    
    const authString = `${cid}:${csecret}`;
    const encoded = btoa(authString);
    const header = `Basic ${encoded}`;
    console.log("Auth header generated (first 20 chars):", header.substring(0, 20) + "...");
    return header;
}

// Proxy function to route API calls through Netlify Functions
async function proxyFetch(url, options = {}) {
    try {
        // Parse the URL to extract base domain and path
        const urlObj = new URL(url);
        const base = urlObj.hostname; // e.g., api.agora.io or api.sd-rtn.com
        const path = urlObj.pathname; // e.g., /na/v1/projects/...
        const search = urlObj.search; // query string
        
        // Build proxy URL: /.netlify/functions/proxy/{base}{path}{search}
        const proxyUrl = `/.netlify/functions/proxy/${base}${path}${search}`;
        
        // Prepare headers for proxy
        const proxyHeaders = {
            'Content-Type': 'application/json',
        };
        
        // Forward Authorization header if present
        if (options.headers && options.headers.Authorization) {
            proxyHeaders['Authorization'] = options.headers.Authorization;
        }
        
        // Prepare fetch options
        const proxyOptions = {
            method: options.method || 'GET',
            headers: proxyHeaders,
        };
        
        // Add body for non-GET requests
        if (options.body) {
            proxyOptions.body = options.body;
        }
        
        console.log("Proxying request:", proxyUrl);
        console.log("Method:", proxyOptions.method);
        console.log("Headers:", proxyOptions.headers);
        
        // Make the proxied request
        const response = await fetch(proxyUrl, proxyOptions);
        
        console.log("Proxy response status:", response.status);
        
        // Return response in the same format as direct fetch
        return response;
    } catch (error) {
        console.error("Proxy error:", error);
        throw error;
    }
}

// Media Push destination change handler
document.getElementById("mps-destination").addEventListener("change", (e) => {
    const dest = e.target.value;
    document.getElementById("mps-custom-config").classList.toggle("hidden", dest !== "custom");
    document.getElementById("mps-facebook-config").classList.toggle("hidden", dest !== "facebook");
    document.getElementById("mps-youtube-config").classList.toggle("hidden", dest !== "youtube");
});

// Media Push mode change handler (transcoded vs non-transcoded)
document.getElementById("mps-mode").addEventListener("change", (e) => {
    const mode = e.target.value;
    const transcodedOptions = document.getElementById("mps-transcoded-options");
    transcodedOptions.classList.toggle("hidden", mode !== "transcoded");
});

// Media Push layout type change handler
document.getElementById("mps-layout-type").addEventListener("change", (e) => {
    const layoutType = e.target.value;
    const verticalOptions = document.getElementById("mps-vertical-layout-options");
    verticalOptions.classList.toggle("hidden", layoutType !== "1");
});

// ============================================
// MEDIA PULL
// ============================================

async function startMediaPull() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    const url = document.getElementById("mp-url").value;
    const channel = document.getElementById("mp-channel").value;
    const uid = document.getElementById("mp-uid").value;
    const token = document.getElementById("mp-token").value;
    
    if (!url || !channel) {
        showPopup("URL and Channel Name are required");
        return;
    }
    
    const responseEl = document.getElementById("mp-response");
    responseEl.textContent = "Starting Media Pull...";
    
    const body = {
        player: {
            streamUrl: url,
            channelName: channel,
            name: `Player_${Date.now()}`,
            uid: parseInt(uid) || 666  // UID is required, default to 666
        }
    };
    
    if (token) body.player.token = token;
    
    try {
        const region = localStorage.getItem("region") || "na";
        const appid = localStorage.getItem("appid") || "";
        const url = `https://api.agora.io/${region}/v1/projects/${appid}/cloud-player/players`;
        const headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": getAuthHeaders()
        };
        
        // Debug logging
        console.log("Making request to:", url);
        console.log("Headers:", headers);
        console.log("Body:", body);
        
        const response = await proxyFetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body),
        });
        
        console.log("Response status:", response.status);
        console.log("Response headers:", [...response.headers.entries()]);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error response:", errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        if (result.player && result.player.id) {
            mediaPullPlayerId = result.player.id;
            document.getElementById("mp-player-id").value = result.player.id;
            // Reset sequence when creating a new player
            mediaPullUpdateSequence = 0;
            showPopup("Media Pull started successfully!");
        } else {
            showPopup(`Error: ${result.message || "Failed to start Media Pull"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
        
    }
}

async function listMediaPulls() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    const responseEl = document.getElementById("mp-response");
    responseEl.textContent = "Listing Media Pulls...";
    
    try {
        const appid = localStorage.getItem("appid") || "";
        const url = `https://api.agora.io/v1/projects/${appid}/cloud-player/players`;
        const headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": getAuthHeaders()
        };
        
        // Debug logging
        console.log("Making request to:", url);
        console.log("Headers:", headers);
        
        const response = await proxyFetch(url, {
            method: "GET",
            headers: headers,
        });
        
        console.log("Response status:", response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error response:", errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        // Display list
        const listEl = document.getElementById("mp-list");
        if (result.players && result.players.length > 0) {
            listEl.innerHTML = result.players.map(player => `
                <div class="modern-panel p-2 mb-2">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-semibold">Name: ${player.name || 'N/A'}</p>
                            <p class="text-sm text-gray-400">Channel: ${player.channelName}</p>
                            <p class="text-sm text-gray-400">Status: ${player.status || 'N/A'}</p>
                            <p class="text-sm text-gray-400">ID: ${player.id}</p>
                        </div>
                        <button onclick="deleteMediaPullById('${player.id}')" class="modern-btn-remove">Delete</button>
                    </div>
                </div>
            `).join("");
        } else {
            listEl.innerHTML = '<p class="text-sm text-gray-400">No active Media Pulls</p>';
        }
        
        showPopup("Media Pulls listed successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function updateMediaPull() {
    const idInput = document.getElementById("mp-player-id").value;
    if (!idInput) {
        showPopup("Please enter a Player ID in the ID Management section");
        return;
    }
    
    const url = document.getElementById("mp-url").value;
    const volume = document.getElementById("mp-volume").value;
    const seekPosition = document.getElementById("mp-seek").value;
    const isPause = document.getElementById("mp-pause").checked;
    
    if (!url) {
        showPopup("Stream URL is required");
        return;
    }
    
    const responseEl = document.getElementById("mp-response");
    responseEl.textContent = "Updating Media Pull...";
    
    // According to API docs, only these fields can be updated:
    // streamUrl, audioOptions, isPause, seekPosition
    // channelName, uid, and token are NOT updatable fields
    const body = {
        player: {
            streamUrl: url
        }
    };
    
    // Add audioOptions if volume is specified
    if (volume !== "" && volume !== null) {
        const volumeInt = parseInt(volume);
        if (!isNaN(volumeInt) && volumeInt >= 0 && volumeInt <= 200) {
            body.player.audioOptions = {
                volume: volumeInt
            };
        }
    }
    
    // Add isPause if checkbox is checked (or explicitly set to false)
    body.player.isPause = isPause;
    
    // Add seekPosition if specified
    if (seekPosition !== "" && seekPosition !== null) {
        const seekInt = parseInt(seekPosition);
        if (!isNaN(seekInt) && seekInt >= 0) {
            body.player.seekPosition = seekInt;
        }
    }
    
    try {
        const region = localStorage.getItem("region") || "na";
        const appid = localStorage.getItem("appid") || "";
        // Add required sequence query parameter
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/cloud-player/players/${idInput}?sequence=${mediaPullUpdateSequence}`, {
            method: "PATCH",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Response body is empty on success (status 2XX)
        const responseText = await response.text();
        if (responseText) {
            try {
                const result = JSON.parse(responseText);
        responseEl.textContent = JSON.stringify(result, null, 2);
            } catch {
                responseEl.textContent = responseText;
            }
        } else {
            responseEl.textContent = "Update successful (empty response body)";
        }
        
        // Increment sequence for next update
        mediaPullUpdateSequence++;
        showPopup("Media Pull updated successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function deleteMediaPull() {
    const idInput = document.getElementById("mp-player-id").value;
    if (idInput) {
        await deleteMediaPullById(idInput);
    } else {
        const id = prompt("Enter Media Pull ID to delete:");
        if (!id) return;
        await deleteMediaPullById(id);
    }
}

async function deleteMediaPullById(id) {
    const responseEl = document.getElementById("mp-response");
    responseEl.textContent = "Deleting Media Pull...";
    
    try {
        const region = localStorage.getItem("region") || "na";
        const appid = localStorage.getItem("appid") || "";
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/cloud-player/players/${id}`, {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        // Handle empty response body (200 OK with empty body or 204 No Content)
        const responseText = await response.text();
        let result = {};
        
        if (responseText && responseText.trim() !== "") {
            try {
                result = JSON.parse(responseText);
                responseEl.textContent = JSON.stringify(result, null, 2);
            } catch (e) {
                responseEl.textContent = responseText;
            }
        } else {
            // Empty response body - success
            responseEl.textContent = `Media Pull deleted successfully (${response.status} ${response.status === 200 ? 'OK' : 'No Content'})`;
        }
        
        // Reset sequence when player is deleted
        if (id === mediaPullPlayerId) {
            mediaPullPlayerId = null;
            mediaPullUpdateSequence = 0;
            document.getElementById("mp-player-id").value = "";
        }
        
        showPopup("Media Pull deleted successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

// ============================================
// MEDIA PUSH
// ============================================

async function startMediaPush() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    refreshCredentials();
    const mode = document.getElementById("mps-mode").value;
    const channel = document.getElementById("mps-channel").value;
    const name = document.getElementById("mps-name").value;
    const uid = document.getElementById("mps-uid").value || "444";
    const token = document.getElementById("mps-token").value;
    const destination = document.getElementById("mps-destination").value;
    const regionHintIp = document.getElementById("mps-region-hint-ip").value;
    const idleTimeout = document.getElementById("mps-idle-timeout").value;
    const jitterBufferSizeMs = document.getElementById("mps-jitter-buffer").value;
    
    if (!channel) {
        showPopup("Channel Name is required");
        return;
    }
    
    const responseEl = document.getElementById("mps-response");
    responseEl.textContent = "Starting Media Push...";
    
    // Build RTMP URL based on destination
    let rtmpUrl = "";
    if (destination === "facebook") {
        const fbUrl = document.getElementById("mps-fb-url").value;
        const fbKey = document.getElementById("mps-fb-key").value;
        if (!fbUrl || !fbKey) {
            showPopup("Facebook URL and Stream Key are required");
            return;
        }
        rtmpUrl = fbUrl + "/" + fbKey;
    } else if (destination === "youtube") {
        const ytUrl = document.getElementById("mps-yt-url").value;
        const ytKey = document.getElementById("mps-yt-key").value;
        if (!ytUrl || !ytKey) {
            showPopup("YouTube URL and Stream Key are required");
            return;
        }
        rtmpUrl = ytUrl + "/" + ytKey;
    } else if (destination === "custom") {
        const customUrl = document.getElementById("mps-custom-url").value;
        const customKey = document.getElementById("mps-custom-key").value;
        if (!customUrl || !customKey) {
            showPopup("Custom RTMP URL and Stream Key are required");
            return;
        }
        rtmpUrl = customUrl + "/" + customKey;
    }
    
    const body = {
        converter: {
            rtmpUrl: rtmpUrl
        }
    };
    
    // Add optional name
    if (name) {
        body.converter.name = name;
    } else {
        body.converter.name = `Converter_${Date.now()}`;
    }
    
    // Add optional fields
    if (idleTimeout) {
        body.converter.idleTimeout = parseInt(idleTimeout);
    }
    if (jitterBufferSizeMs) {
        const jitter = parseInt(jitterBufferSizeMs);
        if (jitter >= 0 && jitter <= 1000) {
            body.converter.jitterBufferSizeMs = jitter;
        }
    }
    
    if (mode === "raw") {
        // Non-transcoded mode (rawOptions)
        body.converter.rawOptions = {
                rtcChannel: channel,
                rtcStreamUid: uid ? parseInt(uid) : 0
        };
        if (token) body.converter.rawOptions.rtcToken = token;
    } else {
        // Transcoded mode (transcodeOptions) - simplified version for now
        // Full implementation would include all layout options
        const canvasWidth = parseInt(document.getElementById("mps-canvas-width").value) || 640;
        const canvasHeight = parseInt(document.getElementById("mps-canvas-height").value) || 360;
        const videoBitrate = parseInt(document.getElementById("mps-video-bitrate").value) || 800;
        const videoFramerate = parseInt(document.getElementById("mps-video-framerate").value) || 15;
        const audioCodecProfile = document.getElementById("mps-audio-codec-profile").value;
        const audioSampleRate = parseInt(document.getElementById("mps-audio-sample-rate").value) || 48000;
        const audioBitrate = parseInt(document.getElementById("mps-audio-bitrate").value) || 48;
        const audioChannels = parseInt(document.getElementById("mps-audio-channels").value) || 1;
        
        body.converter.transcodeOptions = {
            rtcChannel: channel,
            audioOptions: {
                codecProfile: audioCodecProfile,
                sampleRate: audioSampleRate,
                bitrate: audioBitrate,
                audioChannels: audioChannels
            },
            videoOptions: {
                canvas: { width: canvasWidth, height: canvasHeight },
                bitrate: videoBitrate,
                frameRate: videoFramerate,
                codec: document.getElementById("mps-video-codec").value,
                codecProfile: document.getElementById("mps-video-codec-profile").value
            }
        };
        
        if (token) body.converter.transcodeOptions.rtcToken = token;
        
        const audioStreamUids = document.getElementById("mps-audio-stream-uids").value;
        if (audioStreamUids) {
            body.converter.transcodeOptions.audioOptions.rtcStreamUids = audioStreamUids.split(",").map(uid => parseInt(uid.trim())).filter(uid => !isNaN(uid));
        }
        
        const layoutType = parseInt(document.getElementById("mps-layout-type").value) || 0;
        if (layoutType === 1) {
            body.converter.transcodeOptions.videoOptions.layoutType = 1;
            const maxResolutionUid = document.getElementById("mps-vertical-max-uid").value;
            if (maxResolutionUid) {
                body.converter.transcodeOptions.videoOptions.vertical = {
                    maxResolutionUid: parseInt(maxResolutionUid),
                    fillMode: document.getElementById("mps-vertical-fill-mode").value,
                    refreshIntervalSec: parseInt(document.getElementById("mps-vertical-refresh").value) || 4
                };
            }
        } else if (uid) {
            body.converter.transcodeOptions.videoOptions.layout = [{
                rtcStreamUid: parseInt(uid),
                region: { xPos: 0, yPos: 0, zIndex: 1, width: canvasWidth, height: canvasHeight }
            }];
        }
        
        const placeholderImage = document.getElementById("mps-placeholder-image").value;
        if (placeholderImage) {
            body.converter.transcodeOptions.videoOptions.defaultPlaceholderImageUrl = placeholderImage;
        }
        
        const videoGop = document.getElementById("mps-video-gop").value;
        if (videoGop) {
            body.converter.transcodeOptions.videoOptions.gop = parseInt(videoGop);
        }
        
        const canvasColor = document.getElementById("mps-canvas-color").value;
        if (canvasColor) {
            body.converter.transcodeOptions.videoOptions.canvas.color = parseInt(canvasColor.replace("#", ""), 16) || 0;
        }
    }
    
    try {
        refreshCredentials();
        let url = `https://api.agora.io/${region}/v1/projects/${appid}/rtmp-converters`;
        if (regionHintIp) {
            url += `?regionHintIp=${encodeURIComponent(regionHintIp)}`;
        }
        
        const response = await proxyFetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        const pushResult = await response.json();
        responseEl.textContent = JSON.stringify(pushResult, null, 2);
        
        if (pushResult.converter && pushResult.converter.id) {
            mediaPushConverterId = pushResult.converter.id;
            mediaPushUpdateSequence = 0; // Reset sequence
            document.getElementById("mps-converter-id").value = pushResult.converter.id;
            document.getElementById("mps-converter-info").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Converter ID: ${pushResult.converter.id}</p>
                    <p class="text-sm text-gray-400">Status: ${pushResult.converter.state || "connecting"}</p>
                    <p class="text-sm text-gray-400">Name: ${pushResult.converter.name || name || "N/A"}</p>
                </div>
            `;
            showPopup("Media Push started successfully!");
        } else {
            showPopup(`Error: ${pushResult.message || "Failed to start Media Push"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function listMediaPush() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    refreshCredentials();
    const responseEl = document.getElementById("mps-response");
    const queryChannel = document.getElementById("mps-query-channel").value;
    
    // Build URL - either all converters or channel-specific
    let url = `https://api.agora.io/v1/projects/${appid}/rtmp-converters`;
    if (queryChannel) {
        url = `https://api.agora.io/v1/projects/${appid}/channels/${encodeURIComponent(queryChannel)}/rtmp-converters`;
    }
    
    responseEl.textContent = "Listing Media Push converters...";
    
    try {
        const response = await proxyFetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        // Display list - handle new response format with data.members
        const infoEl = document.getElementById("mps-converter-info");
        const members = result.data && result.data.members ? result.data.members : (result.converters || []);
        
        if (members && members.length > 0) {
            infoEl.innerHTML = `
                <div class="space-y-2">
                    <p class="text-sm font-semibold">Found ${members.length} converter(s)${result.data && result.data.total_count ? ` (Total: ${result.data.total_count})` : ""}</p>
                    ${members.map(converter => `
                        <div class="modern-panel p-2">
                            <p class="font-semibold">Converter ID: ${converter.id || converter.converterId}</p>
                            <p class="text-sm text-gray-400">Status: ${converter.state || "Unknown"}</p>
                            <p class="text-sm text-gray-400">Channel: ${converter.rtcChannel || converter.channelName || "N/A"}</p>
                            <p class="text-sm text-gray-400">Name: ${converter.converterName || converter.name || "N/A"}</p>
                            <p class="text-sm text-gray-400">RTMP URL: ${converter.rtmpUrl || "N/A"}</p>
                            <button onclick="document.getElementById('mps-converter-id').value='${converter.id || converter.converterId}'; showPopup('Converter ID set!')" class="modern-btn modern-btn-secondary mt-2 text-xs">Use This ID</button>
                        </div>
                    `).join("")}
                    ${result.data && result.data.cursor && result.data.cursor !== "0" ? `<p class="text-xs text-gray-500 mt-2">Note: More results available (cursor: ${result.data.cursor}). Use cursor parameter for pagination.</p>` : ""}
                </div>
            `;
            showPopup(`Found ${members.length} converter(s)`);
        } else {
            infoEl.innerHTML = '<p class="text-sm text-gray-400">No converters found</p>';
            showPopup("No converters found");
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
        
    }
}

// Track update sequence number
let mediaPushUpdateSequence = 0;

async function getMediaPushStatus() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    refreshCredentials();
    const idInput = document.getElementById("mps-converter-id").value;
    if (!idInput) {
        showPopup("Please enter a Converter ID");
        return;
    }
    
    const responseEl = document.getElementById("mps-response");
    responseEl.textContent = "Getting Converter status...";
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtmp-converters/${idInput}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        // Display converter info
        const infoEl = document.getElementById("mps-converter-info");
        infoEl.innerHTML = `
            <div class="modern-panel p-2">
                <p class="font-semibold">Converter ID: ${result.id || result.converterId || idInput}</p>
                <p class="text-sm text-gray-400">Status: ${result.state || "Unknown"}</p>
                <p class="text-sm text-gray-400">Name: ${result.name || "N/A"}</p>
                <p class="text-sm text-gray-400">Channel: ${result.transcodeOptions?.rtcChannel || result.rawOptions?.rtcChannel || "N/A"}</p>
                <p class="text-sm text-gray-400">RTMP URL: ${result.rtmpUrl || "N/A"}</p>
                ${result.createTs ? `<p class="text-sm text-gray-400">Created: ${new Date(result.createTs * 1000).toLocaleString()}</p>` : ""}
                ${result.updateTs ? `<p class="text-sm text-gray-400">Updated: ${new Date(result.updateTs * 1000).toLocaleString()}</p>` : ""}
            </div>
        `;
        
        showPopup("Converter status retrieved successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function updateMediaPush() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    refreshCredentials();
    const idInput = document.getElementById("mps-converter-id").value;
    if (idInput) {
        mediaPushConverterId = idInput;
    }
    if (!mediaPushConverterId) {
        showPopup("No Converter ID available. Start a Media Push first or enter an ID.");
        return;
    }
    
    const destination = document.getElementById("mps-destination").value;
    let rtmpUrl = "";
    
    if (destination === "facebook") {
        const fbUrl = document.getElementById("mps-fb-url").value;
        const fbKey = document.getElementById("mps-fb-key").value;
        rtmpUrl = fbUrl + "/" + fbKey;
    } else if (destination === "youtube") {
        const ytUrl = document.getElementById("mps-yt-url").value;
        const ytKey = document.getElementById("mps-yt-key").value;
        rtmpUrl = ytUrl + "/" + ytKey;
    } else if (destination === "custom") {
        const customUrl = document.getElementById("mps-custom-url").value;
        const customKey = document.getElementById("mps-custom-key").value;
        rtmpUrl = customUrl + "/" + customKey;
    }
    
    const responseEl = document.getElementById("mps-response");
    responseEl.textContent = "Updating Media Push...";
    
    // Build update body - only include updateable fields
    const body = {
        converter: {}
    };
    
    const fields = [];
    
    // RTMP URL is always updateable
    if (rtmpUrl) {
        body.converter.rtmpUrl = rtmpUrl;
        fields.push("rtmpUrl");
    }
    
    // Video options are updateable (but not codec/codecProfile)
    const mode = document.getElementById("mps-mode").value;
    if (mode === "transcoded") {
        body.converter.transcodeOptions = {
            videoOptions: {}
        };
        
        const canvasWidth = document.getElementById("mps-canvas-width").value;
        const canvasHeight = document.getElementById("mps-canvas-height").value;
        const canvasColor = document.getElementById("mps-canvas-color").value;
        
        if (canvasWidth || canvasHeight || canvasColor) {
            body.converter.transcodeOptions.videoOptions.canvas = {};
            if (canvasWidth) body.converter.transcodeOptions.videoOptions.canvas.width = parseInt(canvasWidth);
            if (canvasHeight) body.converter.transcodeOptions.videoOptions.canvas.height = parseInt(canvasHeight);
            if (canvasColor) body.converter.transcodeOptions.videoOptions.canvas.color = parseInt(canvasColor.replace("#", ""), 16) || 0;
            fields.push("transcodeOptions.videoOptions.canvas");
        }
        
        const videoBitrate = document.getElementById("mps-video-bitrate").value;
        const videoFramerate = document.getElementById("mps-video-framerate").value;
        const videoGop = document.getElementById("mps-video-gop").value;
        const placeholderImage = document.getElementById("mps-placeholder-image").value;
        
        if (videoBitrate) {
            body.converter.transcodeOptions.videoOptions.bitrate = parseInt(videoBitrate);
            fields.push("transcodeOptions.videoOptions.bitrate");
        }
        if (videoFramerate) {
            body.converter.transcodeOptions.videoOptions.frameRate = parseInt(videoFramerate);
            fields.push("transcodeOptions.videoOptions.frameRate");
        }
        if (videoGop) {
            body.converter.transcodeOptions.videoOptions.gop = parseInt(videoGop);
            fields.push("transcodeOptions.videoOptions.gop");
        }
        if (placeholderImage) {
            body.converter.transcodeOptions.videoOptions.defaultPlaceholderImageUrl = placeholderImage;
            fields.push("transcodeOptions.videoOptions.defaultPlaceholderImageUrl");
        }
        
        // Vertical layout options (only for vertical layout)
        const layoutType = parseInt(document.getElementById("mps-layout-type").value) || 0;
        if (layoutType === 1) {
            const maxResolutionUid = document.getElementById("mps-vertical-max-uid").value;
            if (maxResolutionUid) {
                body.converter.transcodeOptions.videoOptions.vertical = {
                    maxResolutionUid: parseInt(maxResolutionUid),
                    fillMode: document.getElementById("mps-vertical-fill-mode").value,
                    refreshIntervalSec: parseInt(document.getElementById("mps-vertical-refresh").value) || 4
                };
                fields.push("transcodeOptions.videoOptions.vertical");
            }
        }
    }
    
    // Add fields parameter
    if (fields.length > 0) {
        body.fields = fields.join(",");
    }
    
    try {
        refreshCredentials();
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtmp-converters/${mediaPushConverterId}?sequence=${mediaPushUpdateSequence}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        mediaPushUpdateSequence++;
        showPopup("Media Push updated successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function deleteMediaPush() {
    const idInput = document.getElementById("mps-converter-id").value;
    if (idInput) {
        mediaPushConverterId = idInput;
    }
    if (!mediaPushConverterId) {
        mediaPushConverterId = prompt("Enter Converter ID:");
        if (!mediaPushConverterId) return;
    }
    
    const responseEl = document.getElementById("mps-response");
    responseEl.textContent = "Deleting Media Push...";
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtmp-converters/${mediaPushConverterId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        
        // Handle empty response body (200 OK with empty body or 204 No Content)
        const responseText = await response.text();
        let result = {};
        
        if (responseText && responseText.trim() !== "") {
            try {
                result = JSON.parse(responseText);
                responseEl.textContent = JSON.stringify(result, null, 2);
            } catch (e) {
                responseEl.textContent = responseText;
            }
        } else {
            // Empty response body - success
            responseEl.textContent = `Media Push deleted successfully (${response.status} ${response.status === 200 ? 'OK' : 'No Content'})`;
        }
        
        mediaPushConverterId = null;
        mediaPushUpdateSequence = 0; // Reset sequence
        document.getElementById("mps-converter-info").innerHTML = '<p class="text-sm text-gray-400">Converter ID will appear here after creation</p>';
        showPopup("Media Push deleted successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

// ============================================
// MEDIA GATEWAY
// ============================================

// Store pending OBS WebSocket requests
const obsPendingRequests = new Map();

// Helper function to compute OBS WebSocket v5 authentication
async function computeOBSAuth(password, salt, challenge) {
    // Step 1: secret = Base64( SHA256(password + salt) )
    const passwordSalt = password + salt;
    const passwordSaltBytes = new TextEncoder().encode(passwordSalt);
    const passwordSaltHash = await crypto.subtle.digest('SHA-256', passwordSaltBytes);
    const secret = btoa(String.fromCharCode(...new Uint8Array(passwordSaltHash)));
    
    // Step 2: auth = Base64( SHA256(secret + challenge) )
    const secretChallenge = secret + challenge;
    const secretChallengeBytes = new TextEncoder().encode(secretChallenge);
    const secretChallengeHash = await crypto.subtle.digest('SHA-256', secretChallengeBytes);
    const auth = btoa(String.fromCharCode(...new Uint8Array(secretChallengeHash)));
    
    return auth;
}

async function connectOBS() {
    // Close any existing connection first
    if (obsWebSocket && obsWebSocket.readyState === WebSocket.OPEN) {
        console.log("Closing existing OBS connection...");
        obsWebSocket.close(1000, "Reconnecting");
        obsWebSocket = null;
        // Wait a bit for the connection to close
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Get password from panel first, then fall back to Media Gateway section, then localStorage
    const panelPasswordEl = document.getElementById("obs-panel-password");
    const mgPasswordEl = document.getElementById("mg-obs-password");
    const password = panelPasswordEl?.value || mgPasswordEl?.value || localStorage.getItem("obsWebSocketPassword") || "";
    
    // Get host and port from advanced settings or use defaults
    const host = document.getElementById("mg-obs-host")?.value || "127.0.0.1";
    const port = document.getElementById("mg-obs-port")?.value || 4455;
    
    if (!password) {
        showPopup("OBS WebSocket Password is required");
        return;
    }
    
    // Save password to localStorage for future use
    localStorage.setItem("obsWebSocketPassword", password);
    
    // Sync password to panel if it exists
    const panelPassword = document.getElementById("obs-panel-password");
    if (panelPassword) {
        panelPassword.value = password;
    }
    
    const statusEl = document.getElementById("mg-obs-status");
    const connectionStatusEl = document.getElementById("mg-obs-connection-status");
    statusEl.textContent = "Connecting to OBS...";
    if (connectionStatusEl) connectionStatusEl.textContent = "";
    
    // Update panel status
    const panelStatus = document.getElementById("obs-panel-status");
    if (panelStatus) {
        panelStatus.innerHTML = '<span class="text-blue-400">Connecting...</span>';
    }
    
    try {
        // Using OBS WebSocket 5.x protocol
        const ws = new WebSocket(`ws://${host}:${port}`);
        
        ws.onopen = () => {
            statusEl.textContent = "WebSocket opened, waiting for Hello...";
        };
        
        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.op === 0) {
                    // Hello message - contains authentication challenge
                    statusEl.textContent = "Received Hello, authenticating...";
                    
                    const helloData = data.d;
                    const rpcVersion = helloData.rpcVersion || 1;
                    
                    // Check if authentication is required
                    if (helloData.authentication) {
                        const challenge = helloData.authentication.challenge;
                        const salt = helloData.authentication.salt;
                        
                        // Compute authentication hash
                        const auth = await computeOBSAuth(password, salt, challenge);
                        
                        // Send Identify message with authentication
                        ws.send(JSON.stringify({
                            op: 1,
                            d: {
                                rpcVersion: rpcVersion,
                                authentication: auth
                            }
                        }));
                    } else {
                        // No authentication required
                        ws.send(JSON.stringify({
                            op: 1,
                            d: {
                                rpcVersion: rpcVersion
                            }
                        }));
                    }
                } else if (data.op === 2) {
                    // Identified - authentication successful
                    // Set the WebSocket reference immediately so disconnect works
                    obsWebSocket = ws;
                    // Only update the main status element to avoid duplicate messages
                    statusEl.innerHTML = '<span class="text-green-400">✓ Identified to OBS</span>';
                    // Clear connection status or leave it empty until ConnectionOpened
                    if (connectionStatusEl) {
                        connectionStatusEl.textContent = "";
                    }
                    
                    // Update panel status
                    const panelStatus = document.getElementById("obs-panel-status");
                    if (panelStatus) {
                        panelStatus.innerHTML = '<span class="text-green-400">✓ Identified</span>';
                    }
                    
                    // Show sections immediately after identification (don't wait for ConnectionOpened)
                    console.log("OBS Identified - showing profile and streaming sections");
                    const profileSection = document.getElementById("mg-obs-profile-section");
                    if (profileSection) {
                        console.log("Found profile section, removing hidden class");
                        profileSection.classList.remove("hidden");
                        // Load profiles
                        try {
                            await listOBSProfiles();
                        } catch (e) {
                            console.error("Error loading profiles:", e);
                        }
                    } else {
                        console.error("Profile section not found!");
                    }
                    
                    const streamingSection = document.getElementById("mg-obs-streaming-section");
                    if (streamingSection) {
                        console.log("Found streaming section, removing hidden class");
                        streamingSection.classList.remove("hidden");
                    } else {
                        console.error("Streaming section not found!");
                    }
                    
                        // Sync panel UI
                        syncOBSPanelUI();
                        
                        // Start preview updates
                        startOBSPreview();
                        // If PIP is visible, start PIP preview too
                        if (isPIPVisible) {
                            startOBSPreviewPIP();
                        }
                } else if (data.op === 5) {
                    // Event message
                    if (data.d && data.d.eventType === "ConnectionOpened") {
                        // Ensure WebSocket reference is set (should already be set from op: 2)
                        obsWebSocket = ws;
                        statusEl.innerHTML = '<span class="text-green-400">✓ Connected to OBS</span>';
                        if (connectionStatusEl) {
                            connectionStatusEl.innerHTML = '<span class="text-green-400">✓ Connected to OBS</span>';
                        }
                        showPopup("Connected to OBS successfully!");
                        
                        // Ensure sections are visible (they should already be from op: 2, but double-check)
                        const profileSection = document.getElementById("mg-obs-profile-section");
                        if (profileSection && profileSection.classList.contains("hidden")) {
                            profileSection.classList.remove("hidden");
                        }
                        
                        const streamingSection = document.getElementById("mg-obs-streaming-section");
                        if (streamingSection && streamingSection.classList.contains("hidden")) {
                            streamingSection.classList.remove("hidden");
                        }
                    } else if (data.d && data.d.eventType === "StreamStateChanged") {
                        // Handle stream state changes
                        const outputState = data.d.eventData?.outputState;
                        const statusEl = document.getElementById("mg-obs-streaming-status");
                        
                        if (outputState === "OBS_WEBSOCKET_OUTPUT_STARTED") {
                            const statusHTML = '<span class="text-green-400 text-sm">✓ Streaming Started</span>';
                            if (statusEl) {
                                statusEl.innerHTML = '<span class="text-green-400">✓ Streaming Started</span>';
                            }
                            updateOBSPanelStreamingStatus(statusHTML);
                            showPopup("OBS streaming started!");
                        } else if (outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED") {
                            const statusHTML = '<span class="text-yellow-400 text-sm">Streaming Stopped</span>';
                            if (statusEl) {
                                statusEl.innerHTML = '<span class="text-yellow-400">Streaming Stopped</span>';
                            }
                            updateOBSPanelStreamingStatus(statusHTML);
                            showPopup("OBS streaming stopped");
                        } else if (outputState === "OBS_WEBSOCKET_OUTPUT_STARTING") {
                            const statusHTML = '<span class="text-blue-400 text-sm">Starting stream...</span>';
                            if (statusEl) {
                                statusEl.innerHTML = '<span class="text-blue-400">Starting stream...</span>';
                            }
                            updateOBSPanelStreamingStatus(statusHTML);
                        } else if (outputState === "OBS_WEBSOCKET_OUTPUT_STOPPING") {
                            const statusHTML = '<span class="text-yellow-400 text-sm">Stopping stream...</span>';
                            if (statusEl) {
                                statusEl.innerHTML = '<span class="text-yellow-400">Stopping stream...</span>';
                            }
                            updateOBSPanelStreamingStatus(statusHTML);
                        }
                    } else if (data.d && data.d.eventType === "ConnectionClosed") {
                        statusEl.innerHTML = '<span class="text-red-400">✗ Connection closed by OBS</span>';
                        if (connectionStatusEl) {
                            connectionStatusEl.innerHTML = '<span class="text-red-400">✗ Connection closed by OBS</span>';
                        }
                        obsWebSocket = null;
                        stopOBSPreview();
                        const profileSection = document.getElementById("mg-obs-profile-section");
                        if (profileSection) profileSection.classList.add("hidden");
                        const streamingSection = document.getElementById("mg-obs-streaming-section");
                        if (streamingSection) streamingSection.classList.add("hidden");
                    }
                } else if (data.op === 7) {
                    // RequestResponse - handle responses to our requests
                    if (data.d && data.d.requestId) {
                        const requestId = data.d.requestId;
                        const pendingRequest = obsPendingRequests.get(requestId);
                        
                        if (pendingRequest) {
                            clearTimeout(pendingRequest.timeout);
                            obsPendingRequests.delete(requestId);
                            
                            if (data.d.requestStatus && data.d.requestStatus.code === 100) {
                                console.log(`OBS request succeeded: ${pendingRequest.requestType}`, data.d.responseData);
                                pendingRequest.resolve(data.d.responseData);
                            } else {
                                const errorMsg = data.d.requestStatus?.comment || `OBS request failed: ${pendingRequest.requestType}`;
                                console.error(`OBS request failed: ${pendingRequest.requestType}`, data.d.requestStatus);
                                pendingRequest.reject(new Error(errorMsg));
                            }
                        } else {
                            console.log("OBS Request Response (no pending request):", data.d);
                        }
                    }
                }
            } catch (error) {
                console.error("Error processing OBS message:", error);
                statusEl.innerHTML = '<span class="text-red-400">✗ Error processing message</span>';
            }
        };
        
        ws.onerror = (error) => {
            statusEl.innerHTML = '<span class="text-red-400">✗ Connection failed</span>';
            if (connectionStatusEl) connectionStatusEl.innerHTML = '<span class="text-red-400">✗ Connection failed</span>';
            showPopup("Failed to connect to OBS. Make sure OBS is running and WebSocket server is enabled.");
            console.error("OBS WebSocket error:", error);
        };
        
        ws.onclose = (event) => {
            // Reject all pending requests
            obsPendingRequests.forEach((request, requestId) => {
                clearTimeout(request.timeout);
                request.reject(new Error("OBS WebSocket closed"));
            });
            obsPendingRequests.clear();
            
            obsWebSocket = null;
            stopOBSPreview();
            const profileSection = document.getElementById("mg-obs-profile-section");
            if (profileSection) profileSection.classList.add("hidden");
            const streamingSection = document.getElementById("mg-obs-streaming-section");
            if (streamingSection) streamingSection.classList.add("hidden");
            
            if (event.code !== 1000) {
                statusEl.innerHTML = `<span class="text-red-400">✗ Disconnected (code: ${event.code})</span>`;
                if (connectionStatusEl) connectionStatusEl.innerHTML = `<span class="text-red-400">✗ Disconnected (code: ${event.code})</span>`;
            } else {
                statusEl.innerHTML = '<span class="text-gray-400">Disconnected</span>';
                if (connectionStatusEl) connectionStatusEl.innerHTML = '<span class="text-gray-400">Disconnected</span>';
            }
        };
    } catch (error) {
        statusEl.innerHTML = '<span class="text-red-400">✗ Error: ' + error.message + '</span>';
        if (connectionStatusEl) connectionStatusEl.innerHTML = '<span class="text-red-400">✗ Error: ' + error.message + '</span>';
        showPopup(`Error: ${error.message}`);
        console.error("OBS connection error:", error);
    }
}

function disconnectOBS() {
    let wasConnected = false;
    
    // Check if we have a WebSocket reference and it's in a valid state
    if (obsWebSocket && (obsWebSocket.readyState === WebSocket.OPEN || obsWebSocket.readyState === WebSocket.CONNECTING)) {
        wasConnected = true;
        try {
            // Close with normal closure code
            obsWebSocket.close(1000, "User disconnected");
        } catch (error) {
            console.error("Error closing OBS connection:", error);
        }
    }
    
    // Always clear the UI state, regardless of connection state
    obsWebSocket = null;
    stopOBSPreview();
    document.getElementById("mg-obs-status").innerHTML = '<span class="text-gray-400">Disconnected</span>';
    const connectionStatusEl = document.getElementById("mg-obs-connection-status");
    if (connectionStatusEl) connectionStatusEl.innerHTML = '<span class="text-gray-400">Disconnected</span>';
    
    // Update panel status
    const panelStatus = document.getElementById("obs-panel-status");
    if (panelStatus) {
        panelStatus.innerHTML = '<span class="text-gray-400">Disconnected</span>';
    }
    
    // Clear preview
    const previewEl = document.getElementById("obs-preview");
    if (previewEl) {
        previewEl.innerHTML = '<div class="text-gray-400 text-sm">OBS Preview</div>';
    }
    const previewStatusEl = document.getElementById("obs-preview-status");
    if (previewStatusEl) {
        previewStatusEl.textContent = "";
    }
    
    const profileSection = document.getElementById("mg-obs-profile-section");
    if (profileSection) profileSection.classList.add("hidden");
    
    const streamingSection = document.getElementById("mg-obs-streaming-section");
    if (streamingSection) streamingSection.classList.add("hidden");
    
    // Only show one disconnect message
    if (wasConnected) {
        showPopup("Disconnected from OBS");
    }
}

function toggleOBSAdvancedSettings() {
    const settingsEl = document.getElementById("mg-obs-advanced-settings");
    if (settingsEl) settingsEl.classList.toggle("hidden");
}

// Toggle OBS Control Panel visibility
function toggleOBSControlPanel() {
    const panel = document.getElementById("obs-control-panel");
    const toggleBtn = document.getElementById("obs-panel-toggle-btn");
    
    if (panel) {
        const isHidden = panel.classList.contains("hidden");
        panel.classList.toggle("hidden");
        
        // Toggle button is now icon-only, no text change needed
        
        // If showing and OBS is connected, sync the UI
        if (isHidden && obsWebSocket && obsWebSocket.readyState === WebSocket.OPEN) {
            syncOBSPanelUI();
        }
    }
}

// Connect OBS from the control panel
async function connectOBSFromPanel() {
    const panelPassword = document.getElementById("obs-panel-password");
    const mgPassword = document.getElementById("mg-obs-password");
    
    // Sync password between panel and Media Gateway section (if it exists)
    if (panelPassword && mgPassword) {
        mgPassword.value = panelPassword.value;
    }
    
    // Ensure password is set
    if (!panelPassword?.value) {
        showPopup("Please enter OBS WebSocket password");
        panelPassword?.focus();
        return;
    }
    
    // Use the existing connectOBS function
    await connectOBS();
    
    // Update panel status
    const panelStatus = document.getElementById("obs-panel-status");
    if (panelStatus) {
        panelStatus.innerHTML = '<span class="text-blue-400">Connecting...</span>';
    }
}

// Sync OBS panel UI when connected
function syncOBSPanelUI() {
    // Sync password
    const panelPassword = document.getElementById("obs-panel-password");
    const mgPassword = document.getElementById("mg-obs-password");
    if (panelPassword && mgPassword) {
        panelPassword.value = mgPassword.value;
    }
    
    // Sync profile dropdown
    const panelProfile = document.getElementById("obs-panel-profile");
    const mgProfile = document.getElementById("mg-obs-profile");
    if (panelProfile && mgProfile) {
        panelProfile.innerHTML = mgProfile.innerHTML;
        panelProfile.value = mgProfile.value;
    }
    
    // Update status
    const panelStatus = document.getElementById("obs-panel-status");
    const mgStatus = document.getElementById("mg-obs-status");
    if (panelStatus && mgStatus) {
        panelStatus.innerHTML = mgStatus.innerHTML;
    }
}

// Update OBS panel streaming status
function updateOBSPanelStreamingStatus(statusHTML) {
    const panelStreamingStatus = document.getElementById("obs-panel-streaming-status");
    if (panelStreamingStatus) {
        panelStreamingStatus.innerHTML = statusHTML;
    }
}

// OBS Preview polling
let obsPreviewInterval = null;
let obsPIPInterval = null;
let isPIPVisible = false;

// Toggle OBS Preview PIP window
function toggleOBSPreviewPIP() {
    const pip = document.getElementById("obs-preview-pip");
    if (!pip) return;
    
    isPIPVisible = !isPIPVisible;
    if (isPIPVisible) {
        pip.style.display = 'block';
        // Position in top-right corner if not already positioned
        if (!pip.dataset.hasPosition) {
            pip.style.top = '80px';
            pip.style.right = '20px';
            pip.style.left = 'auto';
        }
        startOBSPreviewPIP();
    } else {
        pip.style.display = 'none';
        stopOBSPreviewPIP();
    }
}

// Make PIP draggable
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Initialize dragging when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOBSPIPDragging);
} else {
    initOBSPIPDragging();
}

function initOBSPIPDragging() {
    const pip = document.getElementById("obs-preview-pip");
    if (!pip) return;
    
    const header = pip.querySelector('.pip-header');
    if (!header) return;
    
    header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('pip-close')) return;
        isDragging = true;
        pip.classList.add('dragging');
        const rect = pip.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        e.preventDefault();
        e.stopPropagation();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;
        
        // Keep within viewport bounds
        const maxX = window.innerWidth - pip.offsetWidth;
        const maxY = window.innerHeight - pip.offsetHeight;
        
        // Remove right property and set left/top explicitly
        pip.style.removeProperty('right');
        pip.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        pip.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        pip.dataset.hasPosition = 'true';
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            pip.classList.remove('dragging');
        }
    });
}

// Start OBS preview updates
async function startOBSPreview() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        return;
    }
    
    // Stop any existing preview
    stopOBSPreview();
    
    try {
        const sceneList = await sendOBSRequest("GetSceneList");
        if (sceneList && sceneList.currentProgramSceneName) {
            updateOBSPreview();
            // Update scene name every 2 seconds
            obsPreviewInterval = setInterval(updateOBSPreview, 2000);
        }
    } catch (error) {
        console.error("Error starting OBS preview:", error);
    }
}

// Start OBS Preview PIP with video frames
async function startOBSPreviewPIP() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        return;
    }
    
    stopOBSPreviewPIP();
    updateOBSPreviewPIP();
    // Update preview every 500ms for smooth video
    obsPIPInterval = setInterval(updateOBSPreviewPIP, 500);
}

// Stop OBS Preview PIP
function stopOBSPreviewPIP() {
    if (obsPIPInterval) {
        clearInterval(obsPIPInterval);
        obsPIPInterval = null;
    }
}

// Stop OBS preview updates
function stopOBSPreview() {
    if (obsPreviewInterval) {
        clearInterval(obsPreviewInterval);
        obsPreviewInterval = null;
    }
    stopOBSPreviewPIP();
    const previewEl = document.getElementById("obs-preview");
    if (previewEl) {
        previewEl.innerHTML = '<div class="text-[10px]">OBS</div>';
    }
}

// Update OBS preview - show scene name and status in small box
async function updateOBSPreview() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        return;
    }
    
    const previewEl = document.getElementById("obs-preview");
    const previewStatusEl = document.getElementById("obs-preview-status");
    
    try {
        const sceneList = await sendOBSRequest("GetSceneList");
        const streamStatus = await sendOBSRequest("GetStreamStatus");
        
        if (!sceneList || !sceneList.currentProgramSceneName) {
            if (previewEl) previewEl.innerHTML = '<div class="text-[10px]">OBS</div>';
            return;
        }
        
        const sceneName = sceneList.currentProgramSceneName;
        const isStreaming = streamStatus && streamStatus.outputActive;
        const statusText = isStreaming ? '●' : '○';
        const statusColor = isStreaming ? 'text-red-400' : 'text-gray-400';
        
        if (previewEl) {
            previewEl.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full">
                    <div class="${statusColor} text-xs">${statusText}</div>
                    <div class="text-gray-300 text-[8px] text-center truncate w-full">${sceneName}</div>
                </div>
            `;
        }
        if (previewStatusEl) {
            previewStatusEl.textContent = sceneName;
        }
    } catch (error) {
        // Ignore errors
    }
}

// Update OBS Preview PIP with actual video frames
async function updateOBSPreviewPIP() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN || !isPIPVisible) {
        return;
    }
    
    const pipContent = document.getElementById("obs-preview-pip-content");
    if (!pipContent) return;
    
    try {
        const sceneList = await sendOBSRequest("GetSceneList");
        if (!sceneList || !sceneList.currentProgramSceneName) {
            pipContent.innerHTML = '<div class="text-gray-400 text-sm p-4">No scene active</div>';
            return;
        }
        
        // Get screenshot of the program output (larger for bigger PIP)
        const screenshot = await sendOBSRequest("GetSourceScreenshot", {
            sourceName: sceneList.currentProgramSceneName,
            imageFormat: "png",
            imageWidth: 480,
            imageHeight: 270,
            imageCompressionQuality: 70
        });
        
        if (screenshot && screenshot.imageData) {
            // Check if imageData already has data URI prefix
            const imageSrc = screenshot.imageData.startsWith('data:') 
                ? screenshot.imageData 
                : `data:image/png;base64,${screenshot.imageData}`;
            pipContent.innerHTML = `<img src="${imageSrc}" class="w-full h-full object-contain" alt="OBS Preview" />`;
        } else {
            pipContent.innerHTML = `<div class="text-gray-400 text-sm p-4">Scene: ${sceneList.currentProgramSceneName}</div>`;
        }
    } catch (error) {
        // Silently fail - preview might not be available
        console.log("Preview update failed:", error.message);
    }
}

// Helper function to send OBS WebSocket requests
async function sendOBSRequest(requestType, requestData = {}) {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        throw new Error("OBS WebSocket is not connected");
    }
    
    return new Promise((resolve, reject) => {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const message = {
            op: 6, // Request
            d: {
                requestType: requestType,
                requestId: requestId,
                requestData: requestData
            }
        };
        
        const timeout = setTimeout(() => {
            obsPendingRequests.delete(requestId);
            reject(new Error(`OBS request timeout: ${requestType}`));
        }, 10000);
        
        // Store the resolver/rejector
        obsPendingRequests.set(requestId, { resolve, reject, timeout, requestType });
        
        console.log(`Sending OBS request: ${requestType}`, requestData);
        obsWebSocket.send(JSON.stringify(message));
    });
}

// Get RTMP URL based on region
function getRTMPURL(region) {
    const regionMap = {
        'na': 'rtls-ingress-prod-na.agoramdn.com',
        'eu': 'rtls-ingress-prod-eu.agoramdn.com',
        'ap': 'rtls-ingress-prod-ap.agoramdn.com',
        'cn': 'rtls-ingress-prod-cn.agoramdn.com'
    };
    return regionMap[region] || regionMap['na'];
}

// List OBS profiles
async function listOBSProfiles() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    try {
        const response = await sendOBSRequest("GetProfileList");
        const profileSelect = document.getElementById("mg-obs-profile");
        const panelProfileSelect = document.getElementById("obs-panel-profile");
        
        const updateSelect = (select) => {
            if (!select) return;
            const currentValue = select.value;
            select.innerHTML = '<option value="">Select a profile...</option>';
            
            // Add "Create New" option for panel select
            if (select.id === "obs-panel-profile") {
                const createOption = document.createElement('option');
                createOption.value = "__create_new__";
                createOption.textContent = "+ Create New";
                select.appendChild(createOption);
            }
            
            if (response.profiles && response.profiles.length > 0) {
                response.profiles.forEach(profile => {
                    const option = document.createElement('option');
                    option.value = profile;
                    option.textContent = profile;
                    if (response.currentProfileName === profile || currentValue === profile) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
            }
        };
        
        updateSelect(profileSelect);
        updateSelect(panelProfileSelect);
        
        showPopup("Profiles loaded successfully");
    } catch (error) {
        showPopup(`Error loading profiles: ${error.message}`);
        console.error("Error listing OBS profiles:", error);
    }
}

// Handle profile select change - show input for "Create New"
function handleProfileSelectChange(select) {
    const newProfileInput = document.getElementById("obs-panel-new-profile-name");
    if (!newProfileInput) return;
    
    if (select.value === "__create_new__") {
        newProfileInput.classList.remove("hidden");
        newProfileInput.focus();
    } else {
        newProfileInput.classList.add("hidden");
        newProfileInput.value = "";
    }
}

// Create new OBS profile
async function createOBSProfile() {
    const profileNameInput = document.getElementById("mg-obs-new-profile-name");
    if (!profileNameInput) return;
    
    const profileName = profileNameInput.value;
    if (!profileName) {
        showPopup("Please enter a profile name");
        return;
    }
    
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    try {
        await sendOBSRequest("CreateProfile", { profileName: profileName });
        showPopup(`Profile "${profileName}" created successfully`);
        profileNameInput.value = "";
        await listOBSProfiles();
        // Select the new profile
        const profileSelect = document.getElementById("mg-obs-profile");
        if (profileSelect) profileSelect.value = profileName;
    } catch (error) {
        showPopup(`Error creating profile: ${error.message}`);
        console.error("Error creating OBS profile:", error);
    }
}

// Update OBS profile with recommended settings
async function updateOBSProfile() {
    console.log("updateOBSProfile called");
    const profileSelect = document.getElementById("mg-obs-profile");
    const panelProfileSelect = document.getElementById("obs-panel-profile");
    const newProfileInput = document.getElementById("obs-panel-new-profile-name");
    
    console.log("Profile selects:", { 
        profileSelect: !!profileSelect, 
        panelProfileSelect: !!panelProfileSelect,
        panelValue: panelProfileSelect?.value,
        profileValue: profileSelect?.value
    });
    
    // Check if creating new profile
    if (panelProfileSelect && panelProfileSelect.value === "__create_new__") {
        console.log("Creating new profile...");
        const newProfileName = newProfileInput ? newProfileInput.value.trim() : "";
        if (!newProfileName) {
            showPopup("Please enter a profile name (press Enter or click Update)");
            if (newProfileInput) newProfileInput.focus();
            return;
        }
        // Create the profile first
        try {
            await sendOBSRequest("CreateProfile", { profileName: newProfileName });
            
            // Set the new profile as current
            await sendOBSRequest("SetCurrentProfile", { profileName: newProfileName });
            
            // Get current stream key from Media Gateway if it exists
            const streamKeyEl = document.getElementById("mg-stream-key");
            const currentStreamKey = streamKeyEl ? streamKeyEl.value.trim() : "";
            
            // Get region for RTMP URL
            refreshCredentials();
            const currentRegion = region || localStorage.getItem("agoraRegion") || "na";
            const rtmpServer = getRTMPURL(currentRegion);
            const rtmpURL = `rtmp://${rtmpServer}/live`;
            
            // Set stream service settings to rtmp_custom immediately after creating profile
            await sendOBSRequest("SetStreamServiceSettings", {
                streamServiceType: "rtmp_custom",
                streamServiceSettings: {
                    server: rtmpURL, // Always set the server URL
                    key: currentStreamKey || "" // Set key if available
                }
            });
            
            showPopup(`Profile "${newProfileName}" created${currentStreamKey ? ' with RTMP settings' : ''}!`);
            if (newProfileInput) newProfileInput.value = "";
            if (newProfileInput) newProfileInput.classList.add("hidden");
            
            // Refresh profiles list and select the new one
            await listOBSProfiles();
            
            // Wait a bit for the dropdown to update, then select the new profile
            setTimeout(() => {
                if (panelProfileSelect) {
                    panelProfileSelect.value = newProfileName;
                    // Trigger change event to sync
                    panelProfileSelect.dispatchEvent(new Event('change'));
                }
                if (profileSelect) {
                    profileSelect.value = newProfileName;
                }
            }, 100);
            
            return; // Exit early since we've already set everything up
        } catch (error) {
            showPopup(`Error creating profile: ${error.message}`);
            console.error("Error creating OBS profile:", error);
            return;
        }
    }
    
    // Get profile name from either select
    const profileName = (profileSelect && profileSelect.value) || (panelProfileSelect && panelProfileSelect.value);
    
    // Sync the values
    if (profileSelect && panelProfileSelect) {
        profileSelect.value = profileName;
        panelProfileSelect.value = profileName;
    }
    if (!profileName || profileName === "__create_new__") {
        showPopup("Please select a profile to update");
        return;
    }
    
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        console.log("OBS not connected");
        showPopup("Please connect to OBS first");
        return;
    }
    
    // Status element is optional - use popup if not found
    const statusEl = document.getElementById("mg-obs-profile-status");
    const panelStatusEl = document.getElementById("obs-panel-status");
    
    console.log("Updating profile:", profileName);
    console.log("Status elements:", { statusEl: !!statusEl, panelStatusEl: !!panelStatusEl });
    
    const statusMessage = "Updating profile settings...";
    if (statusEl) statusEl.textContent = statusMessage;
    if (panelStatusEl) panelStatusEl.textContent = statusMessage;
    
    try {
        console.log("Setting current profile to:", profileName);
        // Set the profile first
        const setProfileResult = await sendOBSRequest("SetCurrentProfile", { profileName: profileName });
        console.log("Profile set successfully:", setProfileResult);
        
        // Small delay to ensure profile switch is processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get current stream key from Media Gateway if it exists
        const streamKeyEl = document.getElementById("mg-stream-key");
        const currentStreamKey = streamKeyEl ? streamKeyEl.value.trim() : "";
        
        // Get region for RTMP URL
        refreshCredentials();
        const currentRegion = region || localStorage.getItem("agoraRegion") || "na";
        const rtmpServer = getRTMPURL(currentRegion);
        const rtmpURL = `rtmp://${rtmpServer}/live`;
        
        // Update output settings (streaming) - use rtmp_custom for Custom RTMP service
        // Always set rtmp_custom with server URL, even if no stream key yet
        console.log("Setting stream service settings:", {
            type: "rtmp_custom",
            server: rtmpURL,
            hasKey: !!currentStreamKey
        });
        await sendOBSRequest("SetStreamServiceSettings", {
            streamServiceType: "rtmp_custom",
            streamServiceSettings: {
                server: rtmpURL, // Always set the server URL
                key: currentStreamKey || "" // Set key if available
            }
        });
        console.log("Stream service settings updated");
        
        // Note: OBS WebSocket v5 allows updating:
        // - Stream Service Settings (we're doing this) ✓
        // - Video Settings (base/output resolution, FPS) - via SetVideoSettings
        // - Output Settings (encoder, bitrate, etc.) - mostly read-only, must be set in OBS UI
        // - Scene settings (scenes, sources)
        // - Source settings (individual source properties)
        
        // Try to get current settings for logging
        try {
            const currentVideoSettings = await sendOBSRequest("GetVideoSettings");
            console.log("Current video settings:", currentVideoSettings);
            // Video settings can be updated with SetVideoSettings, but we'll leave them as-is
            // to avoid changing user's preferred resolution/FPS
        } catch (e) {
            console.log("Could not get video settings:", e.message);
        }
        
        // Verify the settings were applied
        let verified = false;
        try {
            const verify = await sendOBSRequest("GetStreamServiceSettings");
            verified = verify && verify.streamServiceType === "rtmp_custom";
            console.log("Verified stream service settings:", {
                type: verify.streamServiceType,
                server: verify.streamServiceSettings?.server,
                keySet: !!verify.streamServiceSettings?.key
            });
        } catch (e) {
            console.log("Could not verify settings:", e);
        }
        
        const successMessage = `Profile updated! ${verified ? '✓ Set to Custom RTMP' : 'Settings applied.'} ${currentStreamKey ? 'RTMP URL and stream key have been set.' : 'Note: Stream key not set yet. Create a Media Gateway stream key first.'}`;
        
        if (statusEl) {
            statusEl.innerHTML = `
                <div class="text-yellow-400 text-sm">
                    <p class="font-semibold mb-2">${successMessage}</p>
                    <p class="text-xs mt-2">You must manually verify these settings in OBS Settings → Output tab:</p>
                    <ul class="list-disc list-inside space-y-1 text-xs mt-1">
                        <li>Bitrate: maximum 3500 kbps</li>
                        <li>Keyframe Interval: "2 s"</li>
                        <li>Rate Control: "CBR"</li>
                        <li>Tune: "zerolatency"</li>
                    </ul>
                </div>
            `;
        }
        if (panelStatusEl) {
            panelStatusEl.textContent = verified ? "✓ Custom RTMP" : "Updated";
        }
        showPopup("Profile updated! " + (verified ? "Set to Custom RTMP. " : "") + (currentStreamKey ? "RTMP URL and stream key set." : "Create a stream key to set RTMP URL."));
    } catch (error) {
        const errorMessage = `Error: ${error.message}`;
        if (statusEl) {
            statusEl.innerHTML = `<span class="text-red-400">${errorMessage}</span>`;
        }
        if (panelStatusEl) {
            panelStatusEl.textContent = "Error";
        }
        showPopup(`Error updating profile: ${error.message}`);
        console.error("Error updating OBS profile:", error);
    }
}

// Open OBS Settings Modal
async function openOBSSettingsModal() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    const modal = document.getElementById("obsSettingsModal");
    const content = document.getElementById("obs-settings-content");
    if (!modal || !content) return;
    
    modal.classList.remove("hidden");
    content.innerHTML = '<p class="text-gray-400">Loading settings...</p>';
    
    try {
        // Determine which output to use - try adv_stream first (Advanced mode)
        let outputName = "adv_stream";
        let isAdvancedMode = true;
        let outputSettings = null;
        
        // Try to get output settings for adv_stream first to detect mode
        // Always check fresh - don't cache mode detection
        try {
            outputSettings = await sendOBSRequest("GetOutputSettings", { outputName: "adv_stream" });
            // If successful, we're in Advanced mode
            isAdvancedMode = true;
            outputName = "adv_stream";
            console.log("OBS is in Advanced Mode - adv_stream output found");
        } catch (e) {
            const errorMsg = e.message || String(e) || "";
            console.log("Checking OBS mode - adv_stream error:", errorMsg);
            // Check for various error messages that indicate Simple mode
            if (errorMsg.includes("No output was found") || 
                errorMsg.includes("not found") || 
                errorMsg.includes("does not exist") ||
                errorMsg.includes("Invalid output name")) {
                isAdvancedMode = false;
                outputName = ""; // No specific output name for Simple mode
                outputSettings = { error: errorMsg, isSimpleMode: true };
                console.log("OBS is in Simple Mode - adv_stream not available");
            } else {
                // Other error - might be connection issue, but assume Simple mode for safety
                isAdvancedMode = false;
                outputSettings = { error: errorMsg, isSimpleMode: true };
                console.log("Assuming Simple Mode due to error:", errorMsg);
            }
        }
        
        // Fetch other OBS settings in parallel
        const [videoSettings, streamServiceSettings, sceneList] = await Promise.all([
            sendOBSRequest("GetVideoSettings").catch(e => ({ error: e.message })),
            sendOBSRequest("GetStreamServiceSettings").catch(e => ({ error: e.message })),
            sendOBSRequest("GetSceneList").catch(e => ({ error: e.message }))
        ]);
        
        let html = '<div class="space-y-6">';
        
        // Video Settings
        html += '<div class="modern-panel p-4">';
        html += '<h3 class="text-lg font-semibold mb-3">Video Settings</h3>';
        if (videoSettings.error) {
            html += `<p class="text-red-400 text-sm">Error: ${videoSettings.error}</p>`;
        } else {
            html += '<div class="grid grid-cols-2 gap-3">';
            html += `<div><label class="text-sm text-gray-400">Base Width</label><input type="number" id="obs-video-base-width" value="${videoSettings.baseWidth || ''}" class="w-full" /></div>`;
            html += `<div><label class="text-sm text-gray-400">Base Height</label><input type="number" id="obs-video-base-height" value="${videoSettings.baseHeight || ''}" class="w-full" /></div>`;
            html += `<div><label class="text-sm text-gray-400">Output Width</label><input type="number" id="obs-video-output-width" value="${videoSettings.outputWidth || ''}" class="w-full" /></div>`;
            html += `<div><label class="text-sm text-gray-400">Output Height</label><input type="number" id="obs-video-output-height" value="${videoSettings.outputHeight || ''}" class="w-full" /></div>`;
            
            // FPS - use common values dropdown instead of numerator/denominator
            const currentFPS = videoSettings.fpsNumerator && videoSettings.fpsDenominator 
                ? Math.round(videoSettings.fpsNumerator / videoSettings.fpsDenominator) 
                : 30;
            const commonFPS = [15, 24, 25, 30, 48, 50, 60];
            html += `<div class="col-span-2"><label class="text-sm text-gray-400">FPS (Frames Per Second)</label>`;
            html += `<select id="obs-video-fps" class="w-full">`;
            commonFPS.forEach(fps => {
                const selected = currentFPS === fps ? 'selected' : '';
                html += `<option value="${fps}" ${selected}>${fps} fps</option>`;
            });
            // Add custom option if current FPS is not in common list
            if (!commonFPS.includes(currentFPS) && currentFPS > 0) {
                html += `<option value="${currentFPS}" selected>${currentFPS} fps (current)</option>`;
            }
            html += `</select></div>`;
            html += '</div>';
        }
        html += '</div>';
        
        // Stream Service Settings
        html += '<div class="modern-panel p-4">';
        html += '<h3 class="text-lg font-semibold mb-3">Stream Service Settings</h3>';
        if (streamServiceSettings.error) {
            html += `<p class="text-red-400 text-sm">Error: ${streamServiceSettings.error}</p>`;
        } else {
            html += '<div class="space-y-3">';
            html += `<div><label class="text-sm text-gray-400">Service Type</label><input type="text" id="obs-stream-service-type" value="${streamServiceSettings.streamServiceType || ''}" class="w-full" readonly /></div>`;
            html += `<div><label class="text-sm text-gray-400">Server</label><input type="text" id="obs-stream-server" value="${streamServiceSettings.streamServiceSettings?.server || ''}" class="w-full" /></div>`;
            html += `<div><label class="text-sm text-gray-400">Stream Key</label><input type="password" id="obs-stream-key" value="${streamServiceSettings.streamServiceSettings?.key || ''}" class="w-full" /></div>`;
            html += '</div>';
        }
        html += '</div>';
        
        // Output Settings (editable fields)
        html += '<div class="modern-panel p-4">';
        html += '<h3 class="text-lg font-semibold mb-3">Output Settings</h3>';
        
        // Show mode indicator
        if (!isAdvancedMode) {
            html += '<div class="mb-3 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">';
            html += '<p class="text-yellow-300 text-sm font-semibold mb-1">⚠️ OBS is in Simple Mode</p>';
            html += '<p class="text-yellow-200 text-xs">To access advanced output settings (bitrate, keyframe interval, rate control, tune), switch OBS to Advanced Mode:</p>';
            html += '<ol class="text-yellow-200 text-xs list-decimal list-inside mt-2 space-y-1">';
            html += '<li>Open OBS Studio</li>';
            html += '<li>Go to Settings → Output</li>';
            html += '<li>Change "Output Mode" from "Simple" to "Advanced"</li>';
            html += '<li>Click "OK" to save</li>';
            html += '<li>Click "🔄 Refresh" button above to reload settings</li>';
            html += '</ol>';
            html += '</div>';
        } else {
            html += '<div class="mb-3 p-2 bg-green-500/20 border border-green-500/50 rounded-lg">';
            html += '<p class="text-green-300 text-xs">✓ OBS is in Advanced Mode - Full settings available</p>';
            html += '</div>';
        }
        
        if (outputSettings.error) {
            const errorMsg = outputSettings.error.includes("No output was found") 
                ? `Output "${outputName}" not found. ${!isAdvancedMode ? 'OBS is in Simple Mode - switch to Advanced Mode to access these settings.' : 'This output may not be available.'}`
                : outputSettings.error;
            html += `<p class="text-yellow-400 text-sm mb-3">Note: ${errorMsg}</p>`;
            // Still show editable fields even if we can't fetch current values (only if in Advanced mode)
            if (isAdvancedMode) {
                html += '<div class="space-y-3">';
                html += '<div><label class="text-sm text-gray-400">Bitrate (kbps)</label><input type="number" id="obs-output-bitrate" placeholder="e.g. 3500" class="w-full" /></div>';
                html += '<div><label class="text-sm text-gray-400">Keyframe Interval (seconds)</label><input type="number" id="obs-output-keyframe" placeholder="e.g. 2" step="0.1" class="w-full" /></div>';
                html += '<div><label class="text-sm text-gray-400">Rate Control</label><select id="obs-output-rate-control" class="w-full"><option value="CBR">CBR</option><option value="VBR">VBR</option><option value="ABR">ABR</option></select></div>';
                html += '<div><label class="text-sm text-gray-400">Tune</label><select id="obs-output-tune" class="w-full"><option value="zerolatency">zerolatency</option><option value="lowlatency">lowlatency</option><option value="">None</option></select></div>';
                html += '</div>';
                html += '<p class="text-yellow-400 text-xs mt-2">Note: These settings may need to be set manually in OBS Settings → Output tab if the API doesn\'t support them.</p>';
            } else {
                html += '<p class="text-gray-400 text-sm">Switch to Advanced Mode to configure these settings.</p>';
            }
        } else {
            const output = outputSettings.outputSettings || {};
            html += '<div class="space-y-3">';
            html += `<div><label class="text-sm text-gray-400">Encoder</label><input type="text" value="${outputSettings.encoderName || 'N/A'}" class="w-full" readonly /></div>`;
            html += `<div><label class="text-sm text-gray-400">Video Encoder</label><input type="text" value="${outputSettings.videoEncoderId || 'N/A'}" class="w-full" readonly /></div>`;
            html += `<div><label class="text-sm text-gray-400">Audio Encoder</label><input type="text" value="${outputSettings.audioEncoderId || 'N/A'}" class="w-full" readonly /></div>`;
            html += `<div><label class="text-sm text-gray-400">Bitrate (kbps)</label><input type="number" id="obs-output-bitrate" value="${output.bitrate || output.videoBitrate || ''}" placeholder="e.g. 3500" class="w-full" /></div>`;
            html += `<div><label class="text-sm text-gray-400">Keyframe Interval (seconds)</label><input type="number" id="obs-output-keyframe" value="${output.keyint_sec || output.keyframeInterval || ''}" placeholder="e.g. 2" step="0.1" class="w-full" /></div>`;
            html += `<div><label class="text-sm text-gray-400">Rate Control</label><select id="obs-output-rate-control" class="w-full"><option value="CBR" ${(output.rate_control || output.rateControl || 'CBR') === 'CBR' ? 'selected' : ''}>CBR</option><option value="VBR" ${(output.rate_control || output.rateControl) === 'VBR' ? 'selected' : ''}>VBR</option><option value="ABR" ${(output.rate_control || output.rateControl) === 'ABR' ? 'selected' : ''}>ABR</option></select></div>`;
            html += `<div><label class="text-sm text-gray-400">Tune</label><select id="obs-output-tune" class="w-full"><option value="zerolatency" ${(output.tune || 'zerolatency') === 'zerolatency' ? 'selected' : ''}>zerolatency</option><option value="lowlatency" ${output.tune === 'lowlatency' ? 'selected' : ''}>lowlatency</option><option value="" ${!output.tune ? 'selected' : ''}>None</option></select></div>`;
            html += '</div>';
            html += '<p class="text-yellow-400 text-xs mt-2">Note: Some output settings may need to be set manually in OBS Settings → Output tab if the API doesn\'t support them.</p>';
        }
        html += '</div>';
        
        // Scene List
        html += '<div class="modern-panel p-4">';
        html += '<h3 class="text-lg font-semibold mb-3">Scenes</h3>';
        if (sceneList.error) {
            html += `<p class="text-red-400 text-sm">Error: ${sceneList.error}</p>`;
        } else {
            html += '<div class="space-y-2">';
            if (sceneList.scenes && sceneList.scenes.length > 0) {
                sceneList.scenes.forEach((scene, idx) => {
                    const isCurrent = scene.sceneName === sceneList.currentProgramSceneName;
                    html += `<div class="flex items-center gap-2 p-2 bg-slate-700/50 rounded ${isCurrent ? 'border border-blue-500' : ''}">`;
                    html += `<span class="text-sm">${scene.sceneName}</span>`;
                    if (isCurrent) html += '<span class="text-xs text-blue-400">(Current)</span>';
                    html += `<span class="text-xs text-gray-400">(${scene.sceneIndex} sources)</span>`;
                    html += '</div>';
                });
            } else {
                html += '<p class="text-gray-400 text-sm">No scenes found</p>';
            }
            html += '</div>';
        }
        html += '</div>';
        
        html += '</div>';
        // Store the output name for saving
        html += `<input type="hidden" id="obs-current-output-name" value="${outputName}" />`;
        html += `<input type="hidden" id="obs-is-advanced-mode" value="${isAdvancedMode}" />`;
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<p class="text-red-400">Error loading settings: ${error.message}</p>`;
        console.error("Error loading OBS settings:", error);
    }
}

// Close OBS Settings Modal
function closeOBSSettingsModal() {
    const modal = document.getElementById("obsSettingsModal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

// Save OBS Settings
async function saveOBSSettings() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    try {
        // Get video settings
        const baseWidth = parseInt(document.getElementById("obs-video-base-width")?.value);
        const baseHeight = parseInt(document.getElementById("obs-video-base-height")?.value);
        const outputWidth = parseInt(document.getElementById("obs-video-output-width")?.value);
        const outputHeight = parseInt(document.getElementById("obs-video-output-height")?.value);
        const fps = parseInt(document.getElementById("obs-video-fps")?.value);
        
        // Convert FPS to numerator/denominator (common values use 1/1)
        const fpsNumerator = fps || 30;
        const fpsDenominator = 1;
        
        // Update video settings if values are provided
        if (baseWidth && baseHeight && outputWidth && outputHeight && fps) {
            try {
                await sendOBSRequest("SetVideoSettings", {
                    baseWidth,
                    baseHeight,
                    outputWidth,
                    outputHeight,
                    fpsNumerator: fpsNumerator,
                    fpsDenominator: fpsDenominator
                });
                showPopup("Video settings updated!");
            } catch (e) {
                showPopup(`Error updating video settings: ${e.message}`);
            }
        }
        
        // Update stream service settings
        const streamServer = document.getElementById("obs-stream-server")?.value;
        const streamKey = document.getElementById("obs-stream-key")?.value;
        if (streamServer !== undefined) {
            try {
                await sendOBSRequest("SetStreamServiceSettings", {
                    streamServiceType: "rtmp_custom",
                    streamServiceSettings: {
                        server: streamServer,
                        key: streamKey || ""
                    }
                });
                showPopup("Stream service settings updated!");
            } catch (e) {
                showPopup(`Error updating stream settings: ${e.message}`);
            }
        }
        
        // Try to update output settings (may not be fully supported)
        const outputName = document.getElementById("obs-current-output-name")?.value || "adv_stream";
        const isAdvancedMode = document.getElementById("obs-is-advanced-mode")?.value === "true";
        const outputBitrate = document.getElementById("obs-output-bitrate")?.value;
        const outputKeyframe = document.getElementById("obs-output-keyframe")?.value;
        const outputRateControl = document.getElementById("obs-output-rate-control")?.value;
        const outputTune = document.getElementById("obs-output-tune")?.value;
        
        if (!isAdvancedMode) {
            showPopup("Output settings can only be changed in Advanced Mode. Please switch OBS to Advanced Mode in Settings → Output.");
            return;
        }
        
        if (outputBitrate || outputKeyframe || outputRateControl || outputTune) {
            try {
                // Note: SetOutputSettings may not support all fields, but we'll try
                const outputSettingsUpdate = {};
                if (outputBitrate) outputSettingsUpdate.bitrate = parseInt(outputBitrate);
                if (outputKeyframe) outputSettingsUpdate.keyint_sec = parseFloat(outputKeyframe);
                if (outputRateControl) outputSettingsUpdate.rate_control = outputRateControl;
                if (outputTune) outputSettingsUpdate.tune = outputTune;
                
                await sendOBSRequest("SetOutputSettings", {
                    outputName: outputName,
                    outputSettings: outputSettingsUpdate
                });
                showPopup("Output settings updated! (Note: Some settings may require OBS restart or manual configuration)");
            } catch (e) {
                showPopup(`Note: Output settings may need to be set manually in OBS Settings → Output tab. Error: ${e.message}`);
            }
        }
        
        // Refresh the modal to show updated values
        setTimeout(() => {
            openOBSSettingsModal();
        }, 500);
    } catch (error) {
        showPopup(`Error saving settings: ${error.message}`);
        console.error("Error saving OBS settings:", error);
    }
}

// View required OBS settings
async function viewRequiredOBSSettings() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    try {
        const videoSettings = await sendOBSRequest("GetVideoSettings");
        const streamSettings = await sendOBSRequest("GetStreamServiceSettings");
        
        const statusEl = document.getElementById("mg-obs-profile-status");
        if (!statusEl) return;
        
        statusEl.innerHTML = `
            <div class="text-sm space-y-2">
                <p class="font-semibold">Current OBS Settings:</p>
                <div class="modern-panel p-2">
                    <p><strong>Video Settings:</strong></p>
                    <p>Base Resolution: ${videoSettings.baseWidth}x${videoSettings.baseHeight}</p>
                    <p>Output Resolution: ${videoSettings.outputWidth}x${videoSettings.outputHeight}</p>
                    <p>FPS: ${videoSettings.fpsNumerator}/${videoSettings.fpsDenominator}</p>
                </div>
                <div class="modern-panel p-2">
                    <p><strong>Stream Settings:</strong></p>
                    <p>Service: ${streamSettings.streamServiceType || 'Not set'}</p>
                    <p>Server: ${streamSettings.streamServiceSettings?.server || 'Not set'}</p>
                    <p>Stream Key: ${streamSettings.streamServiceSettings?.key ? '***' + streamSettings.streamServiceSettings.key.slice(-4) : 'Not set'}</p>
                </div>
                <p class="text-yellow-400 text-xs mt-2">Note: Some settings (Bitrate, Keyframe Interval, Rate Control, Tune) must be checked manually in OBS Settings → Output tab.</p>
            </div>
        `;
    } catch (error) {
        showPopup(`Error viewing settings: ${error.message}`);
        console.error("Error viewing OBS settings:", error);
    }
}

// Set stream key and RTMP URL in OBS
async function setOBSStreamKey(streamKey) {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        console.log("OBS not connected, skipping stream key setup");
        return;
    }
    
    try {
        // Get the current region from settings (refresh to ensure latest value)
        refreshCredentials();
        const currentRegion = region || localStorage.getItem("region") || "na";
        const rtmpServer = getRTMPURL(currentRegion);
        const rtmpURL = `rtmp://${rtmpServer}/live`;
        
        console.log(`Setting OBS stream key with region: ${currentRegion}, server: ${rtmpServer}`);
        
        // First, get current stream service settings to preserve other settings
        let currentSettings = {};
        try {
            const current = await sendOBSRequest("GetStreamServiceSettings");
            if (current && current.streamServiceSettings) {
                currentSettings = current.streamServiceSettings;
            }
        } catch (e) {
            console.log("Could not get current stream settings, using defaults");
        }
        
        // Update with new server and key - use rtmp_custom for Custom RTMP service
        await sendOBSRequest("SetStreamServiceSettings", {
            streamServiceType: "rtmp_custom",
            streamServiceSettings: {
                server: rtmpURL,
                key: streamKey
            }
        });
        
        showPopup("Stream key and RTMP URL set in OBS successfully!");
        console.log(`OBS stream settings updated: Server=${rtmpURL}, Key=${streamKey.substring(0, 10)}...`);
        
        // Verify the settings were applied
        try {
            const verify = await sendOBSRequest("GetStreamServiceSettings");
            console.log("Verified OBS stream settings:", {
                server: verify.streamServiceSettings?.server,
                keySet: !!verify.streamServiceSettings?.key
            });
        } catch (e) {
            console.log("Could not verify settings:", e);
        }
    } catch (error) {
        console.error("Error setting OBS stream key:", error);
        showPopup(`Warning: Could not set stream key in OBS: ${error.message}`);
    }
}

// Start OBS streaming
async function startOBSStream() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    const statusEl = document.getElementById("mg-obs-streaming-status");
    const statusText = "Starting stream...";
    if (statusEl) statusEl.textContent = statusText;
    updateOBSPanelStreamingStatus(`<span class="text-blue-400">${statusText}</span>`);
    
    try {
        await sendOBSRequest("StartStream", {});
        const successHTML = '<span class="text-green-400">Stream start requested</span>';
        if (statusEl) statusEl.innerHTML = successHTML;
        updateOBSPanelStreamingStatus(successHTML);
        showPopup("Stream start requested");
    } catch (error) {
        const errorHTML = `<span class="text-red-400">Error: ${error.message}</span>`;
        if (statusEl) statusEl.innerHTML = errorHTML;
        updateOBSPanelStreamingStatus(errorHTML);
        showPopup(`Error starting stream: ${error.message}`);
        console.error("Error starting OBS stream:", error);
    }
}

// Stop OBS streaming
async function stopOBSStream() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    const statusEl = document.getElementById("mg-obs-streaming-status");
    const statusText = "Stopping stream...";
    if (statusEl) statusEl.textContent = statusText;
    updateOBSPanelStreamingStatus(`<span class="text-yellow-400">${statusText}</span>`);
    
    try {
        await sendOBSRequest("StopStream", {});
        const successHTML = '<span class="text-yellow-400">Stream stop requested</span>';
        if (statusEl) statusEl.innerHTML = successHTML;
        updateOBSPanelStreamingStatus(successHTML);
        showPopup("Stream stop requested");
    } catch (error) {
        const errorHTML = `<span class="text-red-400">Error: ${error.message}</span>`;
        if (statusEl) statusEl.innerHTML = errorHTML;
        updateOBSPanelStreamingStatus(errorHTML);
        showPopup(`Error stopping stream: ${error.message}`);
        console.error("Error stopping OBS stream:", error);
    }
}

// Get OBS streaming status
async function getOBSStreamStatus() {
    if (!obsWebSocket || obsWebSocket.readyState !== WebSocket.OPEN) {
        showPopup("Please connect to OBS first");
        return;
    }
    
    const statusEl = document.getElementById("mg-obs-streaming-status");
    const statusText = "Checking status...";
    if (statusEl) statusEl.textContent = statusText;
    updateOBSPanelStreamingStatus(`<span class="text-blue-400">${statusText}</span>`);
    
    try {
        const response = await sendOBSRequest("GetStreamStatus", {});
        
        if (response && response.outputActive) {
            const duration = response.totalStreamTime || 0;
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = duration % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            const statusHTML = `
                <div class="text-sm">
                    <p class="font-semibold text-green-400">✓ Streaming Active</p>
                    <p class="text-xs text-gray-300">Duration: ${timeStr}</p>
                </div>
            `;
            
            if (statusEl) {
                statusEl.innerHTML = `
                    <div class="modern-panel p-2">
                        <p class="font-semibold text-green-400">Streaming Active</p>
                        <p class="text-sm text-gray-300">Duration: ${timeStr}</p>
                        <p class="text-sm text-gray-300">Output Active: Yes</p>
                    </div>
                `;
            }
            updateOBSPanelStreamingStatus(statusHTML);
            showPopup(`Stream is active (${timeStr})`);
        } else {
            const statusHTML = `
                <div class="text-sm">
                    <p class="font-semibold text-gray-400">Stream Not Active</p>
                </div>
            `;
            
            if (statusEl) {
                statusEl.innerHTML = `
                    <div class="modern-panel p-2">
                        <p class="font-semibold text-gray-400">Stream Not Active</p>
                        <p class="text-sm text-gray-300">Output Active: No</p>
                    </div>
                `;
            }
            updateOBSPanelStreamingStatus(statusHTML);
            showPopup("Stream is not active");
        }
    } catch (error) {
        const errorHTML = `<span class="text-red-400 text-sm">Error: ${error.message}</span>`;
        if (statusEl) statusEl.innerHTML = errorHTML;
        updateOBSPanelStreamingStatus(errorHTML);
        showPopup(`Error getting stream status: ${error.message}`);
        console.error("Error getting OBS stream status:", error);
    }
}

async function startMediaGateway() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    refreshCredentials();
    const channel = document.getElementById("mg-channel").value;
    const uid = document.getElementById("mg-uid").value || "333";
    const token = document.getElementById("mg-token").value;
    const expiresAfter = document.getElementById("mg-expires-after").value;
    
    if (!channel) {
        showPopup("Channel Name is required");
        return;
    }
    
    const templateIdCreate = document.getElementById("mg-template-id-create").value;
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Creating Media Gateway streaming key...";
    
    // Request body structure according to API docs
    const body = {
        settings: {
            channel: channel,
            uid: uid,
            expiresAfter: parseInt(expiresAfter) || 0
        }
    };
    
    // Add optional templateId if provided
    if (templateIdCreate) {
        body.settings.templateId = templateIdCreate;
    }
    
    try {
        refreshCredentials();
        // Media Gateway requires region in the path
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/streamkeys`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        const gatewayResult = await response.json();
        responseEl.textContent = JSON.stringify(gatewayResult, null, 2);
        
        // Response format: { status: "success", data: { streamKey, channel, uid, expiresAfter, createdAt } }
        if (gatewayResult.status === "success" && gatewayResult.data && gatewayResult.data.streamKey) {
            mediaGatewayStreamKey = gatewayResult.data.streamKey;
            document.getElementById("mg-stream-key").value = gatewayResult.data.streamKey;
            
            // Get the current region from settings (refresh to ensure latest value)
            refreshCredentials();
            const currentRegion = region || localStorage.getItem("region") || "na";
            const rtmpServer = getRTMPURL(currentRegion);
            const rtmpURL = `rtmp://${rtmpServer}/live`;
            
            console.log(`Created stream key with region: ${currentRegion}, server: ${rtmpServer}`);
            
            document.getElementById("mg-status").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Stream Key: ${gatewayResult.data.streamKey}</p>
                    <p class="text-sm text-gray-400">Channel: ${gatewayResult.data.channel}</p>
                    <p class="text-sm text-gray-400">UID: ${gatewayResult.data.uid}</p>
                    <p class="text-sm text-gray-400">Expires: ${gatewayResult.data.expiresAfter === 0 ? 'Never' : gatewayResult.data.expiresAfter + ' seconds'}</p>
                    <p class="text-xs text-gray-500 mt-2">OBS Settings: Server: ${rtmpURL}, Key: ${gatewayResult.data.streamKey}</p>
                </div>
            `;
            
            // Automatically set stream key in OBS if connected
            await setOBSStreamKey(gatewayResult.data.streamKey);
            
            showPopup("Media Gateway streaming key created successfully!");
        } else {
            showPopup(`Error: ${gatewayResult.message || "Failed to create streaming key"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function stopMediaGateway() {
    const keyInput = document.getElementById("mg-stream-key").value;
    if (keyInput) {
        mediaGatewayStreamKey = keyInput;
    }
    let streamKey = mediaGatewayStreamKey;
    if (!streamKey) {
        streamKey = prompt("Enter Stream Key:");
        if (!streamKey) return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Deleting Media Gateway streaming key...";
    
    try {
        refreshCredentials();
        // Media Gateway requires region in the path
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/streamkeys/${encodeURIComponent(streamKey)}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Handle empty response body (200 OK with empty body or 204 No Content)
        const responseText = await response.text();
        let result = {};
        
        if (responseText && responseText.trim() !== "") {
            try {
                result = JSON.parse(responseText);
                responseEl.textContent = JSON.stringify(result, null, 2);
            } catch (e) {
                responseEl.textContent = responseText;
            }
        } else {
            // Empty response body - success
            responseEl.textContent = `Media Gateway stopped successfully (${response.status} ${response.status === 200 ? 'OK' : 'No Content'})`;
        }
        
        // Don't clear the stream key field - keep it for reference
        document.getElementById("mg-status").innerHTML = '<p class="text-sm text-gray-400">Gateway stopped</p>';
        showPopup("Media Gateway stopped successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function queryMediaGateway() {
    const keyInput = document.getElementById("mg-stream-key").value;
    if (!keyInput) {
        showPopup("Please enter a Stream Key in the ID Management section");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Querying Media Gateway stream key...";
    
    try {
        refreshCredentials();
        // Media Gateway requires region in the path
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/streamkeys/${encodeURIComponent(keyInput)}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        if (result.status === "success" && result.data) {
            const data = result.data;
            document.getElementById("mg-status").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Stream Key: ${data.streamKey}</p>
                    <p class="text-sm text-gray-400">Channel: ${data.channel || "N/A"}</p>
                    <p class="text-sm text-gray-400">UID: ${data.uid || "N/A"}</p>
                    <p class="text-sm text-gray-400">Expires After: ${data.expiresAfter || "N/A"} seconds</p>
                    <p class="text-sm text-gray-400">Created At: ${data.createdAt ? new Date(parseInt(data.createdAt) * 1000).toLocaleString() : "N/A"}</p>
                </div>
            `;
            showPopup("Stream key queried successfully!");
        } else {
            showPopup(`Error: ${result.message || "Failed to query stream key"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function destroyMediaGateway() {
    const keyInput = document.getElementById("mg-stream-key").value;
    if (!keyInput) {
        showPopup("Please enter a Stream Key in the ID Management section");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Destroying Media Gateway stream key...";
    
    if (!confirm(`Are you sure you want to destroy stream key "${keyInput}"?`)) {
        return;
    }
    
    try {
        refreshCredentials();
        // Media Gateway requires region in the path
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/streamkeys/${encodeURIComponent(keyInput)}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Handle empty response body (200 OK with empty body or 204 No Content)
        const responseText = await response.text();
        let result = {};
        
        if (responseText && responseText.trim() !== "") {
            try {
                result = JSON.parse(responseText);
                responseEl.textContent = JSON.stringify(result, null, 2);
            } catch (e) {
                responseEl.textContent = responseText;
            }
        } else {
            // Empty response body - success
            responseEl.textContent = `Stream key destroyed successfully (${response.status} ${response.status === 200 ? 'OK' : 'No Content'})`;
        }
        
        // Clear the stream key field
        document.getElementById("mg-stream-key").value = "";
        mediaGatewayStreamKey = null;
        document.getElementById("mg-status").innerHTML = '<p class="text-sm text-gray-400">Stream key destroyed</p>';
        showPopup("Stream key destroyed successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

// ============================================
// MEDIA GATEWAY - FLOW CONFIGURATION TEMPLATES
// ============================================

async function createMediaGatewayTemplate() {
    const templateId = document.getElementById("mg-template-id").value;
    if (!templateId) {
        showPopup("Template ID is required (e.g., 720p, 1080p)");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Creating/Resetting Media Gateway template...";
    
    // Read template settings from UI
    const videoEnabled = document.getElementById("mg-tmpl-video-enabled").checked;
    const audioEnabled = document.getElementById("mg-tmpl-audio-enabled").checked;
    
    const body = {
        settings: {
            transcoding: {},
            jitterBuffer: {
                size: parseInt(document.getElementById("mg-tmpl-jitter-size").value) || 500,
                maxSize: parseInt(document.getElementById("mg-tmpl-jitter-max").value) || 800
            }
        }
    };
    
    // Add video transcoding if enabled
    if (videoEnabled) {
        body.settings.transcoding.video = {
            enabled: true,
            codec: document.getElementById("mg-tmpl-video-codec").value || "H.264",
            width: parseInt(document.getElementById("mg-tmpl-video-width").value) || 1280,
            height: parseInt(document.getElementById("mg-tmpl-video-height").value) || 720,
            fps: parseInt(document.getElementById("mg-tmpl-video-fps").value) || 24,
            bitrate: parseInt(document.getElementById("mg-tmpl-video-bitrate").value) || 2200
        };
        
        // Add simulcast stream if values are provided
        const simWidth = parseInt(document.getElementById("mg-tmpl-video-sim-width").value);
        const simHeight = parseInt(document.getElementById("mg-tmpl-video-sim-height").value);
        if (simWidth && simHeight) {
            body.settings.transcoding.video.simulcastStream = {
                width: simWidth,
                height: simHeight,
                fps: parseInt(document.getElementById("mg-tmpl-video-sim-fps").value) || 24,
                bitrate: parseInt(document.getElementById("mg-tmpl-video-sim-bitrate").value) || 1670
            };
        }
    }
    
    // Add audio transcoding if enabled
    if (audioEnabled) {
        body.settings.transcoding.audio = {
            enabled: true,
            profile: parseInt(document.getElementById("mg-tmpl-audio-profile").value) || 3
        };
    }
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        showPopup("Template created/reset successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function updateMediaGatewayTemplate() {
    const templateId = document.getElementById("mg-template-id").value;
    if (!templateId) {
        showPopup("Template ID is required");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Updating Media Gateway template...";
    
    // Read template settings from UI
    const videoEnabled = document.getElementById("mg-tmpl-video-enabled").checked;
    const audioEnabled = document.getElementById("mg-tmpl-audio-enabled").checked;
    
    const body = {
        settings: {
            transcoding: {},
            jitterBuffer: {
                size: parseInt(document.getElementById("mg-tmpl-jitter-size").value) || 500,
                maxSize: parseInt(document.getElementById("mg-tmpl-jitter-max").value) || 800
            }
        }
    };
    
    // Add video transcoding if enabled
    if (videoEnabled) {
        body.settings.transcoding.video = {
            enabled: true,
            codec: document.getElementById("mg-tmpl-video-codec").value || "H.264",
            width: parseInt(document.getElementById("mg-tmpl-video-width").value) || 1280,
            height: parseInt(document.getElementById("mg-tmpl-video-height").value) || 720,
            fps: parseInt(document.getElementById("mg-tmpl-video-fps").value) || 24,
            bitrate: parseInt(document.getElementById("mg-tmpl-video-bitrate").value) || 2200
        };
        
        // Add simulcast stream if values are provided
        const simWidth = parseInt(document.getElementById("mg-tmpl-video-sim-width").value);
        const simHeight = parseInt(document.getElementById("mg-tmpl-video-sim-height").value);
        if (simWidth && simHeight) {
            body.settings.transcoding.video.simulcastStream = {
                width: simWidth,
                height: simHeight,
                fps: parseInt(document.getElementById("mg-tmpl-video-sim-fps").value) || 24,
                bitrate: parseInt(document.getElementById("mg-tmpl-video-sim-bitrate").value) || 1670
            };
        }
    }
    
    // Add audio transcoding if enabled
    if (audioEnabled) {
        body.settings.transcoding.audio = {
            enabled: true,
            profile: parseInt(document.getElementById("mg-tmpl-audio-profile").value) || 3
        };
    }
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        showPopup("Template updated successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function deleteMediaGatewayTemplate() {
    const templateId = document.getElementById("mg-template-id").value;
    if (!templateId) {
        showPopup("Template ID is required");
        return;
    }
    
    if (!confirm(`Are you sure you want to delete template "${templateId}"?`)) {
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Deleting Media Gateway template...";
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Handle empty response body (200 OK with empty body or 204 No Content)
        const responseText = await response.text();
        let result = {};
        
        if (responseText && responseText.trim() !== "") {
            try {
                result = JSON.parse(responseText);
                responseEl.textContent = JSON.stringify(result, null, 2);
            } catch (e) {
                responseEl.textContent = responseText;
            }
        } else {
            // Empty response body - success
            responseEl.textContent = `Template deleted successfully (${response.status} ${response.status === 200 ? 'OK' : 'No Content'})`;
        }
        
        showPopup("Template deleted successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function setGlobalMediaGatewayTemplate() {
    const templateId = document.getElementById("mg-template-id").value;
    if (!templateId) {
        showPopup("Template ID is required");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Setting global Media Gateway template...";
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}/global`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        showPopup("Global template set successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

// ============================================
// MEDIA GATEWAY - STREAMING OPERATIONS
// ============================================

async function queryStreamingList() {
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Querying streaming list...";
    
    try {
        const response = await proxyFetch(`https://api.sd-rtn.com/${region}/v1/projects/${appid}/rtls/ingress/streams`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        if (result.streams && result.streams.length > 0) {
            document.getElementById("mg-status").innerHTML = `
                <div class="space-y-2">
                    <p class="text-sm font-semibold">Found ${result.streams.length} stream(s)</p>
                    ${result.streams.map(stream => `
                        <div class="modern-panel p-2">
                            <p class="font-semibold">Stream ID: ${stream.streamId || stream.id}</p>
                            <p class="text-sm text-gray-400">Channel: ${stream.channel || "N/A"}</p>
                            <p class="text-sm text-gray-400">Status: ${stream.status || "N/A"}</p>
                            <button onclick="document.getElementById('mg-stream-id').value='${stream.streamId || stream.id}'; showPopup('Stream ID set!')" class="modern-btn modern-btn-secondary mt-2 text-xs">Use This Stream ID</button>
                        </div>
                    `).join("")}
                </div>
            `;
            showPopup(`Found ${result.streams.length} stream(s)`);
        } else {
            document.getElementById("mg-status").innerHTML = '<p class="text-sm text-gray-400">No active streams</p>';
            showPopup("No streams found");
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function queryStreamingInformation() {
    const streamId = document.getElementById("mg-stream-id").value;
    if (!streamId) {
        showPopup("Stream ID is required");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Querying streaming information...";
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtls/ingress/streams/${encodeURIComponent(streamId)}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        if (result.stream || result.data) {
            const stream = result.stream || result.data || result;
            document.getElementById("mg-status").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Stream ID: ${stream.streamId || stream.id || streamId}</p>
                    <p class="text-sm text-gray-400">Channel: ${stream.channel || "N/A"}</p>
                    <p class="text-sm text-gray-400">Status: ${stream.status || "N/A"}</p>
                    <p class="text-sm text-gray-400">UID: ${stream.uid || "N/A"}</p>
                </div>
            `;
            showPopup("Streaming information retrieved successfully!");
        } else {
            showPopup(`Error: ${result.message || "Failed to get streaming information"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function forceDisconnectStream() {
    const streamId = document.getElementById("mg-stream-id").value;
    if (!streamId) {
        showPopup("Stream ID is required");
        return;
    }
    
    if (!confirm(`Are you sure you want to force disconnect stream "${streamId}"?`)) {
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Force disconnecting stream...";
    
    try {
        const response = await proxyFetch(`https://api.agora.io/${region}v1/projects/${appid}/rtls/ingress/streams/${encodeURIComponent(streamId)}/disconnect`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        showPopup("Stream force disconnected successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function muteUnmuteStream() {
    const streamId = document.getElementById("mg-stream-id").value;
    if (!streamId) {
        showPopup("Stream ID is required");
        return;
    }
    
    const muteAudio = document.getElementById("mg-mute-audio").checked;
    const muteVideo = document.getElementById("mg-mute-video").checked;
    
    if (!muteAudio && !muteVideo) {
        showPopup("Please select at least one option (Audio or Video) to mute");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Updating stream mute settings...";
    
    const body = {
        mute: muteAudio || muteVideo,
        audio: muteAudio,
        video: muteVideo
    };
    
    try {
        const response = await proxyFetch(`https://api.sd-rtn.com/${region}/v1/projects/${appid}/rtls/ingress/streams/${encodeURIComponent(streamId)}/mute`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        const muteStatus = [];
        if (muteAudio) muteStatus.push("audio");
        if (muteVideo) muteStatus.push("video");
        showPopup(`Stream ${muteStatus.join(" & ")} ${muteAudio || muteVideo ? "muted" : "unmuted"} successfully!`);
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

// ============================================
// CLOUD TRANSCODING
// ============================================

let transcodingBuilderToken = null;
let audioInputCounter = 0;
let videoInputCounter = 0;
let outputCounter = 0;
let watermarkCounter = 0;

// Initialize with one audio, one video input, and one output on page load
document.addEventListener('DOMContentLoaded', function() {
    addAudioInput();
    addVideoInput();
    addOutput();
});

function addAudioInput() {
    const container = document.getElementById('ct-audio-inputs-container');
    // Count existing audio inputs to determine the number
    const existingInputs = container.querySelectorAll('[id^="audio-input-"]');
    const inputNumber = existingInputs.length + 1; // 1-based number for display
    const inputId = `audio-input-${audioInputCounter++}`; // Still use counter for unique ID
    
    const inputDiv = document.createElement('div');
    inputDiv.id = inputId;
    inputDiv.className = 'border border-gray-700 rounded p-3 mb-2';
    inputDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <label class="text-sm font-semibold">Audio Input ${inputNumber}</label>
            <button onclick="removeAudioInput('${inputId}')" class="modern-btn modern-btn-danger text-xs">Remove</button>
        </div>
        <select class="audio-input-type mb-2" onchange="toggleAudioInputType('${inputId}', this.value)" data-tooltip="Select the audio input source type: RTC Stream (from Agora RTC channel) or CDN Stream (from external URL)">
            <option value="rtc">RTC Stream</option>
            <option value="cdn">CDN Stream</option>
        </select>
        <div class="audio-rtc-fields">
            <input type="text" class="audio-channel" placeholder="RTC Channel" value="testChannel" data-tooltip="The Agora RTC channel name where the audio stream is published" />
            <input type="number" class="audio-uid" placeholder="RTC UID" value="${1001 + existingInputs.length}" data-tooltip="The UID of the user publishing the audio stream in the RTC channel. Must be a valid number and not 0." />
            <input type="text" class="audio-token" placeholder="RTC Token (optional)" data-tooltip="Token for authentication to join the RTC channel. Required for secure channels. Set uid to 0 when generating the token." />
        </div>
        <div class="audio-cdn-fields" style="display: none;">
            <input type="text" class="audio-stream-url" placeholder="CDN Stream URL" data-tooltip="The URL of the CDN audio source stream" />
            <input type="number" class="audio-volume" placeholder="Volume (0-200)" value="100" min="0" max="200" data-tooltip="The volume of the audio source stream. Range: 0-200. Default: 100 (original volume)" />
            <input type="number" class="audio-repeat" placeholder="Repeat (n: play n times, -1: loop, 1: once)" value="1" data-tooltip="Number of times to play the media stream. 1 = play once, -1 = loop infinitely, n = play n times. Cannot be 0." />
        </div>
    `;
    container.appendChild(inputDiv);
    // Re-initialize tooltips for the new element
    setTimeout(setupTooltips, 50);
}

function removeAudioInput(inputId) {
    document.getElementById(inputId).remove();
}

function toggleAudioInputType(inputId, type) {
    const inputDiv = document.getElementById(inputId);
    const rtcFields = inputDiv.querySelector('.audio-rtc-fields');
    const cdnFields = inputDiv.querySelector('.audio-cdn-fields');
    
    if (type === 'rtc') {
        rtcFields.style.display = 'block';
        cdnFields.style.display = 'none';
    } else {
        rtcFields.style.display = 'none';
        cdnFields.style.display = 'block';
    }
}

function addVideoInput() {
    const container = document.getElementById('ct-video-inputs-container');
    // Count existing video inputs to determine position and number
    const existingInputs = container.querySelectorAll('[id^="video-input-"]');
    const inputIndex = existingInputs.length; // 0-based index for the new input
    const inputNumber = existingInputs.length + 1; // 1-based number for display
    const inputId = `video-input-${videoInputCounter++}`; // Still use counter for unique ID
    
    // Get dimensions from first input if available, otherwise use defaults
    let width = 640;
    let height = 360;
    if (existingInputs.length > 0) {
        const firstInput = existingInputs[0];
        const firstWidth = firstInput.querySelector('.video-width');
        const firstHeight = firstInput.querySelector('.video-height');
        if (firstWidth && firstWidth.value) {
            width = parseInt(firstWidth.value) || 640;
        }
        if (firstHeight && firstHeight.value) {
            height = parseInt(firstHeight.value) || 360;
        }
    }
    
    // Calculate position based on 2x2 grid layout
    // Input 1 (index 0): top left (0, 0)
    // Input 2 (index 1): top right (next to input 1)
    // Input 3 (index 2): bottom left (below input 1)
    // Input 4 (index 3): bottom right
    // Input 5+: default to (0, 0) - user can manually adjust
    let x = 0;
    let y = 0;
    
    if (inputIndex === 0) {
        // First input: top left
        x = 0;
        y = 0;
    } else if (inputIndex === 1) {
        // Second input: top right (next to first input)
        x = width;
        y = 0;
    } else if (inputIndex === 2) {
        // Third input: bottom left (below first input)
        x = 0;
        y = height;
    } else if (inputIndex === 3) {
        // Fourth input: bottom right
        x = width;
        y = height;
    }
    // For inputIndex >= 4, keep default (0, 0)
    
    const inputDiv = document.createElement('div');
    inputDiv.id = inputId;
    inputDiv.className = 'border border-gray-700 rounded p-3 mb-2';
    inputDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <label class="text-sm font-semibold">Video Input ${inputNumber}</label>
            <button onclick="removeVideoInput('${inputId}')" class="modern-btn modern-btn-danger text-xs">Remove</button>
        </div>
        <select class="video-input-type mb-2" onchange="toggleVideoInputType('${inputId}', this.value)" data-tooltip="Select the video input source type: RTC Stream (from Agora RTC channel) or CDN Stream (from external URL)">
            <option value="rtc">RTC Stream</option>
            <option value="cdn">CDN Stream</option>
        </select>
        <div class="video-rtc-fields">
            <input type="text" class="video-channel" placeholder="RTC Channel" value="testChannel" data-tooltip="The Agora RTC channel name where the video stream is published" />
            <input type="number" class="video-uid" placeholder="RTC UID" value="${1001 + existingInputs.length}" data-tooltip="The UID of the user publishing the video stream in the RTC channel. Must be a valid number and not 0." />
            <input type="text" class="video-token" placeholder="RTC Token (optional)" data-tooltip="Token for authentication to join the RTC channel. Required for secure channels. Set uid to 0 when generating the token." />
            <input type="text" class="video-placeholder-url" placeholder="Placeholder Image URL (optional)" data-tooltip="URL of the placeholder image displayed when the user is offline. Must be a valid image URL with jpg or png suffix." />
        </div>
        <div class="video-cdn-fields" style="display: none;">
            <input type="text" class="video-stream-url" placeholder="CDN Stream URL" data-tooltip="The URL of the CDN video source stream" />
            <input type="number" class="video-repeat" placeholder="Repeat (n: play n times, -1: loop, 1: once)" value="1" data-tooltip="Number of times to play the media stream. 1 = play once, -1 = loop infinitely, n = play n times. Cannot be 0." />
        </div>
        <div class="grid grid-cols-2 gap-2 mt-2">
            <input type="number" class="video-x" placeholder="X" value="${x}" min="0" max="3840" data-tooltip="The x coordinate of the video on the canvas (px). Horizontal displacement of the upper left corner relative to the origin (top-left of canvas)" />
            <input type="number" class="video-y" placeholder="Y" value="${y}" min="0" max="3840" data-tooltip="The y coordinate of the video on the canvas (px). Vertical displacement of the upper left corner relative to the origin (top-left of canvas)" />
            <input type="number" class="video-width" placeholder="Width" value="${width}" min="120" max="3840" data-tooltip="The width of the video region on the canvas (px). Range: 120-3840" />
            <input type="number" class="video-height" placeholder="Height" value="${height}" min="120" max="3840" data-tooltip="The height of the video region on the canvas (px). Range: 120-3840" />
            <input type="number" class="video-z-order" placeholder="Z-Order" value="2" min="2" max="100" data-tooltip="The layer order of the video on the canvas. 2 represents the layer above the placeholder layer. 100 represents the top layer. Range: 2-100" />
        </div>
    `;
    container.appendChild(inputDiv);
    // Re-initialize tooltips for the new element
    setTimeout(setupTooltips, 50);
}

function removeVideoInput(inputId) {
    document.getElementById(inputId).remove();
}

function addOutput() {
    const container = document.getElementById('ct-outputs-container');
    // Count existing outputs to determine the number
    const existingOutputs = container.querySelectorAll('[id^="output-"]');
    const outputNumber = existingOutputs.length + 1; // 1-based number for display
    const outputId = `output-${outputCounter++}`; // Still use counter for unique ID
    
    const outputDiv = document.createElement('div');
    outputDiv.id = outputId;
    outputDiv.className = 'border border-gray-700 rounded p-3 mb-2';
    outputDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <label class="text-sm font-semibold">Output ${outputNumber}</label>
            <button onclick="removeOutput('${outputId}')" class="modern-btn modern-btn-danger text-xs">Remove</button>
        </div>
        <select class="output-type mb-2" onchange="toggleOutputType('${outputId}', this.value)" data-tooltip="Select the output destination type: RTC Channel (publish to Agora RTC channel) or CDN Stream (push to external CDN URL)">
            <option value="rtc">RTC Channel</option>
            <option value="cdn">CDN Stream</option>
        </select>
        <div class="output-rtc-fields">
            <input type="text" class="output-channel" placeholder="RTC Channel" value="testChannel" data-tooltip="The Agora RTC channel name where the transcoded audio and video will be published" />
            <input type="number" class="output-uid" placeholder="RTC UID" value="${999 + existingOutputs.length}" data-tooltip="The UID of the RTC channel for the transcoded streams. Must be different from other users in the channel. Use this UID when generating the token." />
            <div class="flex gap-2">
                <input type="text" class="output-token flex-1" placeholder="RTC Token (required)" data-tooltip="Token for authentication to join the output RTC channel. Required for secure channels. Use the output UID when generating this token." />
                <button onclick="generateTokenForOutput('${outputId}')" class="modern-btn modern-btn-secondary" data-tooltip="Generate an RTC token for this output using the configured UID and channel name">Generate</button>
            </div>
        </div>
        <div class="output-cdn-fields" style="display: none;">
            <input type="text" class="output-stream-url" placeholder="CDN Stream URL (required)" data-tooltip="The CDN streaming address where the transcoded stream will be pushed" />
        </div>
        <h4 class="text-sm font-semibold mt-3 mb-2">Audio Options</h4>
        <label class="text-sm text-gray-400">Audio Profile:</label>
        <select class="output-audio-profile" data-tooltip="Audio properties of the transcoded output. Select the profile that best matches your use case">
            <option value="AUDIO_PROFILE_DEFAULT">Default (48kHz, mono, 64kbps)</option>
            <option value="AUDIO_PROFILE_SPEECH_STANDARD">Speech Standard (32kHz, mono, 18kbps)</option>
            <option value="AUDIO_PROFILE_MUSIC_STANDARD">Music Standard (48kHz, mono, 64kbps)</option>
            <option value="AUDIO_PROFILE_MUSIC_STANDARD_STEREO">Music Standard Stereo (48kHz, stereo, 80kbps)</option>
            <option value="AUDIO_PROFILE_MUSIC_HIGH_QUALITY">Music High Quality (48kHz, mono, 96kbps)</option>
            <option value="AUDIO_PROFILE_MUSIC_HIGH_QUALITY_STEREO">Music High Quality Stereo (48kHz, stereo, 128kbps)</option>
        </select>
        <h4 class="text-sm font-semibold mt-3 mb-2">Video Options</h4>
        <div class="grid grid-cols-2 gap-2">
            <input type="number" class="output-video-width" placeholder="Video Width" value="1280" min="120" max="3840" data-tooltip="The width of the transcoded output video in pixels. Range: 120-3840" />
            <input type="number" class="output-video-height" placeholder="Video Height" value="720" min="120" max="3840" data-tooltip="The height of the transcoded output video in pixels. Range: 120-3840" />
        </div>
        <input type="number" class="output-video-bitrate" placeholder="Video Bitrate (kbps)" value="2200" min="1" max="10000" data-tooltip="The bitrate of the transcoded output video in kilobits per second. Range: 1-10000" />
        <input type="number" class="output-video-fps" placeholder="Video FPS" value="30" min="1" max="30" data-tooltip="The frame rate (frames per second) of the transcoded output video. Range: 1-30. Default: 15" />
        <label class="text-sm text-gray-400">Video Codec:</label>
        <select class="output-video-codec" data-tooltip="The codec used to transcode the output video. H264 is standard, VP8 is alternative">
            <option value="H264">H264</option>
            <option value="VP8">VP8</option>
        </select>
        <label class="text-sm text-gray-400">Video Mode (optional, RAW for no transcoding):</label>
        <select class="output-video-mode" data-tooltip="Set to RAW to output video without transcoding (encoding format unchanged). In RAW mode, only 1 video input is allowed">
            <option value="">None (transcode)</option>
            <option value="RAW">RAW (no transcoding)</option>
        </select>
    `;
    container.appendChild(outputDiv);
    // Re-initialize tooltips for the new element
    setTimeout(setupTooltips, 50);
}

function removeOutput(outputId) {
    document.getElementById(outputId).remove();
}

function toggleOutputType(outputId, type) {
    const outputDiv = document.getElementById(outputId);
    const rtcFields = outputDiv.querySelector('.output-rtc-fields');
    const cdnFields = outputDiv.querySelector('.output-cdn-fields');
    
    if (type === 'rtc') {
        rtcFields.style.display = 'block';
        cdnFields.style.display = 'none';
    } else {
        rtcFields.style.display = 'none';
        cdnFields.style.display = 'block';
    }
}

function generateTokenForOutput(outputId) {
    const outputDiv = document.getElementById(outputId);
    const channelInput = outputDiv.querySelector('.output-channel');
    const uidInput = outputDiv.querySelector('.output-uid');
    const tokenInput = outputDiv.querySelector('.output-token');
    
    if (!channelInput || !channelInput.value) {
        showPopup("Please enter a channel name first");
        return;
    }
    
    const channel = channelInput.value;
    const uid = parseInt(uidInput.value) || 999;
    
    try {
        const token = generateRtcToken(channel, uid);
        if (tokenInput) {
            tokenInput.value = token;
            showPopup("Token generated successfully!");
        }
    } catch (error) {
        showPopup(`Error generating token: ${error.message}`);
    }
}

function toggleVideoInputType(inputId, type) {
    const inputDiv = document.getElementById(inputId);
    const rtcFields = inputDiv.querySelector('.video-rtc-fields');
    const cdnFields = inputDiv.querySelector('.video-cdn-fields');
    
    if (type === 'rtc') {
        rtcFields.style.display = 'block';
        cdnFields.style.display = 'none';
    } else {
        rtcFields.style.display = 'none';
        cdnFields.style.display = 'block';
    }
}

function addWatermark() {
    const container = document.getElementById('ct-watermarks-container');
    // Count existing watermarks to determine the number
    const existingWatermarks = container.querySelectorAll('[id^="watermark-"]');
    const watermarkNumber = existingWatermarks.length + 1; // 1-based number for display
    const watermarkId = `watermark-${watermarkCounter++}`; // Still use counter for unique ID
    
    const watermarkDiv = document.createElement('div');
    watermarkDiv.id = watermarkId;
    watermarkDiv.className = 'border border-gray-700 rounded p-3 mb-2';
    watermarkDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <label class="text-sm font-semibold">Watermark ${watermarkNumber}</label>
            <button onclick="removeWatermark('${watermarkId}')" class="modern-btn modern-btn-danger text-xs">Remove</button>
        </div>
        <input type="text" class="watermark-image-url" placeholder="Watermark Image URL (required, jpg/png)" data-tooltip="The URL of the watermark image. Must be a valid URL with jpg or png suffix" />
        <div class="grid grid-cols-2 gap-2 mt-2">
            <input type="number" class="watermark-x" placeholder="X" value="0" min="0" max="3840" data-tooltip="The x coordinate of the watermark on the canvas (px). Horizontal displacement of the upper left corner relative to the origin" />
            <input type="number" class="watermark-y" placeholder="Y" value="0" min="0" max="3840" data-tooltip="The y coordinate of the watermark on the canvas (px). Vertical displacement of the upper left corner relative to the origin" />
            <input type="number" class="watermark-width" placeholder="Width" value="120" min="120" max="3840" data-tooltip="The width of the watermark in pixels. Range: 120-3840" />
            <input type="number" class="watermark-height" placeholder="Height" value="120" min="120" max="3840" data-tooltip="The height of the watermark in pixels. Range: 120-3840" />
            <input type="number" class="watermark-z-order" placeholder="Z-Order" value="50" min="0" max="100" data-tooltip="The layer order of the watermark. 0 represents the bottom layer. 100 represents the top layer. Range: 0-100" />
        </div>
        <label class="text-sm text-gray-400 mt-2">Fill Mode:</label>
        <select class="watermark-fill-mode" data-tooltip="Watermark fill mode. FILL: Scale and crop in center maintaining aspect ratio. FIT: Scale to fill display maintaining aspect ratio">
            <option value="FILL">FILL</option>
            <option value="FIT">FIT</option>
        </select>
    `;
    container.appendChild(watermarkDiv);
    // Re-initialize tooltips for the new element
    setTimeout(setupTooltips, 50);
}

function removeWatermark(watermarkId) {
    document.getElementById(watermarkId).remove();
}

function collectWatermarks() {
    const container = document.getElementById('ct-watermarks-container');
    const watermarkDivs = container.querySelectorAll('[id^="watermark-"]');
    const watermarks = [];
    
    watermarkDivs.forEach(div => {
        const imageUrl = div.querySelector('.watermark-image-url').value;
        const x = parseInt(div.querySelector('.watermark-x').value) || 0;
        const y = parseInt(div.querySelector('.watermark-y').value) || 0;
        const width = parseInt(div.querySelector('.watermark-width').value) || 120;
        const height = parseInt(div.querySelector('.watermark-height').value) || 120;
        const zOrder = parseInt(div.querySelector('.watermark-z-order').value) || 50;
        const fillMode = div.querySelector('.watermark-fill-mode').value || "FILL";
        
        if (imageUrl) {
            watermarks.push({
                imageUrl: imageUrl,
                region: { x, y, width, height, zOrder },
                fillMode: fillMode
            });
        }
    });
    
    return watermarks;
}

function collectAudioInputs() {
    const container = document.getElementById('ct-audio-inputs-container');
    const audioInputDivs = container.querySelectorAll('[id^="audio-input-"]');
    const audioInputs = [];
    
    audioInputDivs.forEach(div => {
        const type = div.querySelector('.audio-input-type').value;
        
        if (type === 'rtc') {
            const channel = div.querySelector('.audio-channel').value;
            const uid = parseInt(div.querySelector('.audio-uid').value);
            const token = div.querySelector('.audio-token').value;
            
            // Validate: channel must exist, UID must be a valid number and not 0
            if (channel && !isNaN(uid) && uid !== 0) {
                const rtcInput = {
                    rtc: {
                        rtcChannel: channel,
                        rtcUid: uid,
                        rtcToken: token || ""  // Always include rtcToken, even if empty
                    }
                };
                audioInputs.push(rtcInput);
            }
        } else {
            const streamUrl = div.querySelector('.audio-stream-url').value;
            const volume = parseInt(div.querySelector('.audio-volume').value) || 100;
            const repeat = parseInt(div.querySelector('.audio-repeat').value) || 1;
            
            if (streamUrl) {
                audioInputs.push({
                    streamUrl: streamUrl,
                    volume: volume,
                    repeat: repeat
                });
            }
        }
    });
    
    return audioInputs;
}

function collectVideoInputs() {
    const container = document.getElementById('ct-video-inputs-container');
    const videoInputDivs = container.querySelectorAll('[id^="video-input-"]');
    const videoInputs = [];
    
    videoInputDivs.forEach(div => {
        const type = div.querySelector('.video-input-type').value;
        const x = parseInt(div.querySelector('.video-x').value) || 0;
        const y = parseInt(div.querySelector('.video-y').value) || 0;
        const width = parseInt(div.querySelector('.video-width').value) || 640;
        const height = parseInt(div.querySelector('.video-height').value) || 360;
        const zOrder = parseInt(div.querySelector('.video-z-order').value) || 2;
        
        if (type === 'rtc') {
            const channel = div.querySelector('.video-channel').value;
            const uid = parseInt(div.querySelector('.video-uid').value);
            const token = div.querySelector('.video-token').value;
            const placeholderUrl = div.querySelector('.video-placeholder-url').value;
            
            // Validate: channel must exist, UID must be a valid number and not 0
            if (channel && !isNaN(uid) && uid !== 0) {
                const videoInput = {
                    rtc: {
                        rtcChannel: channel,
                        rtcUid: uid,
                        rtcToken: token || ""  // Always include rtcToken, even if empty
                    },
                    region: { x, y, width, height, zOrder }
                };
                if (placeholderUrl) videoInput.placeholderImageUrl = placeholderUrl;
                videoInputs.push(videoInput);
            }
        } else {
            const streamUrl = div.querySelector('.video-stream-url').value;
            const repeat = parseInt(div.querySelector('.video-repeat').value) || 1;
            
            if (streamUrl) {
                videoInputs.push({
                    streamUrl: streamUrl,
                    repeat: repeat,
                    region: { x, y, width, height, zOrder }
                });
            }
        }
    });
    
    return videoInputs;
}

function collectOutputs() {
    const container = document.getElementById('ct-outputs-container');
    const outputDivs = container.querySelectorAll('[id^="output-"]');
    const outputs = [];
    
    outputDivs.forEach(div => {
        const type = div.querySelector('.output-type').value;
        const audioProfile = div.querySelector('.output-audio-profile').value || "AUDIO_PROFILE_DEFAULT";
        const videoWidth = parseInt(div.querySelector('.output-video-width').value) || 1280;
        const videoHeight = parseInt(div.querySelector('.output-video-height').value) || 720;
        const videoBitrate = parseInt(div.querySelector('.output-video-bitrate').value) || 2200;
        const videoFps = parseInt(div.querySelector('.output-video-fps').value) || 30;
        const videoCodec = div.querySelector('.output-video-codec').value || "H264";
        const videoMode = div.querySelector('.output-video-mode').value || null;
        
        if (type === 'rtc') {
            const channel = div.querySelector('.output-channel').value;
            const uid = parseInt(div.querySelector('.output-uid').value);
            const token = div.querySelector('.output-token').value;
            
            // Validate: channel must exist, UID must be a valid number and not 0
            if (channel && !isNaN(uid) && uid !== 0) {
                const output = {
                    rtc: {
                        rtcChannel: channel,
                        rtcUid: uid,
                        rtcToken: token || ""  // Always include rtcToken, even if empty
                    },
                    audioOption: {
                        profileType: audioProfile
                    },
                    videoOption: {
                        width: videoWidth,
                        height: videoHeight,
                        bitrate: videoBitrate,
                        codec: videoCodec,
                        fps: videoFps
                    }
                };
                if (videoMode) {
                    output.videoOption.mode = videoMode;
                }
                outputs.push(output);
            }
        } else {
            const streamUrl = div.querySelector('.output-stream-url').value;
            
            if (streamUrl) {
                const output = {
                    streamUrl: streamUrl,
                    audioOption: {
                        profileType: audioProfile
                    },
                    videoOption: {
                        width: videoWidth,
                        height: videoHeight,
                        bitrate: videoBitrate,
                        codec: videoCodec,
                        fps: videoFps
                    }
                };
                if (videoMode) {
                    output.videoOption.mode = videoMode;
                }
                outputs.push(output);
            }
        }
    });
    
    return outputs;
}

async function acquireTranscoding() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    // Collect audio and video inputs
    const audioInputs = collectAudioInputs();
    const videoInputs = collectVideoInputs();
    
    if (audioInputs.length === 0 && videoInputs.length === 0) {
        showPopup("At least one audio or video input is required");
        return;
    }
    
    // Get instanceId - use saved one from acquire, or from input, or generate new
    const instanceId = transcodingInstanceId || document.getElementById("ct-instance-id").value || `instance_${Date.now()}`;
    
    const streamProcessMode = document.getElementById("ct-stream-mode").value || null;
    const idleTimeout = parseInt(document.getElementById("ct-idle-timeout").value) || 300;
    const canvasWidth = parseInt(document.getElementById("ct-canvas-width").value) || 1280;
    const canvasHeight = parseInt(document.getElementById("ct-canvas-height").value) || 720;
    const canvasColor = document.getElementById("ct-canvas-color").value || "0";
    const canvasBgImage = document.getElementById("ct-canvas-bg-image").value || null;
    const canvasFillMode = document.getElementById("ct-canvas-fill-mode").value || "FILL";
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Acquiring builder token...";
    
    // Build request body - Acquire uses camelCase instanceId
    const body = {
        instanceId: instanceId,
        services: {
            cloudTranscoder: {
                serviceType: "cloudTranscoderV2",
                config: {
                    transcoder: {
                        idleTimeout: idleTimeout
                    }
                }
            }
        }
    };
    
    if (streamProcessMode && streamProcessMode !== "mix") {
        body.services.cloudTranscoder.config.transcoder.streamProcessMode = streamProcessMode;
    }
    
    // Add audio inputs if any
    if (audioInputs.length > 0) {
        body.services.cloudTranscoder.config.transcoder.audioInputs = audioInputs;
    }
    
    // Add video inputs if any
    if (videoInputs.length > 0) {
        body.services.cloudTranscoder.config.transcoder.videoInputs = videoInputs;
    }
    
    // Canvas
    body.services.cloudTranscoder.config.transcoder.canvas = {
        width: canvasWidth,
        height: canvasHeight,
        color: parseInt(canvasColor) || 0
    };
    if (canvasBgImage) {
        body.services.cloudTranscoder.config.transcoder.canvas.backgroundImage = canvasBgImage;
        body.services.cloudTranscoder.config.transcoder.canvas.fillMode = canvasFillMode;
    }
    
    // Collect watermarks
    const watermarks = collectWatermarks();
    if (watermarks.length > 0) {
        body.services.cloudTranscoder.config.transcoder.watermarks = watermarks;
    }
    
    // Collect outputs
    const outputs = collectOutputs();
    
    if (outputs.length === 0) {
        showPopup("At least one output is required");
        return;
    }
    
    body.services.cloudTranscoder.config.transcoder.outputs = outputs;
    
    try {
        const response = await proxyFetch(`https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/builderTokens`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        if (result.tokenName) {
            transcodingBuilderToken = result.tokenName;
            transcodingInstanceId = instanceId; // Save instanceId for reuse
            document.getElementById("ct-builder-token").value = result.tokenName;
            document.getElementById("ct-instance-id").value = instanceId; // Update UI with the instanceId used
            showPopup("Builder token acquired successfully! Use it within 2 seconds to create a task.");
        } else {
            showPopup(`Error: ${result.message || "Failed to acquire builder token"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function createTranscoding() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    // Get builder token (required)
    const builderTokenInput = document.getElementById("ct-builder-token").value;
    const builderToken = builderTokenInput || transcodingBuilderToken;
    if (!builderToken) {
        showPopup("Builder Token is required. Please click 'Acquire' first to get a builder token.");
        return;
    }
    
    // Collect audio and video inputs
    const audioInputs = collectAudioInputs();
    const videoInputs = collectVideoInputs();
    
    if (audioInputs.length === 0 && videoInputs.length === 0) {
        showPopup("At least one audio or video input is required");
        return;
    }
    
    // Collect outputs
    const outputs = collectOutputs();
    
    if (outputs.length === 0) {
        showPopup("At least one output is required");
        return;
    }
    
    // Get stream process mode
    const streamProcessMode = document.getElementById("ct-stream-mode").value || "mix";
    
    // Get transcoder settings
    const idleTimeout = parseInt(document.getElementById("ct-idle-timeout").value) || 300;
    
    // Get canvas settings
    const canvasWidth = parseInt(document.getElementById("ct-canvas-width").value) || 1280;
    const canvasHeight = parseInt(document.getElementById("ct-canvas-height").value) || 720;
    const canvasColor = document.getElementById("ct-canvas-color").value || "0";
    const canvasBgImage = document.getElementById("ct-canvas-bg-image").value || null;
    const canvasFillMode = document.getElementById("ct-canvas-fill-mode").value || "FILL";
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Creating transcoding task...";
    
    // Build the full request body according to API spec
    // Note: Create endpoint does NOT include instance_id in the body
    const body = {
        services: {
            cloudTranscoder: {
                serviceType: "cloudTranscoderV2",
                config: {
                    transcoder: {
                        idleTimeout: idleTimeout
                    }
                }
            }
        }
    };
    
    // Add stream process mode if not mix
    if (streamProcessMode !== "mix") {
        body.services.cloudTranscoder.config.transcoder.streamProcessMode = streamProcessMode;
    }
    
    // Add audio inputs if any
    if (audioInputs.length > 0) {
        body.services.cloudTranscoder.config.transcoder.audioInputs = audioInputs;
    }
    
    // Add video inputs if any
    if (videoInputs.length > 0) {
        body.services.cloudTranscoder.config.transcoder.videoInputs = videoInputs;
    }
    
    // Build canvas
    body.services.cloudTranscoder.config.transcoder.canvas = {
        width: canvasWidth,
        height: canvasHeight,
        color: parseInt(canvasColor) || 0
    };
    if (canvasBgImage) {
        body.services.cloudTranscoder.config.transcoder.canvas.backgroundImage = canvasBgImage;
        body.services.cloudTranscoder.config.transcoder.canvas.fillMode = canvasFillMode;
    }
    
    // Collect watermarks
    const watermarks = collectWatermarks();
    if (watermarks.length > 0) {
        body.services.cloudTranscoder.config.transcoder.watermarks = watermarks;
    }
    
    // Use outputs collected earlier (already validated)
    body.services.cloudTranscoder.config.transcoder.outputs = outputs;
    
    try {
        const url = `https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/tasks?builderToken=${encodeURIComponent(builderToken)}`;
        console.log("Creating transcoding task:", url);
        console.log("Request body:", JSON.stringify(body, null, 2));
        
        const response = await proxyFetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        if (result.taskId) {
            transcodingTaskId = result.taskId;
            document.getElementById("ct-task-id").value = result.taskId;
            document.getElementById("ct-info").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Task ID: ${result.taskId}</p>
                    <p class="text-sm text-gray-400">Status: ${result.status || "CREATED"}</p>
                    <p class="text-sm text-gray-400">Created: ${result.createTs ? new Date(result.createTs * 1000).toLocaleString() : "N/A"}</p>
                </div>
            `;
            showPopup("Transcoding task created successfully!");
        } else {
            showPopup(`Error: ${result.message || "Failed to create transcoding task"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function queryTranscoding() {
    const taskIdInput = document.getElementById("ct-task-id").value;
    const builderTokenInput = document.getElementById("ct-builder-token").value;
    const builderToken = builderTokenInput || transcodingBuilderToken;
    
    if (!taskIdInput) {
        showPopup("Task ID is required for Query");
        return;
    }
    if (!builderToken) {
        showPopup("Builder Token is required for Query");
        return;
    }
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Querying transcoding task...";
    
    try {
        const response = await proxyFetch(`https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/tasks/${taskIdInput}?builderToken=${encodeURIComponent(builderToken)}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        if (result.taskId) {
            // Single task response
            document.getElementById("ct-info").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Task ID: ${result.taskId}</p>
                    <p class="text-sm text-gray-400">Status: ${result.status || "Unknown"}</p>
                    <p class="text-sm text-gray-400">Created: ${result.createTs ? new Date(result.createTs * 1000).toLocaleString() : "N/A"}</p>
                </div>
            `;
        } else {
            document.getElementById("ct-info").innerHTML = '<p class="text-sm text-gray-400">No active transcoding tasks</p>';
        }
        showPopup("Query completed!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

let transcodingSequenceId = 0;

async function updateTranscoding() {
    const idInput = document.getElementById("ct-task-id").value;
    const builderTokenInput = document.getElementById("ct-builder-token").value;
    const builderToken = builderTokenInput || transcodingBuilderToken;
    
    if (!idInput) {
        showPopup("Task ID is required for Update");
        return;
    }
    if (!builderToken) {
        showPopup("Builder Token is required for Update");
        return;
    }
    
    // Increment sequence ID
    transcodingSequenceId++;
    const sequenceId = transcodingSequenceId;
    const updateMask = "services.cloudTranscoder.config";
    
    // Collect audio and video inputs
    const audioInputs = collectAudioInputs();
    const videoInputs = collectVideoInputs();
    
    if (audioInputs.length === 0 && videoInputs.length === 0) {
        showPopup("At least one audio or video input is required");
        return;
    }
    
    // Collect outputs
    const outputs = collectOutputs();
    
    if (outputs.length === 0) {
        showPopup("At least one output is required");
        return;
    }
    
    const streamProcessMode = document.getElementById("ct-stream-mode").value || null;
    const idleTimeout = parseInt(document.getElementById("ct-idle-timeout").value) || 300;
    const canvasWidth = parseInt(document.getElementById("ct-canvas-width").value) || 1280;
    const canvasHeight = parseInt(document.getElementById("ct-canvas-height").value) || 720;
    const canvasColor = document.getElementById("ct-canvas-color").value || "0";
    const canvasBgImage = document.getElementById("ct-canvas-bg-image").value || null;
    const canvasFillMode = document.getElementById("ct-canvas-fill-mode").value || "FILL";
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Updating transcoding task...";
    
    // Build full config (Update requires all fields from Create)
    // Note: Update endpoint does NOT include instance_id in the body (same as Create)
    const body = {
        services: {
            cloudTranscoder: {
                serviceType: "cloudTranscoderV2",
                config: {
                    transcoder: {
                        idleTimeout: idleTimeout
                    }
                }
            }
        }
    };
    
    if (streamProcessMode && streamProcessMode !== "mix") {
        body.services.cloudTranscoder.config.transcoder.streamProcessMode = streamProcessMode;
    }
    
    // Add audio inputs if any
    if (audioInputs.length > 0) {
        body.services.cloudTranscoder.config.transcoder.audioInputs = audioInputs;
    }
    
    // Add video inputs if any
    if (videoInputs.length > 0) {
        body.services.cloudTranscoder.config.transcoder.videoInputs = videoInputs;
    }
    
    body.services.cloudTranscoder.config.transcoder.canvas = {
        width: canvasWidth,
        height: canvasHeight,
        color: parseInt(canvasColor) || 0
    };
    if (canvasBgImage) {
        body.services.cloudTranscoder.config.transcoder.canvas.backgroundImage = canvasBgImage;
        body.services.cloudTranscoder.config.transcoder.canvas.fillMode = canvasFillMode;
    }
    
    // Collect watermarks
    const watermarks = collectWatermarks();
    if (watermarks.length > 0) {
        body.services.cloudTranscoder.config.transcoder.watermarks = watermarks;
    }
    
    // Use outputs collected earlier
    body.services.cloudTranscoder.config.transcoder.outputs = outputs;
    
    try {
        const url = `https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/tasks/${idInput}?builderToken=${encodeURIComponent(builderToken)}&sequenceId=${sequenceId}&updateMask=${encodeURIComponent(updateMask)}`;
        const response = await proxyFetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Update returns empty body on success (2XX)
        if (response.status >= 200 && response.status < 300) {
            responseEl.textContent = "Update successful (empty response body)";
            showPopup("Transcoding task updated successfully!");
        } else {
            const result = await response.json();
            responseEl.textContent = JSON.stringify(result, null, 2);
            showPopup(`Error: ${result.message || "Update failed"}`);
        }
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function destroyTranscoding() {
    const idInput = document.getElementById("ct-task-id").value;
    const builderTokenInput = document.getElementById("ct-builder-token").value;
    const builderToken = builderTokenInput || transcodingBuilderToken;
    
    if (!idInput) {
        showPopup("Task ID is required for Destroy");
        return;
    }
    if (!builderToken) {
        showPopup("Builder Token is required for Destroy");
        return;
    }
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Destroying transcoding task...";
    
    try {
        const url = `https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/tasks/${idInput}?builderToken=${encodeURIComponent(builderToken)}`;
        const response = await proxyFetch(url, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Handle empty response body (200 OK with empty body or 204 No Content)
        const responseText = await response.text();
        let result = {};
        
        if (responseText && responseText.trim() !== "") {
            try {
                result = JSON.parse(responseText);
        responseEl.textContent = JSON.stringify(result, null, 2);
            } catch (e) {
                responseEl.textContent = responseText;
            }
        } else {
            // Empty response body - success
            responseEl.textContent = `Transcoding task destroyed successfully (${response.status} ${response.status === 200 ? 'OK' : 'No Content'})`;
        }
        
        transcodingTaskId = null;
        transcodingSequenceId = 0;
        document.getElementById("ct-info").innerHTML = '<p class="text-sm text-gray-400">Transcoding information will appear here</p>';
        showPopup("Transcoding task destroyed successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

// Cloud Transcoding Template Management
async function createOrUpdateCTTemplate() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    const templateId = document.getElementById("ct-template-id").value;
    const enabled = document.getElementById("ct-template-enabled").checked;
    const width = parseInt(document.getElementById("ct-template-width").value) || 1280;
    const height = parseInt(document.getElementById("ct-template-height").value) || 720;
    const fps = parseInt(document.getElementById("ct-template-fps").value) || 30;
    
    if (!templateId) {
        showPopup("Template ID is required");
        return;
    }
    
    // Validate max values
    if (width > 1920) {
        showPopup("Width cannot exceed 1920px");
        return;
    }
    if (height > 1920) {
        showPopup("Height cannot exceed 1920px");
        return;
    }
    if (fps > 60) {
        showPopup("FPS cannot exceed 60");
        return;
    }
    
    const responseEl = document.getElementById("ct-template-response");
    responseEl.textContent = "Creating/updating template...";
    
    const body = {
        enabled: enabled,
        video: {
            width: width,
            height: height,
            fps: fps
        }
    };
    
    try {
        const response = await proxyFetch(`https://api.sd-rtn.com/v1/projects/${appid}/rtls/abr/config/codecs/${encodeURIComponent(templateId)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        showPopup(`Template "${templateId}" ${result.status === 'success' ? 'saved successfully' : 'operation completed'}!`);
        
        // Auto-refresh the templates list
        queryCTTemplates();
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function queryCTTemplates() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    const responseEl = document.getElementById("ct-template-response");
    const listEl = document.getElementById("ct-templates-list");
    responseEl.textContent = "Querying templates...";
    
    try {
        const response = await proxyFetch(`https://api.sd-rtn.com/v1/projects/${appid}/rtls/abr/config/codecs`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        
        // Display templates in a nice format
        if (result.data && result.data.codecs && result.data.codecs.length > 0) {
            listEl.innerHTML = result.data.codecs.map(codec => `
                <div class="border border-gray-700 rounded p-3 mb-2">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-semibold">${codec.id}</span>
                        <span class="text-sm ${codec.enabled ? 'text-green-400' : 'text-red-400'}">
                            ${codec.enabled ? '✓ Enabled' : '✗ Disabled'}
                        </span>
                    </div>
                    <div class="text-sm text-gray-400">
                        <p>Resolution: ${codec.video.width}x${codec.video.height}</p>
                        <p>FPS: ${codec.video.fps}</p>
                    </div>
                </div>
            `).join('');
            
            const multibitrateStatus = result.data.enabled ? 
                '<p class="text-green-400 text-sm mb-2">Multi-bitrate function: Enabled</p>' : 
                '<p class="text-red-400 text-sm mb-2">Multi-bitrate function: Disabled</p>';
            listEl.innerHTML = multibitrateStatus + listEl.innerHTML;
        } else {
            listEl.innerHTML = '<p class="text-sm text-gray-400">No templates found</p>';
        }
        
        showPopup("Templates retrieved successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        listEl.innerHTML = '<p class="text-sm text-red-400">Error loading templates</p>';
        showPopup(`Error: ${error.message}`);
    }
}

// ============================================
// AGORA RTC - JOIN AS HOST
// ============================================

// ============================================
// AGORA RTC - UNIFIED VIDEO PLAYER FUNCTIONS
// ============================================

async function joinChannelAsHost() {
    try {
        if (!appid || appid.trim() === "") {
            throw new Error("App ID is required. Please set API credentials first.");
        }
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    const channel = document.getElementById("host-channel").value;
    const uidInput = document.getElementById("host-uid").value;
    const uid = uidInput ? parseInt(uidInput) : null;
    const token = document.getElementById("host-token").value || null;
    
    if (!channel) {
        showPopup("Channel Name is required");
        return;
    }
    
    const videoPlayerEl = document.getElementById("host-video-player");
    const statusEl = document.getElementById("host-status");
    const controlsEl = document.getElementById("host-controls");
    
    // Leave existing channel if any
    await leaveHostChannel();
    
    // Create new client
    hostRtcClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    
    // Set client role to host
    await hostRtcClient.setClientRole("host");
    
    try {
        // Get camera and microphone
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localVideoTrack = await AgoraRTC.createCameraVideoTrack();
        
        // Join channel
        const userUid = await hostRtcClient.join(appid, channel, token, uid);
        statusEl.textContent = `Joined as host (UID: ${userUid})`;
        showPopup(`Joined channel as host (UID: ${userUid})`);
        
        // Publish local tracks
        await hostRtcClient.publish([localAudioTrack, localVideoTrack]);
        
        // Play local video
        videoPlayerEl.innerHTML = "";
        localVideoTrack.play(videoPlayerEl);
        
        // Show controls
        controlsEl.classList.remove("hidden");
        
        // Setup mute/unmute button handlers
        setupHostControls();
        
        // Listen for remote users (optional for host)
        hostRtcClient.on("user-published", async (user, mediaType) => {
            if (mediaType === "audio") {
                await hostRtcClient.subscribe(user, mediaType);
                user.audioTrack?.play();
            }
        });
    } catch (error) {
        showPopup(`Error joining channel: ${error.message}`);
        statusEl.textContent = `Error: ${error.message}`;
        console.error(error);
        // Clean up tracks on error
        if (localAudioTrack) {
            localAudioTrack.close();
            localAudioTrack = null;
        }
        if (localVideoTrack) {
            localVideoTrack.close();
            localVideoTrack = null;
        }
        hostRtcClient = null;
    }
}

async function leaveHostChannel() {
    const videoPlayerEl = document.getElementById("host-video-player");
    const statusEl = document.getElementById("host-status");
    const controlsEl = document.getElementById("host-controls");
    
    try {
        // Clean up local tracks
        if (localAudioTrack) {
            localAudioTrack.close();
            localAudioTrack = null;
        }
        if (localVideoTrack) {
            localVideoTrack.close();
            localVideoTrack = null;
        }
        
        // Leave channel
        if (hostRtcClient) {
            await hostRtcClient.leave();
            hostRtcClient = null;
        }
        
        // Reset button states
        const micBtn = document.getElementById("toggleMicBtn");
        const cameraBtn = document.getElementById("toggleCameraBtn");
        if (micBtn) {
            micBtn.classList.remove("muted");
            micBtn.title = "Mute Microphone";
            const micIcon = micBtn.querySelector(".mic-icon");
            const micOffIcon = micBtn.querySelector(".mic-off-icon");
            if (micIcon) micIcon.classList.remove("hidden");
            if (micOffIcon) micOffIcon.classList.add("hidden");
        }
        if (cameraBtn) {
            cameraBtn.classList.remove("muted");
            cameraBtn.title = "Mute Camera";
            const cameraIcon = cameraBtn.querySelector(".camera-icon");
            const cameraOffIcon = cameraBtn.querySelector(".camera-off-icon");
            if (cameraIcon) cameraIcon.classList.remove("hidden");
            if (cameraOffIcon) cameraOffIcon.classList.add("hidden");
        }
        
        videoPlayerEl.innerHTML = '<div class="video-player-placeholder"><div>No video stream - Join as host to view</div></div>';
        statusEl.textContent = "Left host channel";
        controlsEl.classList.add("hidden");
        showPopup("Left host channel successfully");
    } catch (error) {
        showPopup(`Error leaving channel: ${error.message}`);
        statusEl.textContent = `Error: ${error.message}`;
        console.error(error);
    }
}

function setupHostControls() {
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    const toggleCameraBtn = document.getElementById("toggleCameraBtn");
    
    // Remove existing listeners by cloning
    const newMicBtn = toggleMicBtn.cloneNode(true);
    toggleMicBtn.parentNode.replaceChild(newMicBtn, toggleMicBtn);
    const newCameraBtn = toggleCameraBtn.cloneNode(true);
    toggleCameraBtn.parentNode.replaceChild(newCameraBtn, toggleCameraBtn);
    
    // Setup mic toggle
    document.getElementById("toggleMicBtn").addEventListener("click", async () => {
        if (!localAudioTrack) return;
        
        const micBtn = document.getElementById("toggleMicBtn");
        const micIcon = micBtn.querySelector(".mic-icon");
        const micOffIcon = micBtn.querySelector(".mic-off-icon");
        
        try {
            if (micBtn.classList.contains("muted")) {
                // Currently muted, unmute it
                await localAudioTrack.setEnabled(true);
                micBtn.classList.remove("muted");
                micBtn.title = "Mute Microphone";
                micIcon.classList.remove("hidden");
                micOffIcon.classList.add("hidden");
            } else {
                // Currently unmuted, mute it
                await localAudioTrack.setEnabled(false);
                micBtn.classList.add("muted");
                micBtn.title = "Unmute Microphone";
                micIcon.classList.add("hidden");
                micOffIcon.classList.remove("hidden");
            }
        } catch (error) {
            console.error("Failed to toggle microphone:", error);
            showPopup(`Error toggling microphone: ${error.message}`);
        }
    });
    
    // Setup camera toggle
    document.getElementById("toggleCameraBtn").addEventListener("click", async () => {
        if (!localVideoTrack) return;
        
        const cameraBtn = document.getElementById("toggleCameraBtn");
        const cameraIcon = cameraBtn.querySelector(".camera-icon");
        const cameraOffIcon = cameraBtn.querySelector(".camera-off-icon");
        
        try {
            if (cameraBtn.classList.contains("muted")) {
                // Currently muted, unmute it
                await localVideoTrack.setEnabled(true);
                cameraBtn.classList.remove("muted");
                cameraBtn.title = "Mute Camera";
                cameraIcon.classList.remove("hidden");
                cameraOffIcon.classList.add("hidden");
            } else {
                // Currently unmuted, mute it
                await localVideoTrack.setEnabled(false);
                cameraBtn.classList.add("muted");
                cameraBtn.title = "Unmute Camera";
                cameraIcon.classList.add("hidden");
                cameraOffIcon.classList.remove("hidden");
            }
        } catch (error) {
            console.error("Failed to toggle camera:", error);
            showPopup(`Error toggling camera: ${error.message}`);
        }
    });
}

// Track current video subscription for audience
let currentVideoUser = null;
let previousVideoUser = null;
let videoPublishers = new Map(); // Map of UID -> user object
let isManualVideoSelection = false; // Track if user manually selected a video

// Helper function to update video selector dropdown
function updateAudienceVideoSelector() {
    const selector = document.getElementById("audience-video-select");
    const selectorContainer = document.getElementById("audience-video-selector");
    
    if (!selector || !selectorContainer) return;
    
    // Clear existing options except "Auto"
    selector.innerHTML = '<option value="auto">Auto (Most Recent)</option>';
    
    // Add option for each video publisher
    videoPublishers.forEach((user, uid) => {
        const option = document.createElement("option");
        option.value = uid;
        option.textContent = `User ${uid}`;
        selector.appendChild(option);
    });
    
    // Show selector if there are video publishers
    if (videoPublishers.size > 0) {
        selectorContainer.classList.remove("hidden");
    } else {
        selectorContainer.classList.add("hidden");
    }
}

// Helper function to switch video subscription
async function switchAudienceVideo(targetUid) {
    if (!audienceRtcClient) return;
    
    const videoPlayerEl = document.getElementById("audience-video-player");
    
    if (targetUid === "auto") {
        // Switch to auto mode
        isManualVideoSelection = false;
        // Switch to most recent publisher if available
        if (videoPublishers.size > 0) {
            const publishers = Array.from(videoPublishers.values());
            const latestUser = publishers[publishers.length - 1];
            if (latestUser && latestUser.videoTrack) {
                videoPlayerEl.innerHTML = "";
                latestUser.videoTrack.play(videoPlayerEl);
                currentVideoUser = latestUser;
                console.log(`Auto mode: Switched to most recent user ${latestUser.uid}`);
            }
        }
    } else {
        // Manual selection
        isManualVideoSelection = true;
        const targetUser = videoPublishers.get(targetUid);
        
        if (targetUser && targetUser.videoTrack) {
            videoPlayerEl.innerHTML = "";
            targetUser.videoTrack.play(videoPlayerEl);
            previousVideoUser = currentVideoUser;
            currentVideoUser = targetUser;
            console.log(`Manually switched to user ${targetUid}`);
        }
    }
}

async function joinChannelAsAudience() {
    try {
        if (!appid || appid.trim() === "") {
            throw new Error("App ID is required. Please set API credentials first.");
        }
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    const channel = document.getElementById("audience-channel").value;
    const uidInput = document.getElementById("audience-uid").value;
    const uid = uidInput ? parseInt(uidInput) : null;
    const token = document.getElementById("audience-token").value || null;
    
    if (!channel) {
        showPopup("Channel Name is required");
        return;
    }
    
    const videoPlayerEl = document.getElementById("audience-video-player");
    const statusEl = document.getElementById("audience-status");
    
    // Leave existing channel if any
    await leaveAudienceChannel();
    
    // Reset video user tracking
    currentVideoUser = null;
    previousVideoUser = null;
    videoPublishers.clear();
    isManualVideoSelection = false;
    
    // Setup video selector change handler
    const videoSelect = document.getElementById("audience-video-select");
    if (videoSelect) {
        videoSelect.value = "auto";
        videoSelect.onchange = (e) => {
            switchAudienceVideo(e.target.value);
        };
    }
    
    // Create new client
    audienceRtcClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    
    // Set client role to audience
    await audienceRtcClient.setClientRole("audience");
    
    // Join channel
    try {
        const userUid = await audienceRtcClient.join(appid, channel, token, uid);
        statusEl.textContent = `Joined as audience (UID: ${userUid})`;
        showPopup(`Joined channel as audience (UID: ${userUid})`);
        
        // Listen for remote users
        audienceRtcClient.on("user-published", async (user, mediaType) => {
            console.log(`User ${user.uid} published ${mediaType}`);
            
            // Always subscribe to audio from all users
            if (mediaType === "audio") {
                await audienceRtcClient.subscribe(user, mediaType);
                user.audioTrack?.play();
                console.log(`Subscribed to audio from user ${user.uid}`);
            }
            
            // For video: track the publisher and subscribe
            if (mediaType === "video") {
                // Subscribe to the video
                await audienceRtcClient.subscribe(user, mediaType);
                
                // Add to video publishers map
                videoPublishers.set(user.uid.toString(), user);
                updateAudienceVideoSelector();
                
                // Only auto-switch if not in manual selection mode
                if (!isManualVideoSelection) {
                    // Store previous video user before switching
                    if (currentVideoUser && currentVideoUser.uid !== user.uid) {
                        previousVideoUser = currentVideoUser;
                    }
                    
                    // Switch to the new video user (most recent)
                    currentVideoUser = user;
                const remoteVideoTrack = user.videoTrack;
                if (remoteVideoTrack) {
                    videoPlayerEl.innerHTML = "";
                    remoteVideoTrack.play(videoPlayerEl);
                        console.log(`Auto mode: Now displaying video from user ${user.uid}`);
                    }
                } else {
                    console.log(`Manual mode: User ${user.uid} added to list but not auto-switching`);
                }
            }
        });
        
        // Handle user unpublished
        audienceRtcClient.on("user-unpublished", async (user, mediaType) => {
            console.log(`User ${user.uid} unpublished ${mediaType}`);
            
            if (mediaType === "video") {
                // Remove from publishers map
                videoPublishers.delete(user.uid.toString());
                updateAudienceVideoSelector();
                
                if (currentVideoUser && currentVideoUser.uid === user.uid) {
                    // Current video user stopped publishing
                    if (!isManualVideoSelection && previousVideoUser && previousVideoUser.videoTrack) {
                        // Auto mode: switch back to previous user
                        console.log(`Auto mode: Switching back to previous user ${previousVideoUser.uid}`);
                        videoPlayerEl.innerHTML = "";
                        previousVideoUser.videoTrack.play(videoPlayerEl);
                        currentVideoUser = previousVideoUser;
                        previousVideoUser = null;
                    } else if (videoPublishers.size > 0) {
                        // Try to switch to any available publisher
                        const publishers = Array.from(videoPublishers.values());
                        const nextUser = publishers[publishers.length - 1];
                        if (nextUser && nextUser.videoTrack) {
                            console.log(`Switching to available user ${nextUser.uid}`);
                            videoPlayerEl.innerHTML = "";
                            nextUser.videoTrack.play(videoPlayerEl);
                            currentVideoUser = nextUser;
                        }
                    } else {
                        // No other publishers available
            videoPlayerEl.innerHTML = '<div class="video-player-placeholder"><div>No video stream</div></div>';
                        currentVideoUser = null;
                        previousVideoUser = null;
                    }
                }
            }
        });
        
        // Handle user left
        audienceRtcClient.on("user-left", (user) => {
            console.log(`User ${user.uid} left the channel`);
            
            // Remove from publishers map
            videoPublishers.delete(user.uid.toString());
            updateAudienceVideoSelector();
            
            if (currentVideoUser && currentVideoUser.uid === user.uid) {
                currentVideoUser = null;
                
                // Try to switch to another available publisher
                if (videoPublishers.size > 0) {
                    const publishers = Array.from(videoPublishers.values());
                    const nextUser = publishers[publishers.length - 1];
                    if (nextUser && nextUser.videoTrack) {
                        console.log(`User left: Switching to user ${nextUser.uid}`);
                        videoPlayerEl.innerHTML = "";
                        nextUser.videoTrack.play(videoPlayerEl);
                        currentVideoUser = nextUser;
                    }
                } else {
                    videoPlayerEl.innerHTML = '<div class="video-player-placeholder"><div>No video stream</div></div>';
                }
            }
            if (previousVideoUser && previousVideoUser.uid === user.uid) {
                previousVideoUser = null;
            }
        });
    } catch (error) {
        showPopup(`Error joining channel: ${error.message}`);
        statusEl.textContent = `Error: ${error.message}`;
        console.error(error);
        audienceRtcClient = null;
    }
}

async function leaveAudienceChannel() {
    const videoPlayerEl = document.getElementById("audience-video-player");
    const statusEl = document.getElementById("audience-status");
    const selectorContainer = document.getElementById("audience-video-selector");
    
    try {
        // Leave channel
        if (audienceRtcClient) {
            await audienceRtcClient.leave();
            audienceRtcClient = null;
        }
        
        // Reset video user tracking
        currentVideoUser = null;
        previousVideoUser = null;
        videoPublishers.clear();
        isManualVideoSelection = false;
        
        // Hide video selector
        if (selectorContainer) {
            selectorContainer.classList.add("hidden");
        }
        
        videoPlayerEl.innerHTML = '<div class="video-player-placeholder"><div>No video stream - Join as audience to view</div></div>';
        statusEl.textContent = "Left audience channel";
        showPopup("Left audience channel successfully");
    } catch (error) {
        showPopup(`Error leaving channel: ${error.message}`);
        statusEl.textContent = `Error: ${error.message}`;
        console.error(error);
    }
}

// ============================================
// TOKEN GENERATION
// ============================================

async function generateToken(service) {
    try {
        if (!appid || appid.trim() === "") {
            showPopup("App ID is required. Please set API credentials first.");
            return;
        }
        if (!appCertificate || appCertificate.trim() === "") {
            showPopup("App Certificate is required for token generation. Please set it in API Credentials.");
            return;
        }
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    try {

        let channel, uidInput, uid, tokenFieldId, role;

        if (service === "host") {
            // Host token generation
            channel = document.getElementById("host-channel").value;
            uidInput = document.getElementById("host-uid").value;
            const parsedUid = (uidInput && uidInput.toString().trim() !== "") ? parseInt(uidInput) : NaN;
            uid = !isNaN(parsedUid) ? parsedUid : 0;
            tokenFieldId = "host-token";
            role = RtcRole.PUBLISHER;
        } else if (service === "audience") {
            // Audience token generation
            channel = document.getElementById("audience-channel").value;
            uidInput = document.getElementById("audience-uid").value;
            const parsedUid = (uidInput && uidInput.toString().trim() !== "") ? parseInt(uidInput) : NaN;
            uid = !isNaN(parsedUid) ? parsedUid : 0;
            tokenFieldId = "audience-token";
            role = RtcRole.SUBSCRIBER;
        } else {
            // Handle ct-input and ct-output first
            if (service === "ct-input") {
                channel = document.getElementById("ct-input-channel").value;
                uidInput = document.getElementById("ct-input-uid").value;
                const parsedUid = (uidInput && uidInput.toString().trim() !== "") ? parseInt(uidInput) : NaN;
                uid = !isNaN(parsedUid) ? parsedUid : 0;
                tokenFieldId = "ct-input-token";
                role = RtcRole.SUBSCRIBER;
            } else if (service === "ct-output") {
                channel = document.getElementById("ct-output-channel").value || document.getElementById("ct-input-channel").value;
                uidInput = document.getElementById("ct-output-uid").value;
                const parsedUid = (uidInput && uidInput.toString().trim() !== "") ? parseInt(uidInput) : NaN;
                uid = !isNaN(parsedUid) ? parsedUid : 0;
                tokenFieldId = "ct-output-token";
                role = RtcRole.PUBLISHER;
            } else {
                // Service-specific token generation
                const channelMap = {
                    mp: "mp-channel",
                    mps: "mps-channel",
                    mg: "mg-channel",
                    ct: "ct-channel"
                };
                channel = document.getElementById(channelMap[service]).value;
                
                const uidMap = {
                    mp: "mp-uid",
                    mps: "mps-uid",
                    mg: "mg-uid",
                    ct: "ct-uid"
                };
                uidInput = document.getElementById(uidMap[service]).value;
                const parsedUid = (uidInput && uidInput.toString().trim() !== "") ? parseInt(uidInput) : NaN;
                uid = !isNaN(parsedUid) ? parsedUid : 0;

                // Determine role: publisher for Media Push host, subscriber for others
                role = (service === "mps") ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

                const tokenMap = {
                    mp: "mp-token",
                    mps: "mps-token",
                    mg: "mg-token",
                    ct: "ct-token"
                };
                tokenFieldId = tokenMap[service];
            }
        }
        
        if (!channel) {
            showPopup("Channel Name is required");
            return;
        }

        const TOKEN_EXPIRE = 1800; // 30 minutes in seconds
        const PRIVILEGE_EXPIRE = 1800; // 30 minutes in seconds

        const token = await RtcTokenBuilder.buildTokenWithUid(
            appid,
            appCertificate,
            channel,
            uid,
            role,
            TOKEN_EXPIRE,
            PRIVILEGE_EXPIRE
        );

        document.getElementById(tokenFieldId).value = token;
        showPopup("Token generated successfully!");
    } catch (error) {
        showPopup(`Error generating token: ${error.message}`);
        console.error("Token generation error:", error);
    }
}

// ============================================
// ID MANAGEMENT HELPER FUNCTIONS
// ============================================


function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (element && element.value) {
        element.select();
        document.execCommand('copy');
        showPopup("Copied to clipboard!");
    } else {
        showPopup("No ID to copy");
    }
}



// Initialize on load
window.addEventListener("load", () => {
    if (customerId && customerSecret && appid) {
        document.getElementById("customerId").value = customerId;
        document.getElementById("customerSecret").value = customerSecret;
        document.getElementById("appid").value = appid;
        if (appCertificate) {
            document.getElementById("appCertificate").value = appCertificate;
        }
        document.getElementById("region").value = region;
    }
    
    // Load saved OBS WebSocket password
    const savedPassword = localStorage.getItem("obsWebSocketPassword");
    if (savedPassword) {
        const mgPassword = document.getElementById("mg-obs-password");
        const panelPassword = document.getElementById("obs-panel-password");
        if (mgPassword) mgPassword.value = savedPassword;
        if (panelPassword) panelPassword.value = savedPassword;
    }
    
    // Setup Media Gateway template checkbox toggles
    const videoEnabledCheckbox = document.getElementById("mg-tmpl-video-enabled");
    const audioEnabledCheckbox = document.getElementById("mg-tmpl-audio-enabled");
    const videoSettings = document.getElementById("mg-tmpl-video-settings");
    const audioSettings = document.getElementById("mg-tmpl-audio-settings");
    
    if (videoEnabledCheckbox && videoSettings) {
        videoEnabledCheckbox.addEventListener("change", function() {
            videoSettings.style.display = this.checked ? "block" : "none";
        });
    }
    
    if (audioEnabledCheckbox && audioSettings) {
        audioEnabledCheckbox.addEventListener("change", function() {
            audioSettings.style.display = this.checked ? "block" : "none";
        });
        // Initially hide audio settings since it's unchecked by default
        audioSettings.style.display = "none";
    }
});

// ============================================
// COPY JSON FUNCTIONS AND MODAL
// ============================================

function showJSONModal(title, jsonObject) {
    const jsonModal = document.getElementById('jsonDisplayModal');
    const jsonModalTitle = document.getElementById('jsonModalTitle');
    const jsonModalContent = document.getElementById('jsonModalContent');
    
    if (jsonModal && jsonModalTitle && jsonModalContent) {
        jsonModalTitle.textContent = title;
        jsonModalContent.textContent = JSON.stringify(jsonObject, null, 2);
        jsonModal.classList.remove('hidden');
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
    }
}

function copyResponseToClipboard(responseId) {
    const responseEl = document.getElementById(responseId);
    if (responseEl && responseEl.textContent) {
        navigator.clipboard.writeText(responseEl.textContent);
        showPopup("Response copied to clipboard!");
    }
}

// Cloud Transcoding Copy JSON Functions
function copyCTCreateJSON() {
    try {
        const audioInputs = collectAudioInputs();
        const videoInputs = collectVideoInputs();
        const outputs = collectOutputs();
        const streamProcessMode = document.getElementById("ct-stream-mode").value || "mix";
        const idleTimeout = parseInt(document.getElementById("ct-idle-timeout").value) || 300;
        const canvasWidth = parseInt(document.getElementById("ct-canvas-width").value) || 1280;
        const canvasHeight = parseInt(document.getElementById("ct-canvas-height").value) || 720;
        const canvasColor = document.getElementById("ct-canvas-color").value || "0";
        const canvasBgImage = document.getElementById("ct-canvas-bg-image").value || null;
        const canvasFillMode = document.getElementById("ct-canvas-fill-mode").value || "FILL";
        
        const body = {
            services: {
                cloudTranscoder: {
                    serviceType: "cloudTranscoderV2",
                    config: {
                        transcoder: {
                            idleTimeout: idleTimeout
                        }
                    }
                }
            }
        };
        
        if (streamProcessMode !== "mix") {
            body.services.cloudTranscoder.config.transcoder.streamProcessMode = streamProcessMode;
        }
        
        if (audioInputs.length > 0) {
            body.services.cloudTranscoder.config.transcoder.audioInputs = audioInputs;
        }
        
        if (videoInputs.length > 0) {
            body.services.cloudTranscoder.config.transcoder.videoInputs = videoInputs;
        }
        
        body.services.cloudTranscoder.config.transcoder.canvas = {
            width: canvasWidth,
            height: canvasHeight,
            color: parseInt(canvasColor) || 0
        };
        if (canvasBgImage) {
            body.services.cloudTranscoder.config.transcoder.canvas.backgroundImage = canvasBgImage;
            body.services.cloudTranscoder.config.transcoder.canvas.fillMode = canvasFillMode;
        }
        
        // Collect watermarks
        const watermarks = collectWatermarks();
        if (watermarks.length > 0) {
            body.services.cloudTranscoder.config.transcoder.watermarks = watermarks;
        }
        
        body.services.cloudTranscoder.config.transcoder.outputs = outputs;
        
        showJSONModal('Cloud Transcoding Create Task JSON', body);
    } catch (error) {
        showPopup(`Error showing JSON: ${error.message}`);
    }
}

function copyCTUpdateJSON() {
    // Same as create for now (update requires full config)
    copyCTCreateJSON();
}

// Media Pull Copy JSON Functions  
function copyMPStartJSON() {
    try {
        const player = {
            streamUrl: document.getElementById("mp-stream-url").value,
            channelName: document.getElementById("mp-channel").value,
            uid: parseInt(document.getElementById("mp-uid").value) || 666,
            idleTimeout: parseInt(document.getElementById("mp-idle-timeout").value) || 300,
            audioOptions: {
                volume: parseInt(document.getElementById("mp-volume").value) || 100
            }
        };
        
        const token = document.getElementById("mp-token").value;
        if (token) player.token = token;
        
        const body = { player };
        showJSONModal('Media Pull Start JSON', body);
    } catch (error) {
        showPopup(`Error showing JSON: ${error.message}`);
    }
}

function copyMPUpdateJSON() {
    try {
        const player = {
            streamUrl: document.getElementById("mp-stream-url").value,
            audioOptions: {
                volume: parseInt(document.getElementById("mp-volume").value) || 100
            },
            isPause: document.getElementById("mp-is-pause").checked,
            seekPosition: parseInt(document.getElementById("mp-seek-position").value) || 0
        };
        
        const body = { player };
        showJSONModal('Media Pull Update JSON', body);
    } catch (error) {
        showPopup(`Error showing JSON: ${error.message}`);
    }
}

// Media Push Copy JSON Functions
function copyMPushStartJSON() {
    try {
        const mode = document.getElementById("mps-mode").value;
        const channel = document.getElementById("mps-channel").value;
        const name = document.getElementById("mps-name").value;
        const uid = document.getElementById("mps-uid").value || "444";
        const token = document.getElementById("mps-token").value;
        const destination = document.getElementById("mps-destination").value;
        const regionHintIp = document.getElementById("mps-region-hint-ip").value;
        const idleTimeout = document.getElementById("mps-idle-timeout").value;
        const jitterBufferSizeMs = document.getElementById("mps-jitter-buffer").value;
        
        // Build RTMP URL based on destination
        let rtmpUrl = "";
        if (destination === "facebook") {
            const fbUrl = document.getElementById("mps-fb-url").value;
            const fbKey = document.getElementById("mps-fb-key").value;
            if (fbUrl && fbKey) {
                rtmpUrl = fbUrl + "/" + fbKey;
            }
        } else if (destination === "youtube") {
            const ytUrl = document.getElementById("mps-yt-url").value;
            const ytKey = document.getElementById("mps-yt-key").value;
            if (ytUrl && ytKey) {
                rtmpUrl = ytUrl + "/" + ytKey;
            }
        } else if (destination === "custom") {
            const customUrl = document.getElementById("mps-custom-url").value;
            const customKey = document.getElementById("mps-custom-key").value;
            if (customUrl && customKey) {
                rtmpUrl = customUrl + "/" + customKey;
            }
        }
        
        const body = {
            converter: {
                rtmpUrl: rtmpUrl
            }
        };
        
        // Add optional name
        if (name) {
            body.converter.name = name;
        } else {
            body.converter.name = `Converter_${Date.now()}`;
        }
        
        // Add optional fields
        if (idleTimeout) {
            body.converter.idleTimeout = parseInt(idleTimeout);
        }
        if (jitterBufferSizeMs) {
            const jitter = parseInt(jitterBufferSizeMs);
            if (jitter >= 0 && jitter <= 1000) {
                body.converter.jitterBufferSizeMs = jitter;
            }
        }
        
        if (mode === "raw") {
            // Non-transcoded mode (rawOptions)
            body.converter.rawOptions = {
                rtcChannel: channel,
                rtcStreamUid: uid ? parseInt(uid) : 0
            };
            if (token) body.converter.rawOptions.rtcToken = token;
        } else {
            // Transcoded mode (transcodeOptions)
            const canvasWidth = parseInt(document.getElementById("mps-canvas-width").value) || 640;
            const canvasHeight = parseInt(document.getElementById("mps-canvas-height").value) || 360;
            const videoBitrate = parseInt(document.getElementById("mps-video-bitrate").value) || 800;
            const videoFramerate = parseInt(document.getElementById("mps-video-framerate").value) || 15;
            const audioCodecProfile = document.getElementById("mps-audio-codec-profile").value;
            const audioSampleRate = parseInt(document.getElementById("mps-audio-sample-rate").value) || 48000;
            const audioBitrate = parseInt(document.getElementById("mps-audio-bitrate").value) || 48;
            const audioChannels = parseInt(document.getElementById("mps-audio-channels").value) || 1;
            
            body.converter.transcodeOptions = {
                rtcChannel: channel,
                audioOptions: {
                    codecProfile: audioCodecProfile,
                    sampleRate: audioSampleRate,
                    bitrate: audioBitrate,
                    audioChannels: audioChannels
                },
                videoOptions: {
                    canvas: { width: canvasWidth, height: canvasHeight },
                    bitrate: videoBitrate,
                    frameRate: videoFramerate,
                    codec: document.getElementById("mps-video-codec").value,
                    codecProfile: document.getElementById("mps-video-codec-profile").value
                }
            };
            
            if (token) body.converter.transcodeOptions.rtcToken = token;
            
            const audioStreamUids = document.getElementById("mps-audio-stream-uids").value;
            if (audioStreamUids) {
                body.converter.transcodeOptions.audioOptions.rtcStreamUids = audioStreamUids.split(",").map(uid => parseInt(uid.trim())).filter(uid => !isNaN(uid));
            }
            
            const layoutType = parseInt(document.getElementById("mps-layout-type").value) || 0;
            if (layoutType === 1) {
                body.converter.transcodeOptions.videoOptions.layoutType = 1;
                const maxResolutionUid = document.getElementById("mps-vertical-max-uid").value;
                if (maxResolutionUid) {
                    body.converter.transcodeOptions.videoOptions.vertical = {
                        maxResolutionUid: parseInt(maxResolutionUid),
                        fillMode: document.getElementById("mps-vertical-fill-mode").value,
                        refreshIntervalSec: parseInt(document.getElementById("mps-vertical-refresh").value) || 4
                    };
                }
            } else if (uid) {
                body.converter.transcodeOptions.videoOptions.layout = [{
                    rtcStreamUid: parseInt(uid),
                    region: { xPos: 0, yPos: 0, zIndex: 1, width: canvasWidth, height: canvasHeight }
                }];
            }
            
            const placeholderImage = document.getElementById("mps-placeholder-image").value;
            if (placeholderImage) {
                body.converter.transcodeOptions.videoOptions.defaultPlaceholderImageUrl = placeholderImage;
            }
            
            const videoGop = document.getElementById("mps-video-gop").value;
            if (videoGop) {
                body.converter.transcodeOptions.videoOptions.gop = parseInt(videoGop);
            }
            
            const canvasColor = document.getElementById("mps-canvas-color").value;
            if (canvasColor) {
                body.converter.transcodeOptions.videoOptions.canvas.color = parseInt(canvasColor.replace("#", ""), 16) || 0;
            }
        }
        
        showJSONModal('Media Push Start JSON', body);
    } catch (error) {
        showPopup(`Error showing JSON: ${error.message}`);
    }
}

function copyMPushUpdateJSON() {
    try {
        const destination = document.getElementById("mps-destination").value;
        
        // Build RTMP URL based on destination
        let rtmpUrl = "";
        if (destination === "facebook") {
            const fbUrl = document.getElementById("mps-fb-url").value;
            const fbKey = document.getElementById("mps-fb-key").value;
            if (fbUrl && fbKey) {
                rtmpUrl = fbUrl + "/" + fbKey;
            }
        } else if (destination === "youtube") {
            const ytUrl = document.getElementById("mps-yt-url").value;
            const ytKey = document.getElementById("mps-yt-key").value;
            if (ytUrl && ytKey) {
                rtmpUrl = ytUrl + "/" + ytKey;
            }
        } else if (destination === "custom") {
            const customUrl = document.getElementById("mps-custom-url").value;
            const customKey = document.getElementById("mps-custom-key").value;
            if (customUrl && customKey) {
                rtmpUrl = customUrl + "/" + customKey;
            }
        }
        
        // Build update body - only include updateable fields
        const body = {
            converter: {}
        };
        
        const fields = [];
        
        // RTMP URL is always updateable
        if (rtmpUrl) {
            body.converter.rtmpUrl = rtmpUrl;
            fields.push("rtmpUrl");
        }
        
        // Video options are updateable (but not codec/codecProfile)
        const mode = document.getElementById("mps-mode").value;
        if (mode === "transcoded") {
            body.converter.transcodeOptions = {
                videoOptions: {}
            };
            
            const canvasWidth = document.getElementById("mps-canvas-width").value;
            const canvasHeight = document.getElementById("mps-canvas-height").value;
            const canvasColor = document.getElementById("mps-canvas-color").value;
            
            if (canvasWidth || canvasHeight || canvasColor) {
                body.converter.transcodeOptions.videoOptions.canvas = {};
                if (canvasWidth) body.converter.transcodeOptions.videoOptions.canvas.width = parseInt(canvasWidth);
                if (canvasHeight) body.converter.transcodeOptions.videoOptions.canvas.height = parseInt(canvasHeight);
                if (canvasColor) body.converter.transcodeOptions.videoOptions.canvas.color = parseInt(canvasColor.replace("#", ""), 16) || 0;
                fields.push("transcodeOptions.videoOptions.canvas");
            }
            
            const videoBitrate = document.getElementById("mps-video-bitrate").value;
            const videoFramerate = document.getElementById("mps-video-framerate").value;
            const videoGop = document.getElementById("mps-video-gop").value;
            const placeholderImage = document.getElementById("mps-placeholder-image").value;
            
            if (videoBitrate) {
                body.converter.transcodeOptions.videoOptions.bitrate = parseInt(videoBitrate);
                fields.push("transcodeOptions.videoOptions.bitrate");
            }
            if (videoFramerate) {
                body.converter.transcodeOptions.videoOptions.frameRate = parseInt(videoFramerate);
                fields.push("transcodeOptions.videoOptions.frameRate");
            }
            if (videoGop) {
                body.converter.transcodeOptions.videoOptions.gop = parseInt(videoGop);
                fields.push("transcodeOptions.videoOptions.gop");
            }
            if (placeholderImage) {
                body.converter.transcodeOptions.videoOptions.defaultPlaceholderImageUrl = placeholderImage;
                fields.push("transcodeOptions.videoOptions.defaultPlaceholderImageUrl");
            }
            
            // Vertical layout options (only for vertical layout)
            const layoutType = parseInt(document.getElementById("mps-layout-type").value) || 0;
            if (layoutType === 1) {
                const maxResolutionUid = document.getElementById("mps-vertical-max-uid").value;
                if (maxResolutionUid) {
                    body.converter.transcodeOptions.videoOptions.vertical = {
                        maxResolutionUid: parseInt(maxResolutionUid),
                        fillMode: document.getElementById("mps-vertical-fill-mode").value,
                        refreshIntervalSec: parseInt(document.getElementById("mps-vertical-refresh").value) || 4
                    };
                    fields.push("transcodeOptions.videoOptions.vertical");
                }
            }
        }
        
        // Add fields parameter
        if (fields.length > 0) {
            body.fields = fields.join(",");
        }
        
        showJSONModal('Media Push Update JSON', body);
    } catch (error) {
        showPopup(`Error showing JSON: ${error.message}`);
    }
}

// Media Gateway Copy JSON Functions
function copyMGCreateKeyJSON() {
    try {
        const channel = document.getElementById("mg-channel").value;
        const uid = parseInt(document.getElementById("mg-uid").value) || 333;
        const token = document.getElementById("mg-token").value;
        const expiresAfter = parseInt(document.getElementById("mg-expires-after").value) || 0;
        const templateId = document.getElementById("mg-template-id-create").value;
        
        const body = {
            settings: {
                channel: channel,
                uid: uid
            },
            expiresAfter: expiresAfter
        };
        
        if (token) body.settings.token = token;
        if (templateId) body.templateId = templateId;
        
        showJSONModal('Media Gateway Create Stream Key JSON', body);
    } catch (error) {
        showPopup(`Error showing JSON: ${error.message}`);
    }
}

function copyMGCreateTemplateJSON() {
    try {
        const templateId = document.getElementById("mg-template-id").value;
        
        const body = {};
        
        // Video transcoding
        const videoEnabled = document.getElementById("mg-tmpl-video-enabled").checked;
        if (videoEnabled) {
            body.video = {
                codec: document.getElementById("mg-tmpl-video-codec").value || "h264",
                width: parseInt(document.getElementById("mg-tmpl-video-width").value) || 1280,
                height: parseInt(document.getElementById("mg-tmpl-video-height").value) || 720,
                framerate: parseInt(document.getElementById("mg-tmpl-video-framerate").value) || 30,
                bitrate: parseInt(document.getElementById("mg-tmpl-video-bitrate").value) || 2000,
                gop: parseInt(document.getElementById("mg-tmpl-video-gop").value) || 60
            };
        }
        
        // Audio transcoding
        const audioEnabled = document.getElementById("mg-tmpl-audio-enabled").checked;
        if (audioEnabled) {
            body.audio = {
                codec: document.getElementById("mg-tmpl-audio-codec").value || "opus",
                sampleRate: parseInt(document.getElementById("mg-tmpl-audio-sample-rate").value) || 48000,
                channels: parseInt(document.getElementById("mg-tmpl-audio-channels").value) || 2,
                bitrate: parseInt(document.getElementById("mg-tmpl-audio-bitrate").value) || 128
            };
        }
        
        // Jitter buffer
        const jitterEnabled = document.getElementById("mg-tmpl-jitter-enabled").checked;
        if (jitterEnabled) {
            body.jitterBuffer = {
                minDelay: parseInt(document.getElementById("mg-tmpl-jitter-min").value) || 0,
                maxDelay: parseInt(document.getElementById("mg-tmpl-jitter-max").value) || 800
            };
        }
        
        showJSONModal('Media Gateway Create Template JSON', body);
    } catch (error) {
        showPopup(`Error showing JSON: ${error.message}`);
    }
}

function copyMGUpdateTemplateJSON() {
    // Same as create for templates
    copyMGCreateTemplateJSON();
}

// Function to close JSON modal and restore body scroll
function closeJSONModal() {
    const jsonModal = document.getElementById('jsonDisplayModal');
    if (jsonModal) {
        jsonModal.classList.add('hidden');
        // Restore body scroll when modal is closed
        document.body.style.overflow = '';
    }
}

// JSON Modal event handlers
document.addEventListener('DOMContentLoaded', function() {
    const jsonModal = document.getElementById('jsonDisplayModal');
    const closeJsonModal = document.getElementById('closeJsonModal');
    const closeJsonModalBtn = document.getElementById('closeJsonModalBtn');
    const copyJsonFromModal = document.getElementById('copyJsonFromModal');
    
    // Close modal when clicking the X button
    if (closeJsonModal) {
        closeJsonModal.addEventListener('click', function() {
            closeJSONModal();
        });
    }
    
    // Close modal when clicking the Close button
    if (closeJsonModalBtn) {
        closeJsonModalBtn.addEventListener('click', function() {
            closeJSONModal();
        });
    }
    
    // Copy JSON from modal
    if (copyJsonFromModal) {
        copyJsonFromModal.addEventListener('click', function() {
            const jsonContent = document.getElementById('jsonModalContent');
            if (jsonContent) {
                navigator.clipboard.writeText(jsonContent.textContent);
                showPopup("JSON copied to clipboard!");
            }
        });
    }
    
    // Close modal when clicking outside
    if (jsonModal) {
        jsonModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeJSONModal();
            }
        });
    }
});

