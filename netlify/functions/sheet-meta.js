exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { sheetId } = event.queryStringParameters || {};
    
    if (!sheetId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'sheetId parameter is required' })
      };
    }

    const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    
    if (!API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?key=${API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Sheets meta error ${response.status}`);
    }
    
    const data = await response.json();
    const title = data.sheets?.[0]?.properties?.title;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ title, sheetId })
    };
  } catch (error) {
    console.error('Error in sheet-meta function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};