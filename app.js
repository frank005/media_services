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

// Media Gateway streaming key
let mediaGatewayStreamKey = null;

// Cloud Transcoding task ID
let transcodingTaskId = null;

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

// Media Push destination change handler
document.getElementById("mps-destination").addEventListener("change", (e) => {
    const dest = e.target.value;
    document.getElementById("mps-custom-config").classList.toggle("hidden", dest !== "custom");
    document.getElementById("mps-facebook-config").classList.toggle("hidden", dest !== "facebook");
    document.getElementById("mps-youtube-config").classList.toggle("hidden", dest !== "youtube");
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
            name: `Player_${Date.now()}`
        }
    };
    
    if (uid) body.player.uid = parseInt(uid) || 0;
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
        
        const response = await fetch(url, {
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
        
        const response = await fetch(url, {
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
    const channel = document.getElementById("mp-channel").value;
    const uid = document.getElementById("mp-uid").value;
    const token = document.getElementById("mp-token").value;
    
    if (!url || !channel) {
        showPopup("URL and Channel Name are required");
        return;
    }
    
    const responseEl = document.getElementById("mp-response");
    responseEl.textContent = "Updating Media Pull...";
    
    const body = {
        player: {
            streamUrl: url,
            channelName: channel
        }
    };
    
    if (uid) body.player.uid = parseInt(uid) || 0;
    if (token) body.player.token = token;
    
    try {
        const region = localStorage.getItem("region") || "na";
        const appid = localStorage.getItem("appid") || "";
        const response = await fetch(`https://api.agora.io/${region}/v1/projects/${appid}/cloud-player/players/${idInput}`, {
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
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
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
        const response = await fetch(`https://api.agora.io/${region}/v1/projects/${appid}/cloud-player/players/${id}`, {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        const result = response.status === 204 ? {} : await response.json();
        responseEl.textContent = response.status === 204 ? "Media Pull deleted successfully (204 No Content)" : JSON.stringify(result, null, 2);
        showPopup("Media Pull deleted successfully!");
        listMediaPulls(); // Refresh list
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
    
    const joinMethod = document.getElementById("mps-join-method").value;
    const channel = document.getElementById("mps-channel").value;
    const uid = document.getElementById("mps-uid").value;
    const token = document.getElementById("mps-token").value;
    const destination = document.getElementById("mps-destination").value;
    
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
    
    // Use rawOptions for non-transcoded streaming (single host)
    const body = {
        converter: {
            name: `Converter_${Date.now()}`,
            rawOptions: {
                rtcChannel: channel,
                rtcStreamUid: uid ? parseInt(uid) : 0
            },
            rtmpUrl: rtmpUrl
        }
    };
    
    if (token) body.converter.rawOptions.rtcToken = token;
    
    try {
        const response = await fetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtmp-converters`, {
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
            document.getElementById("mps-converter-id").value = pushResult.converter.id;
            document.getElementById("mps-converter-info").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Converter ID: ${pushResult.converter.id}</p>
                    <p class="text-sm text-gray-400">Status: ${pushResult.converter.state || "connecting"}</p>
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
    const responseEl = document.getElementById("mps-response");
    const channel = document.getElementById("mps-channel").value;
    
    // Build URL - either all converters or channel-specific
    let url = `https://api.agora.io/v1/projects/${appid}/rtmp-converters`;
    if (channel) {
        // Option to query by channel
        const queryByChannel = confirm(`Query converters for channel "${channel}"? (Click OK for channel-specific, Cancel for all converters)`);
        if (queryByChannel) {
            url = `https://api.agora.io/v1/projects/${appid}/channels/${encodeURIComponent(channel)}/rtmp-converters`;
        }
    }
    
    responseEl.textContent = "Listing Media Push converters...";
    
    try {
        const response = await fetch(url, {
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
        
        // Display list
        const infoEl = document.getElementById("mps-converter-info");
        if (result.converters && result.converters.length > 0) {
            infoEl.innerHTML = `
                <div class="space-y-2">
                    <p class="text-sm font-semibold">Found ${result.converters.length} converter(s)</p>
                    ${result.converters.map(converter => `
                        <div class="modern-panel p-2">
                            <p class="font-semibold">Converter ID: ${converter.id || converter.converterId}</p>
                            <p class="text-sm text-gray-400">Status: ${converter.state || "Unknown"}</p>
                            <p class="text-sm text-gray-400">Channel: ${converter.rtcChannel || converter.channelName || "N/A"}</p>
                            <p class="text-sm text-gray-400">Name: ${converter.name || "N/A"}</p>
                            <button onclick="document.getElementById('mps-converter-id').value='${converter.id || converter.converterId}'; showPopup('Converter ID set!')" class="modern-btn modern-btn-secondary mt-2 text-xs">Use This ID</button>
                        </div>
                    `).join("")}
                    ${result.cursor && result.cursor !== "0" ? `<p class="text-xs text-gray-500 mt-2">Note: More results available (cursor: ${result.cursor}). Pagination not yet implemented.</p>` : ""}
                </div>
            `;
            showPopup(`Found ${result.converters.length} converter(s)`);
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

async function updateMediaPush() {
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
    
    try {
        const response = await fetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtmp-converters/${mediaPushConverterId}?sequence=${mediaPushUpdateSequence}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            },
            body: JSON.stringify({
                converter: {
                    rtmpUrl: rtmpUrl
                }
            })
        });
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        mediaPushUpdateSequence++;
        showPopup("Media Push updated successfully!");
    } catch (error) {
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
        const response = await fetch(`https://api.agora.io/${region}/v1/projects/${appid}/rtmp-converters/${mediaPushConverterId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeaders()
            }
        });
        const result = response.status === 204 ? {} : await response.json();
        responseEl.textContent = response.status === 204 ? "Media Push deleted successfully (204 No Content)" : JSON.stringify(result, null, 2);
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

async function connectOBS() {
    const password = document.getElementById("mg-obs-password").value;
    const port = document.getElementById("mg-obs-port").value || 4455;
    
    if (!password) {
        showPopup("OBS WebSocket Password is required");
        return;
    }
    
    const statusEl = document.getElementById("mg-obs-status");
    statusEl.textContent = "Connecting to OBS...";
    
    try {
        // Using OBS WebSocket 5.x protocol
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        
        ws.onopen = () => {
            // Authenticate
            ws.send(JSON.stringify({
                op: 1,
                d: {
                    rpcVersion: 1,
                    authentication: password
                }
            }));
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.op === 2) { // Hello
                statusEl.innerHTML = '<span class="text-green-400">✓ Identified to OBS</span>';
            } else if (data.op === 5) { // Event
                if (data.d && data.d.eventType === "ConnectionOpened") {
                    statusEl.innerHTML = '<span class="text-green-400">✓ Connected to OBS</span>';
                    obsWebSocket = ws;
                    showPopup("Connected to OBS successfully!");
                }
            }
        };
        
        ws.onerror = (error) => {
            statusEl.innerHTML = '<span class="text-red-400">✗ Connection failed</span>';
            showPopup("Failed to connect to OBS. Make sure OBS is running and WebSocket server is enabled.");
        };
        
        ws.onclose = () => {
            obsWebSocket = null;
            statusEl.innerHTML = '<span class="text-gray-400">Disconnected</span>';
        };
    } catch (error) {
        statusEl.innerHTML = '<span class="text-red-400">✗ Error: ' + error.message + '</span>';
        showPopup(`Error: ${error.message}`);
    }
}

function disconnectOBS() {
    if (obsWebSocket) {
        obsWebSocket.close();
        obsWebSocket = null;
        document.getElementById("mg-obs-status").innerHTML = '<span class="text-gray-400">Disconnected</span>';
        showPopup("Disconnected from OBS");
    }
}

async function startMediaGateway() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    const channel = document.getElementById("mg-channel").value;
    const uid = document.getElementById("mg-uid").value || "0";
    const token = document.getElementById("mg-token").value;
    
    if (!channel) {
        showPopup("Channel Name is required");
        return;
    }
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = "Creating Media Gateway streaming key...";
    
    const body = {
        streamKey: {
            channelName: channel,
            uid: uid
        }
    };
    
    if (token) body.streamKey.token = token;
    
    try {
        // Media Gateway requires region in the path
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/streamkeys`, {
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
        const gatewayResult = await response.json();
        responseEl.textContent = JSON.stringify(gatewayResult, null, 2);
        
        if (gatewayResult.streamKey && gatewayResult.streamKey.key) {
            mediaGatewayStreamKey = gatewayResult.streamKey.key;
            document.getElementById("mg-stream-key").value = gatewayResult.streamKey.key;
            document.getElementById("mg-status").innerHTML = `
                <div class="modern-panel p-2">
                    <p class="font-semibold">Stream Key: ${gatewayResult.streamKey.key}</p>
                    <p class="text-sm text-gray-400">Channel: ${gatewayResult.streamKey.channelName}</p>
                    <p class="text-sm text-gray-400">UID: ${gatewayResult.streamKey.uid}</p>
                    <p class="text-xs text-gray-500 mt-2">Use this in OBS: Server: rtmp://rtmp.agora.io/live, Key: ${gatewayResult.streamKey.key}</p>
                </div>
            `;
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
        // Media Gateway requires region in the path for DELETE
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/streamkeys/${encodeURIComponent(streamKey)}`, {
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
        const result = response.status === 204 ? {} : await response.json();
        responseEl.textContent = response.status === 204 ? "Media Gateway stopped successfully (204 No Content)" : JSON.stringify(result, null, 2);
        mediaGatewayStreamKey = null;
        document.getElementById("mg-stream-key").value = "";
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
        // Media Gateway requires region in the path
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/streamkeys/${encodeURIComponent(keyInput)}`, {
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
        // Media Gateway requires region in the path
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/streamkeys/${encodeURIComponent(keyInput)}`, {
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
        
        const result = response.status === 204 ? {} : await response.json();
        responseEl.textContent = response.status === 204 ? "Stream key destroyed successfully (204 No Content)" : JSON.stringify(result, null, 2);
        
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
    
    // Default template settings - user can customize these
    const body = {
        settings: {
            transcoding: {
                video: {
                    enabled: true,
                    codec: "H.264",
                    width: 1280,
                    height: 720,
                    fps: 24,
                    bitrate: 2200,
                    simulcastStream: {
                        width: 960,
                        height: 540,
                        fps: 24,
                        bitrate: 1670
                    }
                },
                audio: {
                    enabled: false,
                    profile: 3
                }
            },
            jitterBuffer: {
                size: 500,
                maxSize: 800
            }
        }
    };
    
    try {
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}`, {
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
    
    // Update with modified settings - user can customize
    const body = {
        settings: {
            transcoding: {
                video: {
                    enabled: true,
                    codec: "H.264",
                    width: 1920,
                    height: 1080,
                    fps: 30,
                    bitrate: 3000
                },
                audio: {
                    enabled: true,
                    profile: 3
                }
            }
        }
    };
    
    try {
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}`, {
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
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}`, {
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
        
        const result = response.status === 204 ? {} : await response.json();
        responseEl.textContent = response.status === 204 ? "Template deleted successfully (204 No Content)" : JSON.stringify(result, null, 2);
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
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/stream-templates/${encodeURIComponent(templateId)}/global`, {
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
        const response = await fetch(`https://api.sd-rtn.com/${region}/api/v1/projects/${appid}/rtls/ingress/streams`, {
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
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/streams/${encodeURIComponent(streamId)}`, {
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
        const response = await fetch(`https://api.agora.io/${region}/api/v1/projects/${appid}/rtls/ingress/streams/${encodeURIComponent(streamId)}/disconnect`, {
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
    
    const muteAction = confirm("Click OK to mute, Cancel to unmute");
    const action = muteAction ? "mute" : "unmute";
    
    const responseEl = document.getElementById("mg-response");
    responseEl.textContent = `${action === "mute" ? "Muting" : "Unmuting"} stream...`;
    
    const body = {
        mute: muteAction
    };
    
    try {
        const response = await fetch(`https://api.sd-rtn.com/${region}/api/v1/projects/${appid}/rtls/ingress/streams/${encodeURIComponent(streamId)}/mute`, {
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
        showPopup(`Stream ${action}d successfully!`);
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

// ============================================
// CLOUD TRANSCODING
// ============================================

let transcodingBuilderToken = null;

async function acquireTranscoding() {
    try {
        validateCredentials();
    } catch (error) {
        showPopup(error.message);
        return;
    }
    
    // Get instanceId (optional, but recommended)
    const instanceId = document.getElementById("ct-instance-id").value || `instance_${Date.now()}`;
    
    // Build the same config structure as Create (but without outputs for Acquire)
    const inputChannel = document.getElementById("ct-input-channel").value;
    const inputUid = document.getElementById("ct-input-uid").value || "0";
    const inputToken = document.getElementById("ct-input-token").value;
    
    if (!inputChannel) {
        showPopup("Input Channel is required for Acquire");
        return;
    }
    
    const streamProcessMode = document.getElementById("ct-stream-mode").value || null;
    const idleTimeout = parseInt(document.getElementById("ct-idle-timeout").value) || 300;
    const canvasWidth = parseInt(document.getElementById("ct-canvas-width").value) || 1280;
    const canvasHeight = parseInt(document.getElementById("ct-canvas-height").value) || 720;
    const canvasColor = document.getElementById("ct-canvas-color").value || "0";
    const canvasBgImage = document.getElementById("ct-canvas-bg-image").value || null;
    const canvasFillMode = document.getElementById("ct-canvas-fill-mode").value || "FILL";
    const placeholderImageUrl = document.getElementById("ct-placeholder-image").value || null;
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Acquiring builder token...";
    
    // Build request body - same structure as Create but for Acquire
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
    
    // Audio inputs
    const audioRtc = {
        rtcChannel: inputChannel,
        rtcUid: parseInt(inputUid) || 0
    };
    if (inputToken) audioRtc.rtcToken = inputToken;
    body.services.cloudTranscoder.config.transcoder.audioInputs = [{
        rtc: audioRtc
    }];
    
    // Video inputs
    const videoRtc = {
        rtcChannel: inputChannel,
        rtcUid: parseInt(inputUid) || 0
    };
    if (inputToken) videoRtc.rtcToken = inputToken;
    const videoInput = {
        rtc: videoRtc,
        region: {
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            zOrder: 2
        }
    };
    if (placeholderImageUrl) {
        videoInput.placeholderImageUrl = placeholderImageUrl;
    }
    body.services.cloudTranscoder.config.transcoder.videoInputs = [videoInput];
    
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
    
    // Watermarks (empty for now)
    body.services.cloudTranscoder.config.transcoder.watermarks = [];
    
    try {
        const response = await fetch(`https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/builderTokens`, {
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
            document.getElementById("ct-builder-token").value = result.tokenName;
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
    
    // Get basic inputs
    const inputChannel = document.getElementById("ct-input-channel").value;
    const inputUid = document.getElementById("ct-input-uid").value || "0";
    const inputToken = document.getElementById("ct-input-token").value;
    const outputChannel = document.getElementById("ct-output-channel").value || inputChannel;
    const outputUid = document.getElementById("ct-output-uid").value || "999";
    const outputToken = document.getElementById("ct-output-token").value || inputToken;
    
    if (!inputChannel) {
        showPopup("Input Channel Name is required");
        return;
    }
    if (!outputChannel) {
        showPopup("Output Channel Name is required");
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
    
    // Get video option settings
    const videoWidth = parseInt(document.getElementById("ct-video-width").value) || 1280;
    const videoHeight = parseInt(document.getElementById("ct-video-height").value) || 720;
    const videoBitrate = parseInt(document.getElementById("ct-video-bitrate").value) || 2200;
    const videoFps = parseInt(document.getElementById("ct-video-fps").value) || 30;
    const videoCodec = document.getElementById("ct-video-codec").value || "H264";
    const videoMode = document.getElementById("ct-video-mode").value || null;
    
    // Get audio option settings
    const audioProfile = document.getElementById("ct-audio-profile").value || "AUDIO_PROFILE_DEFAULT";
    
    // Get placeholder image
    const placeholderImageUrl = document.getElementById("ct-placeholder-image").value || null;
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Creating transcoding task...";
    
    // Build the full request body according to API spec
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
    
    // Build audio inputs
    const audioRtc = {
        rtcChannel: inputChannel,
        rtcUid: parseInt(inputUid) || 0
    };
    if (inputToken) audioRtc.rtcToken = inputToken;
    body.services.cloudTranscoder.config.transcoder.audioInputs = [{
        rtc: audioRtc
    }];
    
    // Build video inputs
    const videoRtc = {
        rtcChannel: inputChannel,
        rtcUid: parseInt(inputUid) || 0
    };
    if (inputToken) videoRtc.rtcToken = inputToken;
    const videoInput = {
        rtc: videoRtc,
        region: {
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            zOrder: 2
        }
    };
    if (placeholderImageUrl) {
        videoInput.placeholderImageUrl = placeholderImageUrl;
    }
    body.services.cloudTranscoder.config.transcoder.videoInputs = [videoInput];
    
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
    
    // Build watermarks (empty array for now, can be added via UI later)
    body.services.cloudTranscoder.config.transcoder.watermarks = [];
    
    // Build outputs
    const outputRtc = {
        rtcChannel: outputChannel,
        rtcUid: parseInt(outputUid) || 999
    };
    if (outputToken) outputRtc.rtcToken = outputToken;
    const output = {
        rtc: outputRtc,
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
    body.services.cloudTranscoder.config.transcoder.outputs = [output];
    
    try {
        const url = `https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/tasks?builderToken=${encodeURIComponent(builderToken)}`;
        console.log("Creating transcoding task:", url);
        console.log("Request body:", JSON.stringify(body, null, 2));
        
        const response = await fetch(url, {
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
        const response = await fetch(`https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/tasks/${taskIdInput}?builderToken=${encodeURIComponent(builderToken)}`, {
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
    
    // Get current values and rebuild the full config (Update requires all fields)
    const inputChannel = document.getElementById("ct-input-channel").value;
    const inputUid = document.getElementById("ct-input-uid").value || "0";
    const inputToken = document.getElementById("ct-input-token").value;
    const outputChannel = document.getElementById("ct-output-channel").value || inputChannel;
    const outputUid = document.getElementById("ct-output-uid").value || "999";
    const outputToken = document.getElementById("ct-output-token").value || inputToken;
    
    if (!inputChannel || !outputChannel) {
        showPopup("Input and Output Channel are required for Update");
        return;
    }
    
    const streamProcessMode = document.getElementById("ct-stream-mode").value || null;
    const idleTimeout = parseInt(document.getElementById("ct-idle-timeout").value) || 300;
    const canvasWidth = parseInt(document.getElementById("ct-canvas-width").value) || 1280;
    const canvasHeight = parseInt(document.getElementById("ct-canvas-height").value) || 720;
    const canvasColor = document.getElementById("ct-canvas-color").value || "0";
    const canvasBgImage = document.getElementById("ct-canvas-bg-image").value || null;
    const canvasFillMode = document.getElementById("ct-canvas-fill-mode").value || "FILL";
    const placeholderImageUrl = document.getElementById("ct-placeholder-image").value || null;
    const videoWidth = parseInt(document.getElementById("ct-video-width").value) || 1280;
    const videoHeight = parseInt(document.getElementById("ct-video-height").value) || 720;
    const videoBitrate = parseInt(document.getElementById("ct-video-bitrate").value) || 2200;
    const videoFps = parseInt(document.getElementById("ct-video-fps").value) || 30;
    const videoCodec = document.getElementById("ct-video-codec").value || "H264";
    const videoMode = document.getElementById("ct-video-mode").value || null;
    const audioProfile = document.getElementById("ct-audio-profile").value || "AUDIO_PROFILE_DEFAULT";
    
    const responseEl = document.getElementById("ct-response");
    responseEl.textContent = "Updating transcoding task...";
    
    // Build full config (Update requires all fields from Create)
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
    
    const audioRtc = {
        rtcChannel: inputChannel,
        rtcUid: parseInt(inputUid) || 0
    };
    if (inputToken) audioRtc.rtcToken = inputToken;
    body.services.cloudTranscoder.config.transcoder.audioInputs = [{
        rtc: audioRtc
    }];
    
    const videoRtc = {
        rtcChannel: inputChannel,
        rtcUid: parseInt(inputUid) || 0
    };
    if (inputToken) videoRtc.rtcToken = inputToken;
    const videoInput = {
        rtc: videoRtc,
        region: {
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            zOrder: 2
        }
    };
    if (placeholderImageUrl) {
        videoInput.placeholderImageUrl = placeholderImageUrl;
    }
    body.services.cloudTranscoder.config.transcoder.videoInputs = [videoInput];
    
    body.services.cloudTranscoder.config.transcoder.canvas = {
        width: canvasWidth,
        height: canvasHeight,
        color: parseInt(canvasColor) || 0
    };
    if (canvasBgImage) {
        body.services.cloudTranscoder.config.transcoder.canvas.backgroundImage = canvasBgImage;
        body.services.cloudTranscoder.config.transcoder.canvas.fillMode = canvasFillMode;
    }
    
    body.services.cloudTranscoder.config.transcoder.watermarks = [];
    
    const outputRtc = {
        rtcChannel: outputChannel,
        rtcUid: parseInt(outputUid) || 999
    };
    if (outputToken) outputRtc.rtcToken = outputToken;
    const output = {
        rtc: outputRtc,
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
    body.services.cloudTranscoder.config.transcoder.outputs = [output];
    
    try {
        const url = `https://api.sd-rtn.com/v1/projects/${appid}/rtsc/cloud-transcoder/tasks/${idInput}?builderToken=${encodeURIComponent(builderToken)}&sequenceId=${sequenceId}&updateMask=${encodeURIComponent(updateMask)}`;
        const response = await fetch(url, {
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
        const response = await fetch(url, {
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
        
        const result = await response.json();
        responseEl.textContent = JSON.stringify(result, null, 2);
        transcodingTaskId = null;
        transcodingSequenceId = 0;
        document.getElementById("ct-info").innerHTML = '<p class="text-sm text-gray-400">Transcoding information will appear here</p>';
        showPopup("Transcoding task destroyed successfully!");
    } catch (error) {
        responseEl.textContent = `Error: ${error.message}`;
        showPopup(`Error: ${error.message}`);
    }
}

async function createTemplate() {
    showPopup("Template functionality is not available via REST API. Use the web console instead.");
    document.getElementById("ct-response").textContent = "Info: Template management is done via the Agora Console, not REST API.";
}

async function queryTemplates() {
    showPopup("Template functionality is not available via REST API. Use the web console instead.");
    document.getElementById("ct-response").textContent = "Info: Template management is done via the Agora Console, not REST API.";
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
    const micIcon = document.getElementById("mic-icon");
    const micText = document.getElementById("mic-text");
    const cameraIcon = document.getElementById("camera-icon");
    const cameraText = document.getElementById("camera-text");
    
    // Remove existing listeners
    const newMicBtn = toggleMicBtn.cloneNode(true);
    toggleMicBtn.parentNode.replaceChild(newMicBtn, toggleMicBtn);
    const newCameraBtn = toggleCameraBtn.cloneNode(true);
    toggleCameraBtn.parentNode.replaceChild(newCameraBtn, toggleCameraBtn);
    
    // Setup mic toggle
    document.getElementById("toggleMicBtn").addEventListener("click", async () => {
        if (!localAudioTrack) return;
        
        try {
            const isEnabled = localAudioTrack.isEnabled;
            await localAudioTrack.setEnabled(!isEnabled);
            const micIconEl = document.getElementById("mic-icon");
            const micTextEl = document.getElementById("mic-text");
            if (isEnabled) {
                // Was enabled, now muted
                micIconEl.textContent = "🔇";
                micTextEl.textContent = "Unmute Mic";
            } else {
                // Was muted, now enabled
                micIconEl.textContent = "🎤";
                micTextEl.textContent = "Mute Mic";
            }
        } catch (error) {
            console.error("Failed to toggle microphone:", error);
            showPopup(`Error toggling microphone: ${error.message}`);
        }
    });
    
    // Setup camera toggle
    document.getElementById("toggleCameraBtn").addEventListener("click", async () => {
        if (!localVideoTrack) return;
        
        try {
            const isEnabled = localVideoTrack.isEnabled;
            await localVideoTrack.setEnabled(!isEnabled);
            const cameraIconEl = document.getElementById("camera-icon");
            const cameraTextEl = document.getElementById("camera-text");
            if (isEnabled) {
                // Was enabled, now muted
                cameraIconEl.textContent = "📵";
                cameraTextEl.textContent = "Unmute Camera";
            } else {
                // Was muted, now enabled
                cameraIconEl.textContent = "📹";
                cameraTextEl.textContent = "Mute Camera";
            }
        } catch (error) {
            console.error("Failed to toggle camera:", error);
            showPopup(`Error toggling camera: ${error.message}`);
        }
    });
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
            if (mediaType === "video") {
                await audienceRtcClient.subscribe(user, mediaType);
                const remoteVideoTrack = user.videoTrack;
                if (remoteVideoTrack) {
                    videoPlayerEl.innerHTML = "";
                    remoteVideoTrack.play(videoPlayerEl);
                }
            }
            if (mediaType === "audio") {
                await audienceRtcClient.subscribe(user, mediaType);
                user.audioTrack?.play();
            }
        });
        
        audienceRtcClient.on("user-unpublished", (user) => {
            videoPlayerEl.innerHTML = '<div class="video-player-placeholder"><div>No video stream</div></div>';
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
    
    try {
        // Leave channel
        if (audienceRtcClient) {
            await audienceRtcClient.leave();
            audienceRtcClient = null;
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
            uid = uidInput ? parseInt(uidInput) : Math.floor(Math.random() * 1000000);
            tokenFieldId = "host-token";
            role = RtcRole.PUBLISHER;
        } else if (service === "audience") {
            // Audience token generation
            channel = document.getElementById("audience-channel").value;
            uidInput = document.getElementById("audience-uid").value;
            uid = uidInput ? parseInt(uidInput) : Math.floor(Math.random() * 1000000);
            tokenFieldId = "audience-token";
            role = RtcRole.SUBSCRIBER;
        } else {
            // Handle ct-input and ct-output first
            if (service === "ct-input") {
                channel = document.getElementById("ct-input-channel").value;
                uidInput = document.getElementById("ct-input-uid").value;
                uid = uidInput ? parseInt(uidInput) : 0;
                tokenFieldId = "ct-input-token";
                role = RtcRole.SUBSCRIBER;
            } else if (service === "ct-output") {
                channel = document.getElementById("ct-output-channel").value || document.getElementById("ct-input-channel").value;
                uidInput = document.getElementById("ct-output-uid").value;
                uid = uidInput ? parseInt(uidInput) : 999;
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
                uid = uidInput ? parseInt(uidInput) : Math.floor(Math.random() * 1000000);

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
});

