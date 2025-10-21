/**
 * Calendar Scheduler Application
 * Handles Google Sheets integration and calendar rendering
 */


(async function () {
  // ============ CONFIG ============
  // AWS API Gateway endpoint - handles Google Sheets API calls securely
  const API_GATEWAY_BASE_URL = 'https://5cbytf01v5.execute-api.eu-north-1.amazonaws.com';

  // Calendar configurations
  const CALENDARS = {
    "Feed Schedulers - US": {
      sheetId: "1gusA2pYc4q7MjJ-n2Yso5MoyjGq-tYPMzXoLeivuPr4",
      tab: "us"
    },
    "Feed Schedulers - EU": {
      sheetId: "1gusA2pYc4q7MjJ-n2Yso5MoyjGq-tYPMzXoLeivuPr4",
      tab: "eu"
    },
    "ETL Summary - US": {
      sheetId: "1hWaU-8J-OM8cwtsM774arn8xSNDcH1pKXb4p7EnOj-E",
      tab: "ETLS - US"
    },
    "ETL Summary - EU": {
      sheetId: "1hWaU-8J-OM8cwtsM774arn8xSNDcH1pKXb4p7EnOj-E",
      tab: "ETLS - EU"
    },
    "Delivery Schedulers - US": {
      sheetId: "1nGjY4pf08ojuXqSN7D2p1S1HL1o6uKeAMRl1ySOODxg",
      tab: "us"
    },
    "Delivery Schedulers - EU": {
      sheetId: "1nGjY4pf08ojuXqSN7D2p1S1HL1o6uKeAMRl1ySOODxg",
      tab: "eu"
    },
    "Running Schedulers - US": {
      sheetId: "15sn5XMQlHET0vvhKIj5FdWSqKmmlkrwuROzJnf96gk0",
      tab: "us"
    },
    "Running Schedulers - EU": {
      sheetId: "15sn5XMQlHET0vvhKIj5FdWSqKmmlkrwuROzJnf96gk0",
      tab: "eu"
    }
  };

  // ======================================================
  // Fetch helper 
  // async function fetchSheetValuesFor(calendarName, tabName) {
  //   const cfg = CALENDARS[calendarName];
  //   const range = "A1:ZZ";

  //   const url = `${API_GATEWAY_BASE_URL}/values?sheetId=${encodeURIComponent(cfg.sheetId)}&sheet=${encodeURIComponent(tabName)}&range=${encodeURIComponent(range)}`;

  //   const resp = await fetch(url);
  //   if (!resp.ok) throw new Error(`Proxy fetch failed: ${resp.status}`);
  //   return await resp.json();
  // }
  // Cache for first-tab titles to reduce extra meta calls
  const metaCache = new Map(); // sheetId -> firstTabTitle

  // ============ STATE ============
  let loadedJobs = [];
  let currentDate = new Date();
  let currentCalendarKey = null; // Will be set after calendars load
  let selectedJobs = new Set(); // Track selected jobs for copying

  // ============ HELPERS ============
  function toObjects(values) {
    if (!values?.length) return [];
    const [headers, ...rows] = values;
    return rows.map(r => Object.fromEntries(headers.map((h,i)=>[h, (r[i] ?? '').trim()])));
  }
  
  function getField(row, ...candidates) {
    const lut = new Map(Object.keys(row).map(k => [k.toLowerCase().trim(), k]));
    for (const c of candidates) {
      const key = lut.get(c.toLowerCase().trim());
      if (key && row[key]) return row[key].trim();
    }
    return '';
  }
  
  function deriveNameFromArgs(argsStr) {
    if (!argsStr) return '';
    try { const o = JSON.parse(argsStr); if (o?.processor) return String(o.processor); } catch {}
    try {
      const coerced = argsStr
        .replace(/:(\w+)\s*=>/g, '"$1":')
        .replace(/(\w+)\s*=>/g, '"$1":')
        .replace(/=>/g, ':')
        .replace(/'/g, '"');
      const o2 = JSON.parse(coerced);
      if (o2?.processor) return String(o2.processor);
    } catch {}
    const m = argsStr.match(/processor["']?\s*(?::|=>)\s*["']([^"']+)["']|["']processor["']\s*:\s*["']([^"']+)["']/i);
    return m ? (m[1] || m[2] || '') : '';
  }
  
  function normalizeTZ(tz) {
    if (!tz) return 'Asia/Jerusalem';
    const map = { Israel: 'Asia/Jerusalem', Jerusalem: 'Asia/Jerusalem' };
    return map[tz] || tz;
  }
  
  function parseRubyishJson(str) {
    if (!str) return {};
    try { return JSON.parse(str.replace(/=>/g, ':')); }
    catch {
      try {
        const coerced = str
          .replace(/:(\w+)\s*=>/g, '"$1":')
          .replace(/(\w+)\s*=>/g, '"$1":')
          .replace(/=>/g, ':')
          .replace(/'/g, '"');
        return JSON.parse(coerced);
      } catch { return {}; }
    }
  }
  
  function parseArgs(str) {
    if (!str) return {};
    try { return JSON.parse(str); } catch {}
    return parseRubyishJson(str);
  }

  // ---------- Build rows for ALL schemas (Feed / Delivery / ETL) ----------
  function buildLoadedJobs(values) {
    const rows = toObjects(values);
    const jobs = [];

    for (const r of rows) {
      // cron & timezone (Feed/Delivery columns; ETL may use "Schedule" or "Scheduled" JSON-ish)
      let cron = getField(r, 'cron','Cron','CRON','Schedule');
      let tz   = getField(r, 'timezone','tz','Timezone','TZ');

      if (!cron || !tz) {
        const schedObj = parseRubyishJson(getField(r, 'Scheduled'));
        cron = cron || schedObj.cron || '';
        tz   = tz   || schedObj.timezone || '';
      }
      if (!cron) continue; // skip rows without cron
      tz = normalizeTZ(tz);

      // args (Delivery uses args.klass/client_key/channel)
      const rawArgs = getField(r, 'args','Args','parameters');
      const argsObj = parseArgs(rawArgs);

      // Get the job name (processor name) to display in the "Class" field
      const nameExplicit = getField(r, 'job name','Job name','Job Name','name','File Name');
      const processorName = argsObj.processor || argsObj.klass || argsObj.class;
      const nameDerived  = nameExplicit || processorName || '(unnamed)';

      // Keep original class for filtering/coloring purposes
      const klassFromCol  = getField(r, 'class','job class','type');
      const klassFromArgs = argsObj.klass || argsObj.class || argsObj.processor;
      const hasEtlHints   = !!(getField(r, 'File Name') || getField(r, 'Scheduled') || getField(r, 'Schedule'));
      const klass         = (klassFromCol || klassFromArgs || (hasEtlHints ? 'etl' : '')).toString();

      // account / client
      const accountFromCol  = getField(r, 'account','account name','client','Client_key','client_key');
      const accountFromArgs = argsObj.client_key || argsObj.account;
      const account         = (accountFromCol || accountFromArgs || '').toString();

      // description (optional)
      const desc = getField(r, 'job description','description');

      // If ETL-like row with no raw args, synthesize a helpful args object
      let finalArgs = rawArgs;
      if (!finalArgs) {
        const channel       = getField(r, 'Channel','channel') || argsObj.channel;
        const sendToPricing = getField(r, 'Send To Pricing','send to pricing');
        const competitors   = getField(r, 'Competitors');
        const fileName      = getField(r, 'File Name','filename');
        const link          = getField(r, 'link','Link','URL','url');

        const obj = { ...argsObj };
        if (account) obj.client_key = obj.client_key || account;
        if (channel) obj.channel = obj.channel || channel;
        if (sendToPricing) obj.send_to_pricing = obj.send_to_pricing || sendToPricing;
        if (competitors) obj.competitors = obj.competitors || competitors;
        if (fileName) obj.file_name = obj.file_name || fileName;
        if (link) obj.link = obj.link || link;

        finalArgs = Object.keys(obj).length ? JSON.stringify(obj) : '';
      }

      jobs.push({
        cron,
        timezone: tz,
        class: klass,
        args: finalArgs || '',
        account,
        'job name': nameDerived,
        'job description': desc || ''
      });
    }

    return jobs;
  }

  async function getFirstTabTitle(sheetId) {
    if (metaCache.has(sheetId)) return metaCache.get(sheetId);
    
    // Find the first calendar config for this sheetId to get the tab name
    for (const [calendarKey, config] of Object.entries(CALENDARS)) {
      if (config.sheetId === sheetId && config.tab) {
        metaCache.set(sheetId, config.tab);
        return config.tab;
      }
    }
    
    // Fallback to "Sheet1" if no tab specified in config
    const fallbackTitle = "Sheet1";
    metaCache.set(sheetId, fallbackTitle);
    return fallbackTitle;
  }

  async function fetchSheetValuesFor(calendarKey) {
    const { sheetId, tab } = CALENDARS[calendarKey];
    let tabName = tab;
    if (!tabName) tabName = await getFirstTabTitle(sheetId);
    
    const url = `${API_GATEWAY_BASE_URL}/values?sheetId=${encodeURIComponent(sheetId)}&sheet=${encodeURIComponent(tabName)}&range=${encodeURIComponent("A1:ZZ")}`;
    console.log("Fetching:", { calendarKey, sheetId, tab: tabName, url });
    
    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text().catch(()=> "");
      console.error("API Error:", { status: res.status, response: t, calendarKey, tab: tabName });
      throw new Error(`Sheets API error ${res.status}: ${t}`);
    }
    const data = await res.json();
    console.log("Received data:", { calendarKey, rowCount: data.values?.length || 0 });
    return data.values || [];
  }

  // Cron helpers (TZ-aware using Luxon)
  function parseRange(val, max) {
    const values = new Set();
    (val || '*').toString().split(',').forEach(part => {
      part = part.trim();
      if (part === '*' || part === '') { for (let i=0;i<=max;i++) values.add(i); }
      else if (part.includes('/')) {
        const [start, step] = part.split('/').map(Number);
        for (let i=start;i<=max;i+=step) values.add(i);
      } else if (part.includes('-')) {
        const [a,b] = part.split('-').map(Number);
        for (let i=a;i<=b;i++) values.add(i);
      } else {
        const n = parseInt(part,10);
        if (!Number.isNaN(n)) values.add(n);
      }
    });
    return values;
  }
  
  function getNextScheduledDatesTZ(expression, start, end, cronZone) {
    const { DateTime } = luxon;
    const dates = [];
    const parts = (expression || "").trim().split(/\s+/);
    if (parts.length < 5) return dates;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const minutes = parseRange(minute, 59);
    const hours = parseRange(hour, 23);
    const dom = parseRange(dayOfMonth, 31);

    const months = new Set();
    month.split(',').forEach(p=>{
      if (p==='*') { for (let m=1;m<=12;m++) months.add(m); }
      else if (p.includes('/')) { const [s,step]=p.split('/').map(Number); for (let m=s;m<=12;m+=step) months.add(m); }
      else if (p.includes('-')) { const [a,b]=p.split('-').map(Number); for (let m=a;m<=b;m++) months.add(m); }
      else months.add(parseInt(p,10));
    });

    const dows = parseRange(dayOfWeek, 6); // 0..6 Sun..Sat

    let cur = luxon.DateTime.fromJSDate(start, { zone: cronZone }).startOf('day');
    const endDT = luxon.DateTime.fromJSDate(end, { zone: cronZone }).endOf('day');

    while (cur <= endDT) {
      const m = cur.month, d = cur.day, w = cur.weekday % 7;
      if (months.has(m) && dom.has(d) && dows.has(w)) {
        for (const h of hours) for (const mi of minutes) {
          const dt = cur.set({ hour: h, minute: mi, second: 0, millisecond: 0 });
          if (dt >= luxon.DateTime.fromJSDate(start, { zone: cronZone }) &&
              dt <= luxon.DateTime.fromJSDate(end,   { zone: cronZone })) {
            dates.push(dt.toJSDate());
          }
        }
      }
      cur = cur.plus({ days: 1 });
    }
    return dates;
  }

  function getJobsForMonth(year, month) {
    const jobsPerDay = {};
    const start = new Date(year, month, 1, 0, 0, 0);
    const end   = new Date(year, month + 1, 0, 23, 59, 59);

    loadedJobs.forEach(job => {
      const cronZone = job.timezone || 'Asia/Jerusalem';
      const scheduledDates = getNextScheduledDatesTZ(job.cron, start, end, cronZone);
      scheduledDates.forEach(date => {
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        (jobsPerDay[key] ||= []).push({ ...job, scheduledTime: date });
      });
    });
    return jobsPerDay;
  }

  // Colors for dots
  const colorMap = {
    'spark': 'bg-blue-500',
    'feed': 'bg-purple-500',
    'monitors': 'bg-red-500',
    'competitors': 'bg-green-500',
    'Client A': 'bg-blue-500',
    'Client B': 'bg-purple-500',
    'Internal': 'bg-red-500',
    'Client C': 'bg-yellow-500',
    // Fallback handled below
  };

  // ============ JOB SELECTION & COPY ============
  function updateCopyButton() {
    const copyBtn = document.getElementById('copy-jobs-btn');
    const countSpan = document.getElementById('selected-count');
    const count = selectedJobs.size;
    
    countSpan.textContent = count;
    
    if (count > 0) {
      copyBtn.disabled = false;
      copyBtn.className = 'px-4 py-2 bg-blue-500 text-white rounded-lg font-medium transition-colors duration-200 hover:bg-blue-600 cursor-pointer';
    } else {
      copyBtn.disabled = true;
      copyBtn.className = 'px-4 py-2 bg-gray-300 text-gray-500 rounded-lg font-medium transition-colors duration-200 cursor-not-allowed';
    }
  }

  function toggleJobSelection(jobId, shiftKey = false) {
    if (shiftKey && selectedJobs.size > 0) {
      // For shift-click, we could implement range selection, but for now just add to selection
      selectedJobs.add(jobId);
    } else if (!shiftKey) {
      // Normal click - toggle selection
      if (selectedJobs.has(jobId)) {
        selectedJobs.delete(jobId);
      } else {
        selectedJobs.add(jobId);
      }
    }
    
    updateJobSelectionDisplay();
    updateCopyButton();
  }

  function updateJobSelectionDisplay() {
    // Update visual state of job cards
    const allJobCards = document.querySelectorAll('[data-job-id]');
    allJobCards.forEach(card => {
      const jobId = card.dataset.jobId;
      if (selectedJobs.has(jobId)) {
        card.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
        card.classList.remove('bg-gray-50');
      } else {
        card.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
        card.classList.add('bg-gray-50');
      }
    });
  }

  async function copySelectedJobs() {
    if (selectedJobs.size === 0) return;
    
    // Find the jobs data for selected IDs
    const selectedJobsData = [];
    const allJobCards = document.querySelectorAll('[data-job-id]');
    
    allJobCards.forEach(card => {
      const jobId = card.dataset.jobId;
      if (selectedJobs.has(jobId)) {
        const argsElement = card.querySelector('.job-args');
        if (argsElement) {
          selectedJobsData.push(argsElement.textContent);
        }
      }
    });
    
    // Join all args with single newlines (no blank lines between jobs)
    const textToCopy = selectedJobsData.join('\n');
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      // Visual feedback
      const copyBtn = document.getElementById('copy-jobs-btn');
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = 'Copied! ✓';
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      alert('Copy failed. Please select and copy manually.');
    }
  }
  function renderCalendar(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    calendarGrid.innerHTML = '';
    const year = date.getFullYear();
    const month = date.getMonth();
    document.getElementById('month-year').textContent =
      `${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const jobsPerDay = getJobsForMonth(year, month);

    for (let i = 0; i < firstDayOfMonth; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.classList.add('p-2','rounded-lg');
      calendarGrid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'p-2 text-center font-medium rounded-lg relative cursor-pointer transition-colors duration-200 hover:bg-gray-100';
      cell.textContent = day;
      cell.dataset.date = `${year}-${month}-${day}`;

      const jobsOnDay = jobsPerDay[`${year}-${month}-${day}`] || [];
      if (jobsOnDay.length > 0) {
        cell.classList.add('bg-blue-50','text-blue-700','font-bold');
        const uniqueJobColors = new Set(jobsOnDay.map(j => colorMap[j.class] || colorMap[j.account] || 'bg-gray-500'));
        const dots = document.createElement('div');
        dots.className = 'absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1';
        uniqueJobColors.forEach(c => {
          const dot = document.createElement('div');
          dot.className = `w-2 h-2 rounded-full ${c}`;
          dots.appendChild(dot);
        });
        cell.appendChild(dots);
      }

      const today = new Date();
      if (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year) {
        cell.classList.add('border-2','border-blue-600','bg-blue-100','text-blue-800');
      }

      cell.addEventListener('click', () => showJobsForDay(cell.dataset.date));
      calendarGrid.appendChild(cell);
    }
  }

  // ============ FILTER STATE ============
  let currentDayJobs = [];
  let timeFilterStart = 0;     // 0-23.99 hours
  let timeFilterEnd = 23.99;   // 0-23.99 hours
  let activeFilters = [];      // Array of {type: 'account'|'job'|'args', value: 'search term'}

  function setupTimeFilter() {
    const container = document.getElementById('time-scale-container');
    const handleStart = document.getElementById('time-handle-start');
    const handleEnd = document.getElementById('time-handle-end');
    const highlight = document.getElementById('time-range-highlight');
    const display = document.getElementById('time-range-display');
    const resetBtn = document.getElementById('reset-time-filter');

    let dragging = null;

    function updateUI() {
      const handleWidth = handleStart.offsetWidth;
      const containerWidth = container.offsetWidth;
      
      const startPct = (timeFilterStart / 24) * 100;
      const endPct = (timeFilterEnd / 24) * 100;
      
      // Offset handles by half their width so they center on the time position
      const handleOffsetPct = (handleWidth / containerWidth) * 50;
      
      handleStart.style.left = `calc(${startPct}% - ${handleOffsetPct}%)`;
      handleEnd.style.left = `calc(${endPct}% - ${handleOffsetPct}%)`;
      highlight.style.left = `${startPct}%`;
      highlight.style.width = `${endPct - startPct}%`;

      const startHH = Math.floor(timeFilterStart);
      const startMM = Math.floor((timeFilterStart % 1) * 60);
      const endHH = Math.floor(timeFilterEnd);
      const endMM = Math.floor((timeFilterEnd % 1) * 60);
      display.textContent = `${String(startHH).padStart(2, '0')}:${String(startMM).padStart(2, '0')} - ${String(endHH).padStart(2, '0')}:${String(endMM).padStart(2, '0')}`;
      
      filterAndDisplayJobs();
    }

    function onMouseMove(e) {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const handleWidth = handleStart.offsetWidth;
      
      // Calculate mouse position relative to container, accounting for handle center
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const hour = (x / rect.width) * 24;

      if (dragging === 'start') {
        timeFilterStart = Math.min(hour, timeFilterEnd - 0.25);
      } else {
        timeFilterEnd = Math.max(hour, timeFilterStart + 0.25);
      }
      updateUI();
    }

    function onMouseUp() {
      dragging = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    handleStart.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = 'start';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    handleEnd.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = 'end';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    resetBtn.addEventListener('click', () => {
      timeFilterStart = 0;
      timeFilterEnd = 23.99;
      updateUI();
    });

    updateUI();
  }

  function setupSearchFilters() {
    const filterTypeSelect = document.getElementById('filter-type-select');
    const searchInput = document.getElementById('filter-search-input');
    const addBtn = document.getElementById('add-filter-btn');
    const activeFiltersContainer = document.getElementById('active-filters');

    // Reset
    filterTypeSelect.value = '';
    searchInput.value = '';
    searchInput.disabled = true;
    addBtn.disabled = true;

    // Enable search input when filter type is selected
    filterTypeSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        searchInput.disabled = false;
        searchInput.focus();
        searchInput.placeholder = `Search by ${e.target.value}...`;
      } else {
        searchInput.disabled = true;
        searchInput.value = '';
        addBtn.disabled = true;
      }
    });

    // Enable add button when search input has value
    searchInput.addEventListener('input', (e) => {
      addBtn.disabled = !e.target.value.trim() || !filterTypeSelect.value;
    });

    // Handle Enter key in search input
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !addBtn.disabled) {
        addFilter();
      }
    });

    // Add filter button
    addBtn.addEventListener('click', addFilter);

    function addFilter() {
      const type = filterTypeSelect.value;
      const value = searchInput.value.trim();
      
      if (!type || !value) return;

      // Add to active filters
      activeFilters.push({ type, value });
      
      // Reset inputs
      filterTypeSelect.value = '';
      searchInput.value = '';
      searchInput.disabled = true;
      addBtn.disabled = true;
      
      // Render filter tags and update display
      renderActiveFilters();
      filterAndDisplayJobs();
    }

    function renderActiveFilters() {
      activeFiltersContainer.innerHTML = '';
      
      if (activeFilters.length === 0) {
        activeFiltersContainer.innerHTML = '<span class="text-xs text-gray-400">No active filters</span>';
        return;
      }

      activeFilters.forEach((filter, index) => {
        const tag = document.createElement('div');
        tag.className = 'inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full';
        tag.innerHTML = `
          <span class="font-medium">${filter.type}:</span>
          <span>${filter.value}</span>
          <button class="ml-1 hover:text-blue-900" data-index="${index}">
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </button>
        `;
        
        // Remove filter when X is clicked
        tag.querySelector('button').addEventListener('click', () => {
          activeFilters.splice(index, 1);
          renderActiveFilters();
          filterAndDisplayJobs();
        });
        
        activeFiltersContainer.appendChild(tag);
      });
    }

    // Initial render
    renderActiveFilters();
  }

  function filterAndDisplayJobs() {
    const jobList = document.getElementById('job-list');
    const noJobsMessage = document.getElementById('no-jobs-message');
    const filterStats = document.getElementById('filter-stats');
    jobList.innerHTML = '';

    // Apply all filters: time + active search filters
    const filteredJobs = currentDayJobs.filter(job => {
      // Time filter
      const dt = luxon.DateTime.fromJSDate(job.scheduledTime, { zone: 'Asia/Jerusalem' });
      const hour = dt.hour + dt.minute / 60;
      if (hour < timeFilterStart || hour > timeFilterEnd) return false;

      // Apply all active filters (AND logic)
      for (const filter of activeFilters) {
        const searchValue = filter.value.toLowerCase();
        
        switch (filter.type) {
          case 'account':
            if (!job.account.toLowerCase().includes(searchValue)) return false;
            break;
          case 'job':
            if (!job['job name'].toLowerCase().includes(searchValue)) return false;
            break;
          case 'args':
            if (!job.args.toLowerCase().includes(searchValue)) return false;
            break;
        }
      }

      return true;
    });

    // Update filter stats
    if (activeFilters.length > 0) {
      filterStats.textContent = `Showing ${filteredJobs.length} of ${currentDayJobs.length} jobs`;
    } else {
      filterStats.textContent = `Showing ${filteredJobs.length} jobs`;
    }

    if (filteredJobs.length === 0) {
      noJobsMessage.classList.remove('hidden');
      return;
    }
    noJobsMessage.classList.add('hidden');

    // Sort & group by minute
    filteredJobs.sort((a,b) => a.scheduledTime - b.scheduledTime);
    const groups = new Map();
    for (const j of filteredJobs) {
      const key = luxon.DateTime.fromJSDate(j.scheduledTime, { zone: 'Asia/Jerusalem' }).toFormat('HH:mm');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(j);
    }

    let jobIndex = 0;
    for (const [hhmm, arr] of groups) {
      const header = document.createElement('div');
      header.className = 'mt-2 text-xs uppercase tracking-wide text-gray-500';
      header.textContent = `${hhmm} — ${arr.length} job${arr.length>1?'s':''}`;
      jobList.appendChild(header);

      for (const job of arr) {
        const scheduledTimeIL = luxon.DateTime.fromJSDate(job.scheduledTime, { zone: 'Asia/Jerusalem' }).toFormat('HH:mm');
        const colorClass = colorMap[job.class] || colorMap[job.account] || 'bg-gray-500';
        const jobId = `job-${jobIndex++}`;

        const card = document.createElement('div');
        card.className = 'grid grid-cols-[6rem_1fr] gap-4 p-4 bg-gray-50 rounded-xl shadow-sm border border-gray-200 cursor-pointer select-none transition-all duration-200 hover:shadow-md';
        card.dataset.jobId = jobId;

        card.innerHTML = `
          <div class="flex flex-col items-start">
            <div class="text-sm font-bold text-gray-900">${scheduledTimeIL}</div>
            <div class="text-[11px] text-gray-500">Israel Time</div>
          </div>

          <div class="min-w-0">
            <div class="text-sm text-gray-700 space-y-1">
              <div><span class="font-medium">Job:</span> ${job['job name'] || '-'}</div>
              <div><span class="font-medium">Account:</span> ${job.account || '-'}</div>
              <div><span class="font-medium">Cron:</span> <code class="text-xs bg-white px-1 py-0.5 rounded border">${job.cron || '-'}</code></div>
              <div><span class="font-medium">Timezone:</span> ${job.timezone || 'Asia/Jerusalem'}</div>
              <div class="flex items-start gap-2">
                <span class="font-medium mt-0.5">Args:</span>
                <pre class="job-args text-xs bg-white px-2 py-1 rounded border overflow-x-auto whitespace-pre-wrap break-words max-h-32">${job.args || '-'}</pre>
              </div>
              <div class="text-gray-600 break-words">${job['job description'] || ''}</div>
            </div>
          </div>
        `;
        
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleJobSelection(jobId, e.shiftKey);
        });
        
        jobList.appendChild(card);
      }
    }
  }

  function showJobsForDay(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const selectedDate = new Date(year, month, day);
    const jobsPerDay = getJobsForMonth(year, month);
    const jobsOnThisDay = jobsPerDay[`${year}-${month}-${day}`] || [];

    // Clear previous selections when opening new day
    selectedJobs.clear();
    updateCopyButton();

    // Reset all filters
    currentDayJobs = jobsOnThisDay;
    timeFilterStart = 0;
    timeFilterEnd = 23.99;
    activeFilters = [];

    const modalDateString = selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('modal-title').textContent =
      `Jobs for ${modalDateString} — ${currentCalendarKey}`;
    const jobList = document.getElementById('job-list');
    const noJobsMessage = document.getElementById('no-jobs-message');
    jobList.innerHTML = '';

    if (jobsOnThisDay.length === 0) {
      noJobsMessage.classList.remove('hidden');
      document.getElementById('job-modal').classList.remove('hidden');
      document.getElementById('job-modal').classList.add('flex');
      return;
    }
    noJobsMessage.classList.add('hidden');

    // Setup time filter and search filters
    setupTimeFilter();
    setupSearchFilters();
    filterAndDisplayJobs();

    const modal = document.getElementById('job-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  // ============ CONTROLLER ============
  async function loadCalendarFor(calendarKey) {
    currentCalendarKey = calendarKey;
    document.getElementById('calendar-select').value = calendarKey;

    try {
      const values = await fetchSheetValuesFor(calendarKey);
      loadedJobs = buildLoadedJobs(values);
      renderCalendar(currentDate);
    } catch (error) {
      console.error("Failed to load calendar:", error);
      alert(`Failed to load "${calendarKey}":\n\n${error.message}\n Please try to refresh.`);
    }
  }

  // Populate dropdown after calendars are loaded
  async function populateCalendarDropdown() {
    const selectEl = document.getElementById('calendar-select');
    const calendarKeys = Object.keys(CALENDARS);
    selectEl.innerHTML = calendarKeys
      .map(k => `<option value="${k}">${k}</option>`)
      .join('');
    
    if (!currentCalendarKey && calendarKeys.length > 0) {
      currentCalendarKey = calendarKeys[0];
    }
    
    selectEl.addEventListener('change', async (e) => {
      await loadCalendarFor(e.target.value);
    });
  }

  // Month controls
  document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(currentDate); });
  document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(currentDate); });
  document.getElementById('close-modal').addEventListener('click', () => document.getElementById('job-modal').classList.add('hidden'));

  // Copy jobs functionality
  document.getElementById('copy-jobs-btn').addEventListener('click', copySelectedJobs);

  // Close modal when clicking on background (outside the white content box)
  document.getElementById('job-modal').addEventListener('click', (e) => {
    // Only close if the click target is the modal background itself, not its children
    if (e.target.id === 'job-modal') {
      document.getElementById('job-modal').classList.add('hidden');
    }
  });

  // Initial load
  await populateCalendarDropdown();
  if (currentCalendarKey) {
    await loadCalendarFor(currentCalendarKey);
  }
})();