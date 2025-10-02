# Schedules Calendar

Interactive cron calendar that reads jobs from Google Sheets and shows them in Israel time.

## 🌐 Live Demo

Visit the live application: [https://fedornaumenko.github.io/schedules-calendar/](https://fedornaumenko.github.io/schedules-calendar/)

## 🚀 Features

- Interactive calendar view with cron job scheduling
- Google Sheets integration for job data
- Job selection and copying functionality
- Israel timezone support using Luxon
- Responsive design with Tailwind CSS
- Click-outside-to-close modals
- Real-time job details with args copying

## 🛠️ Development

### Prerequisites
- Node.js (v14 or higher)
- npm
- Google Sheets API key

### Setup
```bash
# Clone the repository
git clone https://github.com/FedorNaumenko/schedules-calendar.git
cd schedules-calendar

# Install dependencies
npm install

# Copy the environment template and add your API key
cp .env.example .env
# Edit .env and add your Google Sheets API key

# Build CSS
npm run build-css

# Open index.html in your browser for local development
```

### API Key Setup

**For local development:**
1. Copy `.env.example` to `.env`
2. Get a Google Sheets API key from [Google Cloud Console](https://console.cloud.google.com/)
3. Add your API key to the `.env` file

**For GitHub Pages deployment:**
1. Go to your repository Settings → Secrets and variables → Actions
2. Add a new repository secret named `GOOGLE_SHEETS_API_KEY`
3. Paste your Google Sheets API key as the value
4. The GitHub Actions workflow will automatically inject it during deployment

## 📁 Project Structure

```
├── js/
│   └── calendar.js          # Main application logic
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages deployment
├── index.html              # Main HTML file
├── output.css              # Built Tailwind CSS
├── .env.example           # Environment template
└── README.md              # This file
```

# Build CSS
npm run build-css

# For development with auto-rebuild
npm run watch-css
```

### Deployment
```bash
# Build and deploy to GitHub Pages
npm run deploy
```

## 📁 Project Structure
- `index.html` - Main application file
- `styles.css` - Tailwind CSS source
- `output.css` - Compiled CSS (generated)
- `tailwind.config.js` - Tailwind configuration
- `postcss.config.js` - PostCSS configuration
