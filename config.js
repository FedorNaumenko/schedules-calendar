// Configuration file for the Calendar Scheduler
// IMPORTANT: Before deployment, secure your API key in Google Cloud Console:
// 1. Go to Google Cloud Console > APIs & Credentials > API Keys
// 2. Click on your API key
// 3. Under "Application restrictions", select "HTTP referrers (web sites)"
// 4. Add your domain: https://fedornaumenko.github.io/schedules-calendar/*
// 5. Under "API restrictions", select "Restrict key" and only enable "Google Sheets API"

window.CONFIG = {
  // Google Sheets API Key
  // This key should be restricted to your domain and only allow Google Sheets API access
  GOOGLE_SHEETS_API_KEY: "AIzaSyBz3U6ehuu1FPlgYHqcpwF5OyyyHVZrzwE",
  
  // Calendar configurations - your actual sheets
  CALENDARS: {
    "Feed Processor Schedulers - US": {
      sheetId: "1gusA2pYc4q7MjJ-n2Yso5MoyjGq-tYPMzXoLeivuPr4",
      tab: "feed processor schedulers - us"
    },
    "ETL_US": {
      sheetId: "1hWaU-8J-OM8cwtsM774arn8xSNDcH1pKXb4p7EnOj-E"
      // tab: "Sheet1" // set if not first
    },
    "Delivery Scheduler Schedulers - US": {
      sheetId: "1nGjY4pf08ojuXqSN7D2p1S1HL1o6uKeAMRl1ySOODxg",
      tab: "delivery scheduler schedulers - us"
    }
  },
  
  // Application settings
  DEFAULT_TIMEZONE: "Asia/Jerusalem",
  
  // UI Configuration
  THEME: {
    primaryColor: "blue",
    headerClass: "bg-blue-600"
  }
};