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
    // Calendar configurations - these can be public since they're just sheet IDs
    const CALENDARS = {
      "Feed Processor Schedulers - US": {
        sheetId: "1gusA2pYc4q7MjJ-n2Yso5MoyjGq-tYPMzXoLeivuPr4",
        tab: "feed processor schedulers - us"
      },
      "ETL_US": {
        sheetId: "1hWaU-8J-OM8cwtsM774arn8xSNDcH1pKXb4p7EnOj-E"
        // tab: "Sheet1" // set if not first
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ calendars: CALENDARS })
    };
  } catch (error) {
    console.error('Error in calendars function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};