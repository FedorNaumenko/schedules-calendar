# Schedules Calendar

Interactive cron calendar that reads jobs from Google Sheets and shows them in Israel time.

## 🌐 Live Demo

Visit the live application: [https://fedornaumenko.github.io/schedules-calendar/](https://fedornaumenko.github.io/schedules-calendar/)

## 🚀 Features

- Interactive calendar view with cron job scheduling
- Google Sheets integration for job data
- Israel timezone support
- Responsive design with Tailwind CSS
- Real-time job status updates

## 🛠️ Development

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup
```bash
# Clone the repository
git clone https://github.com/FedorNaumenko/schedules-calendar.git
cd schedules-calendar

# Install dependencies
npm install

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
