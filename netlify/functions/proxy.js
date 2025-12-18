exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('📋 OPTIONS preflight request');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  try {
    // Parse the path: /.netlify/functions/proxy/{base}/{path}
    // Example: /.netlify/functions/proxy/api.agora.io/na/v1/projects/...
    const pathParts = event.path.replace('/.netlify/functions/proxy', '').split('/').filter(Boolean);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 INCOMING REQUEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Method: ${event.httpMethod}`);
    console.log(`Path: ${event.path}`);
    console.log(`Query Params:`, JSON.stringify(event.queryStringParameters, null, 2));
    
    if (pathParts.length < 2) {
      console.log('❌ Invalid path - too few parts');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid proxy path. Expected format: /proxy/{base}/{path}' }),
      };
    }

    // First part is the base domain (api.agora.io or api.sd-rtn.com)
    const base = pathParts[0];
    // Rest is the path
    const apiPath = '/' + pathParts.slice(1).join('/');
    
    // Build the full URL
    const queryParams = event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0
      ? new URLSearchParams(event.queryStringParameters).toString()
      : '';
    const targetUrl = `https://${base}${apiPath}${queryParams ? '?' + queryParams : ''}`;

    console.log('\n🎯 TARGET URL:');
    console.log(targetUrl);

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
    };

    // Forward Authorization header if present
    if (event.headers.authorization || event.headers.Authorization) {
      const authHeader = event.headers.authorization || event.headers.Authorization;
      headers['Authorization'] = authHeader;
      console.log('\n🔐 AUTHORIZATION:');
      console.log(authHeader.substring(0, 30) + '...');
    } else {
      console.log('\n⚠️  No Authorization header found');
    }

    // Prepare fetch options
    const fetchOptions = {
      method: event.httpMethod,
      headers: headers,
    };

    // Add body for non-GET requests
    if (event.body && event.httpMethod !== 'GET') {
      fetchOptions.body = event.body;
      console.log('\n📦 REQUEST BODY:');
      try {
        const parsedBody = JSON.parse(event.body);
        console.log(JSON.stringify(parsedBody, null, 2));
      } catch {
        console.log(event.body);
      }
    }

    console.log('\n🚀 Making request to Agora...');
    
    // Make the request
    const response = await fetch(targetUrl, fetchOptions);
    
    console.log(`\n📬 RESPONSE STATUS: ${response.status} ${response.statusText}`);
    
    // Get response body
    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
      console.log('\n📄 RESPONSE BODY:');
      console.log(JSON.stringify(responseBody, null, 2));
    } catch {
      responseBody = responseText;
      console.log('\n📄 RESPONSE BODY (TEXT):');
      console.log(responseText);
    }

    console.log('\n✅ Request completed');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Return response
    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
      body: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
    };
  } catch (error) {
    console.error('❌ Proxy error:', error);
    console.error('Stack trace:', error.stack);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

