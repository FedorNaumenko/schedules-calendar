// AWS Lambda function to proxy Google Sheets API requests
// This fixes the 500 error by properly formatting sheet names in the range parameter

export const handler = async (event) => {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    
    // Determine origin for CORS
    const origin = event.headers.origin || event.headers.Origin;
    const allowedOrigins = ['https://jobscalendar.site', 'http://127.0.0.1:5500', 'http://localhost:5500'];
    const responseOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': responseOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight OPTIONS request
    if (event.requestContext.http.method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: '',
        };
    }

    try {
        const path = event.rawPath || event.requestContext.http.path;
        
        // Extract spreadsheetId and range from path
        // Format: /v4/spreadsheets/{spreadsheetId}/values/{range}
        const matches = path.match(/\/v4\/spreadsheets\/([^\/]+)\/values\/(.+)/);
        
        if (!matches) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Invalid path format' }),
            };
        }

        const spreadsheetId = matches[1];
        let range = decodeURIComponent(matches[2]);
        
        // FIX: Only quote sheet names that contain spaces, quotes, or exclamation marks
        // Simple sheet names like "us" or "eu" should NOT be quoted
        const sheetNameMatch = range.match(/^([^!]+)!/);
        if (sheetNameMatch) {
            const sheetName = sheetNameMatch[1];
            const needsQuotes = /[\s'!]/.test(sheetName);
            
            if (needsQuotes && !sheetName.startsWith("'")) {
                // Add quotes if needed and not already quoted
                range = `'${sheetName}'${range.substring(sheetName.length)}`;
            } else if (!needsQuotes && sheetName.startsWith("'")) {
                // Remove quotes if not needed
                const unquotedName = sheetName.replace(/^'|'$/g, '');
                range = `${unquotedName}${range.substring(sheetName.length)}`;
            }
        }

        // Build Google Sheets API URL
        const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${GOOGLE_API_KEY}`;
        
        console.log('Requesting:', sheetsUrl);

        // Make request to Google Sheets API
        const response = await fetch(sheetsUrl);
        const data = await response.json();

        if (!response.ok) {
            console.error('Google Sheets API error:', data);
            return {
                statusCode: response.status,
                headers: corsHeaders,
                body: JSON.stringify(data),
            };
        }

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        };

    } catch (error) {
        console.error('Lambda error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message 
            }),
        };
    }
};
