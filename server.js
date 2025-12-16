// Simple Express server to proxy Agora API requests and handle CORS
// Run: npm install express cors
// Then: node server.js

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 8000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());
app.use(express.text({ type: '*/*' }));

// Proxy endpoint for Agora API requests
app.all('/api/proxy/*', async (req, res) => {
    try {
        // Extract the target path: /api/proxy/v1/projects/... -> /v1/projects/...
        const targetPath = req.path.replace('/api/proxy', '');
        const targetUrl = `https://api.agora.io${targetPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
        
        console.log(`Proxying ${req.method} ${targetUrl}`);
        
        // Forward headers (except host and content-length)
        const headers = {};
        Object.keys(req.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (lowerKey !== 'host' && lowerKey !== 'content-length' && lowerKey !== 'connection') {
                headers[key] = req.headers[key];
            }
        });
        
        // Make request to Agora API
        const url = new URL(targetUrl);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: req.method,
            headers: headers
        };
        
        const proxyReq = https.request(options, (proxyRes) => {
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            
            // Forward status and headers
            res.status(proxyRes.statusCode);
            proxyRes.headers['content-type'] && res.setHeader('Content-Type', proxyRes.headers['content-type']);
            
            // Pipe response
            proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (error) => {
            console.error('Proxy request error:', error);
            res.status(500).json({ error: error.message });
        });
        
        // Forward request body
        if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
            const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            proxyReq.write(bodyData);
        }
        
        proxyReq.end();
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static files
app.use(express.static(__dirname));

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n✅ Server running at http://localhost:${PORT}`);
    console.log('📡 This server proxies Agora API requests to avoid CORS issues.');
    console.log('🔗 API requests will be automatically proxied through /api/proxy/*\n');
});

