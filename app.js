// App State
let activities = [];
let trainingBlocks = [];
let isMetric = false; // false = miles, true = km
let editingBlockId = null; // ID of the block currently being edited, null otherwise
let baselineRaces = []; // User-defined benchmark race performances
let paceDistributionChart = null; // Chart instance for pace distribution histogram

// Chart instances
let weeklyMileageChart = null;
let cumulativeMileageChart = null;
let longRunChart = null;
let paceChart = null;

// DOM Elements
const unitToggle = document.getElementById('unit-toggle');
const syncStatus = document.getElementById('sync-status');
const blocksList = document.getElementById('blocks-list');
const showAddFormBtn = document.getElementById('show-add-form-btn');
const addBlockForm = document.getElementById('add-block-form');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const comparisonTableHeaders = document.getElementById('table-headers');
const comparisonTableBody = document.getElementById('table-body');

// Default blocks in case localStorage is empty (starts empty as requested)
const defaultBlocks = [];

// Conversions
const metersToMiles = (m) => m * 0.000621371;
const metersToKm = (m) => m / 1000;
const convertDistance = (m) => isMetric ? metersToKm(m) : metersToMiles(m);
const getDistanceUnit = () => isMetric ? 'km' : 'mi';

// Format pace (speed in m/s to min/mi or min/km)
function formatPace(speedMps) {
    if (!speedMps || speedMps <= 0) return '--:--';
    // speedMps is meters per second
    // Pace decimal = minutes per unit
    const paceDecimal = isMetric ? (16.6667 / speedMps) : (26.8224 / speedMps);
    if (paceDecimal > 30) return '--:--'; // Ignore unrealistically slow paces (walking/stops)
    const minutes = Math.floor(paceDecimal);
    const seconds = Math.round((paceDecimal - minutes) * 60);
    const formattedSeconds = seconds < 10 ? '0' + seconds : (seconds === 60 ? '00' : seconds);
    const displayMinutes = seconds === 60 ? minutes + 1 : minutes;
    return `${displayMinutes}:${formattedSeconds}`;
}

// Convert average speed back to pace string from decimal minutes
function formatPaceFromTimeAndDistance(timeSeconds, distanceMeters) {
    if (!distanceMeters || distanceMeters <= 0) return '--:--';
    const speedMps = distanceMeters / timeSeconds;
    return formatPace(speedMps);
}

// Initialize Application
async function init() {
    loadSettings();
    setupEventListeners();
    await loadData();
    renderBlockManager();
    renderBaselineRaces();
    updateDashboard();
}

// Load settings from localStorage
function loadSettings() {
    const savedMetric = localStorage.getItem('isMetric');
    if (savedMetric !== null) {
        isMetric = JSON.parse(savedMetric);
        unitToggle.checked = isMetric;
    }

    const savedBlocks = localStorage.getItem('trainingBlocks');
    if (savedBlocks !== null) {
        trainingBlocks = JSON.parse(savedBlocks);
        // Automatically filter out the old demo blocks if they were saved in the browser cache
        trainingBlocks = trainingBlocks.filter(b => b.id !== 'boston-2025' && b.id !== 'chicago-2024');
        saveBlocksToStorage();
    } else {
        trainingBlocks = [];
        saveBlocksToStorage();
    }

    const savedBaselines = localStorage.getItem('baselineRaces');
    if (savedBaselines !== null) {
        baselineRaces = JSON.parse(savedBaselines);
    } else {
        baselineRaces = [];
    }
}

// Save training blocks to localStorage
function saveBlocksToStorage() {
    localStorage.setItem('trainingBlocks', JSON.stringify(trainingBlocks));
}

// Setup Event Listeners
function setupEventListeners() {
    // Unit Toggle
    unitToggle.addEventListener('change', (e) => {
        isMetric = e.target.checked;
        localStorage.setItem('isMetric', JSON.stringify(isMetric));
        updateDashboard();
    });

    // Show/Hide Add Block Form
    showAddFormBtn.addEventListener('click', () => {
        addBlockForm.classList.remove('hidden');
        showAddFormBtn.classList.add('hidden');
    });

    cancelAddBtn.addEventListener('click', () => {
        resetBlockForm();
    });

    // Form color value sync
    const blockColorInput = document.getElementById('block-color');
    const colorValSpan = blockColorInput.nextElementSibling;
    blockColorInput.addEventListener('input', (e) => {
        colorValSpan.textContent = e.target.value;
    });

    // Form Submission
    addBlockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('block-name').value.trim();
        const raceDate = document.getElementById('race-date').value;
        const color = blockColorInput.value;
        const targetDistance = parseFloat(document.getElementById('target-distance').value);

        if (name && raceDate) {
            if (editingBlockId) {
                // Edit existing block
                const block = trainingBlocks.find(b => b.id === editingBlockId);
                if (block) {
                    block.name = name;
                    block.raceDate = raceDate;
                    block.color = color;
                    block.targetDistance = targetDistance;
                }
                editingBlockId = null;
            } else {
                // Add new block
                const newBlock = {
                    id: 'block-' + Date.now(),
                    name,
                    raceDate,
                    color,
                    targetDistance,
                    selected: true
                };
                trainingBlocks.push(newBlock);
            }
            
            saveBlocksToStorage();
            renderBlockManager();
            updateDashboard();

            // Reset and hide form
            resetBlockForm();
        }
    });

    // Benchmark Race Search
    const btnSearchBaselines = document.getElementById('btn-search-baselines');
    const baselineSearchInput = document.getElementById('baseline-search-input');
    const baselineSearchResults = document.getElementById('baseline-search-results');

    if (btnSearchBaselines && baselineSearchInput && baselineSearchResults) {
        btnSearchBaselines.addEventListener('click', () => {
            const query = baselineSearchInput.value.trim().toLowerCase();
            if (!query) {
                baselineSearchResults.classList.add('hidden');
                return;
            }

            // Filter running activities matching name query
            const matches = activities.filter(run => 
                run.name.toLowerCase().includes(query)
            ).slice(0, 10); // Limit to top 10 results

            if (matches.length === 0) {
                baselineSearchResults.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 0.5rem; text-align: center;">No matching activities found.</div>';
                baselineSearchResults.classList.remove('hidden');
                return;
            }

            baselineSearchResults.innerHTML = '';
            matches.forEach(run => {
                const dateStr = new Date(run.start_date_local).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const distStr = isMetric 
                    ? `${(run.distance / 1000).toFixed(2)} km` 
                    : `${metersToMiles(run.distance).toFixed(2)} mi`;
                const timeStr = formatDuration(run.elapsed_time);

                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                resultItem.innerHTML = `
                    <div class="search-result-info">
                        <span class="search-result-name">${run.name}</span>
                        <span class="search-result-meta">${dateStr} | ${distStr} | Time: ${timeStr}</span>
                    </div>
                    <button type="button" class="btn-add-baseline" data-id="${run.id}">+ Add</button>
                `;

                resultItem.querySelector('.btn-add-baseline').addEventListener('click', () => {
                    // Add to baselineRaces if not already added
                    if (!baselineRaces.some(r => r.id === run.id)) {
                        baselineRaces.push({
                            id: run.id,
                            name: run.name,
                            date: run.start_date_local,
                            distance: run.distance,
                            elapsed_time: run.elapsed_time
                        });
                        saveBaselineRacesToStorage();
                        renderBaselineRaces();
                        updateDashboard();
                        
                        // Force refresh block manager sidebar preview times
                        renderBlockManager();
                    }
                    // Clear search
                    baselineSearchInput.value = '';
                    baselineSearchResults.classList.add('hidden');
                });

                baselineSearchResults.appendChild(resultItem);
            });
            baselineSearchResults.classList.remove('hidden');
        });

        // Hide search results when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.benchmark-races-box')) {
                baselineSearchResults.classList.add('hidden');
            }
        });
    }
}

// Reset form to its default 'New Block' state and hide it
function resetBlockForm() {
    addBlockForm.reset();
    editingBlockId = null;
    addBlockForm.querySelector('h3').textContent = 'New Training Block';
    addBlockForm.querySelector('button[type="submit"]').textContent = 'Save Block';
    document.getElementById('block-color').nextElementSibling.textContent = '#fc4c02';
    document.getElementById('target-distance').value = '42195'; // default to Marathon
    addBlockForm.classList.add('hidden');
    showAddFormBtn.classList.remove('hidden');
}

// Open form in edit mode and populate it with existing block details
function openEditForm(block) {
    editingBlockId = block.id;
    
    // Populate form fields
    document.getElementById('block-name').value = block.name;
    document.getElementById('block-date').value = block.raceDate;
    document.getElementById('block-color').value = block.color;
    document.getElementById('block-color').nextElementSibling.textContent = block.color;
    
    // Populate target distance select
    const targetDistanceSelect = document.getElementById('target-distance');
    if (block.targetDistance) {
        targetDistanceSelect.value = block.targetDistance;
    } else {
        const estDist = getTargetDistance(processBlock(block).summary, block.name, block);
        targetDistanceSelect.value = estDist;
    }
    
    // Update form header and button text
    addBlockForm.querySelector('h3').textContent = 'Edit Training Block';
    addBlockForm.querySelector('button[type="submit"]').textContent = 'Update Block';
    
    // Show form
    addBlockForm.classList.remove('hidden');
    showAddFormBtn.classList.add('hidden');
}

// Load Activities Data
async function loadData() {
    setSyncStatus('loading', 'Loading Strava data...');
    try {
        const response = await fetch('data/activities.json');
        if (!response.ok) {
            throw new Error(`Data file not found (HTTP ${response.status})`);
        }
        activities = await response.json();
        
        if (!Array.isArray(activities) || activities.length === 0) {
            throw new Error('Data file is empty or corrupted');
        }

        setSyncStatus('synced', `Synced: ${activities.length} runs loaded`);
    } catch (err) {
        console.warn('Could not load local activities.json. Falling back to Demo Mode with mock data.', err.message);
        generateMockActivities();
        setSyncStatus('error', 'Demo Mode: Running on mock data');
    }
}

// Set top bar sync status styling
function setSyncStatus(state, text) {
    syncStatus.className = 'sync-status ' + state;
    syncStatus.querySelector('.status-text').textContent = text;
}

// Generate high-fidelity mock training blocks data for Boston 2025 and Chicago 2024
function generateMockActivities() {
    activities = [];
    const now = Date.now();

    // Chicago 2024 (Race Date: Oct 13, 2024)
    // Boston 2025 (Race Date: Apr 21, 2025)
    const cycles = [
        { raceDate: '2024-10-13', name: 'Chicago Marathon 2024', baseWeekly: 30, peakWeekly: 65, avgPaceMps: 4.2 }, // ~3:50 pace builder
        { raceDate: '2025-04-21', name: 'Boston Marathon 2025', baseWeekly: 25, peakWeekly: 58, avgPaceMps: 4.5 }  // ~3:30 pace builder
    ];

    cycles.forEach(cycle => {
        const raceDateObj = new Date(cycle.raceDate);
        
        // Let's generate 20 weeks of runs leading to this race date
        // 20 weeks = 140 days
        for (let week = 1; week <= 20; week++) {
            // Volume progression curve: builds up, peaks around week 17, tapers in weeks 18-20
            let weeklyVolumeMultiplier = 0.5 + (week / 20) * 0.5; // Base ramping
            
            // Peak at week 17, taper down
            if (week === 17) weeklyVolumeMultiplier = 1.0;
            else if (week === 18) weeklyVolumeMultiplier = 0.85; // Taper starts
            else if (week === 19) weeklyVolumeMultiplier = 0.65; // Tapering
            else if (week === 20) weeklyVolumeMultiplier = 0.40; // Race week volume (excl. race itself)

            let targetWeeklyMeters = (cycle.baseWeekly + (cycle.peakWeekly - cycle.baseWeekly) * weeklyVolumeMultiplier) * 1609.34;
            
            if (week === 20) {
                // Adjust target for race week: 26.2 miles for race + some taper runs
                targetWeeklyMeters = (15 + 26.2) * 1609.34;
            }

            // Distribute weekly volume into 3 to 5 runs
            const numRuns = week < 5 ? 3 : (week < 12 ? 4 : 5);
            let remainingMeters = targetWeeklyMeters;

            // Generate runs for this week (Monday to Sunday)
            // Week 20 ends on Race Day (Sunday). Week 19 ends 7 days before, etc.
            const daysOffsetStart = (20 - week) * 7 + 6; // Days before race at start of this week

            for (let r = 1; r <= numRuns; r++) {
                let runDistance = 0;
                let isRaceRun = (week === 20 && r === numRuns); // Last run of week 20 is the race!

                if (isRaceRun) {
                    runDistance = 42195; // Marathon distance in meters
                } else if (r === numRuns) {
                    // Weekend Long Run (e.g. 40% of weekly volume)
                    runDistance = remainingMeters * 0.45;
                    // Max long run cap around 20 miles (32km) or 22 miles (35km)
                    const maxLongRun = 35000;
                    if (runDistance > maxLongRun) runDistance = maxLongRun;
                } else {
                    // Midweek runs
                    runDistance = remainingMeters / (numRuns - r + 1.5);
                }

                remainingMeters -= runDistance;
                if (runDistance < 2000) runDistance = 2000; // Minimum 2km run

                // Calculate run date
                const runDayOffset = daysOffsetStart - Math.floor((r - 1) * (7 / numRuns));
                const runDate = new Date(raceDateObj.getTime());
                runDate.setDate(raceDateObj.getDate() - runDayOffset);
                // Set to morning
                runDate.setHours(8, 0, 0, 0);

                // Speed variations: long runs slightly slower, speed sessions faster, race pace in between
                let speedMps = cycle.avgPaceMps;
                let runName = 'Easy Run';

                if (isRaceRun) {
                    speedMps = cycle.avgPaceMps * 1.05; // Race adrenaline!
                    runName = cycle.name;
                } else if (r === numRuns) {
                    // Long Run
                    speedMps = cycle.avgPaceMps * 0.93; // 7% slower
                    runName = 'Long Run';
                } else if (r === 2 && numRuns >= 4) {
                    // Interval/Speed session
                    speedMps = cycle.avgPaceMps * 1.15; // 15% faster
                    runName = 'Interval Training';
                } else if (r === 1) {
                    runName = 'Recovery Run';
                    speedMps = cycle.avgPaceMps * 0.88; // 12% slower
                } else {
                    runName = 'Tempo Run';
                    speedMps = cycle.avgPaceMps * 1.02; // 2% faster
                }

                // Add elevation gain (mock)
                const elevationGain = Math.floor(runDistance * 0.005 + Math.random() * 50);

                const movingTime = Math.round(runDistance / speedMps);

                activities.push({
                    id: Math.floor(Math.random() * 1000000000),
                    name: runName,
                    distance: runDistance,
                    moving_time: movingTime,
                    elapsed_time: movingTime + Math.floor(Math.random() * 120), // slight stop time
                    total_elevation_gain: elevationGain,
                    start_date_local: runDate.toISOString(),
                    average_speed: speedMps,
                    max_speed: speedMps * 1.3
                });
            }
        }
    });

    console.log(`Generated ${activities.length} mock activities in total.`);
}

// Render Block Manager checklist in Sidebar
function renderBlockManager() {
    blocksList.innerHTML = '';
    
    trainingBlocks.forEach((block) => {
        const item = document.createElement('div');
        item.className = 'block-item';
        item.style.borderColor = block.selected ? block.color : 'var(--border-color)';
        
        // Format date
        const dateStr = new Date(block.raceDate).toLocaleDateString(undefined, { 
            year: 'numeric', month: 'short', day: 'numeric' 
        });

        // Calculate prediction for the sidebar preview
        const blockData = processBlock(block);
        const pred = calculatePrediction(blockData.summary, block.name, block);
        const predTimeStr = formatDuration(Math.round(pred.predictedTimeSeconds));

        item.innerHTML = `
            <div class="block-item-left">
                <input type="checkbox" class="block-checkbox" ${block.selected ? 'checked' : ''} data-id="${block.id}">
                <span class="block-color-indicator" style="background-color: ${block.color}"></span>
                <div class="block-info-text">
                    <span class="block-title">${block.name}</span>
                    <span class="block-date">Race: ${dateStr}</span>
                    <span class="block-est-time" style="font-size: 0.75rem; font-weight: 600; color: ${block.color}; margin-top: 0.15rem; display: block;">Est: ${predTimeStr}</span>
                </div>
            </div>
            <div class="block-item-actions">
                <button class="btn-edit-block" data-id="${block.id}" title="Edit block">✏️</button>
                <button class="btn-delete-block" data-id="${block.id}" title="Delete block">✕</button>
            </div>
        `;

        // Handle checkbox toggling
        const checkbox = item.querySelector('.block-checkbox');
        checkbox.addEventListener('change', (e) => {
            block.selected = e.target.checked;
            saveBlocksToStorage();
            item.style.borderColor = block.selected ? block.color : 'var(--border-color)';
            updateDashboard();
        });

        // Handle edit button
        const editBtn = item.querySelector('.btn-edit-block');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditForm(block);
        });

        // Handle delete button (instant delete, no confirm popup to prevent popup blocking)
        const deleteBtn = item.querySelector('.btn-delete-block');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // If we are currently editing the block being deleted, reset the form
            if (editingBlockId === block.id) {
                resetBlockForm();
            }
            trainingBlocks = trainingBlocks.filter(b => b.id !== block.id);
            saveBlocksToStorage();
            renderBlockManager();
            updateDashboard();
        });

        blocksList.appendChild(item);
    });
}

// Process data for active training blocks and update charts & summary tables
function updateDashboard() {
    const selectedBlocks = trainingBlocks.filter(b => b.selected);
    
    if (selectedBlocks.length === 0) {
        // Show empty states
        destroyCharts();
        renderEmptyStateTable();
        renderEmptyStatePredictor();
        return;
    }

    // Compile 20-week training data for each selected block
    const blockData = selectedBlocks.map(block => processBlock(block));

    // Update Comparison Table
    renderComparisonTable(blockData);

    // Render Race Predictor Cards
    renderRacePredictor(blockData);

    // Render Charts
    renderWeeklyMileageChart(blockData);
    renderCumulativeMileageChart(blockData);
    renderLongRunChart(blockData);
    renderPaceChart(blockData);
    renderPaceDistributionChart(blockData);
}

// Process a training block: align runs to Week 1 to 20
function processBlock(block) {
    const raceDateObj = new Date(block.raceDate);
    const today = new Date();
    
    // Initialize 20 weeks
    const weeks = [];
    for (let w = 1; w <= 20; w++) {
        const weekStart = new Date(raceDateObj.getTime());
        weekStart.setDate(raceDateObj.getDate() - (21 - w) * 7);
        weekStart.setHours(0, 0, 0, 0);
        
        weeks.push({
            weekNum: w,
            runs: [],
            totalDistance: 0, // meters (includes cross training)
            totalTime: 0, // seconds (includes cross training)
            longestRun: 0, // meters (includes cross training)
            averageSpeed: 0, // m/s (excludes cross training)
            isFuture: weekStart > today
        });
    }

    // Filter runs in the 20-week window
    const startWindow = new Date(raceDateObj.getTime());
    startWindow.setDate(raceDateObj.getDate() - 140);
    startWindow.setHours(0, 0, 0, 0);

    const endWindow = new Date(raceDateObj.getTime());
    endWindow.setHours(23, 59, 59, 999);

    const blockRuns = activities.filter(run => {
        const runDate = new Date(run.start_date_local);
        return runDate >= startWindow && runDate <= endWindow;
    });

    // Map runs to weeks (Week 1 to Week 20)
    blockRuns.forEach(run => {
        const runDate = new Date(run.start_date_local);
        const diffTime = endWindow.getTime() - runDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        if (diffDays >= 0 && diffDays < 140) {
            const weekIndex = 20 - Math.floor(diffDays / 7);
            
            if (weekIndex >= 1 && weekIndex <= 20) {
                const w = weeks[weekIndex - 1];
                w.runs.push(run);
                w.totalDistance += run.distance;
                w.totalTime += run.moving_time;
                if (run.distance > w.longestRun) {
                    w.longestRun = run.distance;
                }
            }
        }
    });

    // Calculate weekly speeds (excluding runs slower than 9 min/mile, i.e., average_speed < 2.980265)
    weeks.forEach(w => {
        const runningRuns = w.runs.filter(r => r.average_speed && r.average_speed >= 2.980265);
        const runningDistance = runningRuns.reduce((sum, r) => sum + r.distance, 0);
        const runningTime = runningRuns.reduce((sum, r) => sum + r.moving_time, 0);
        
        if (runningDistance > 0 && runningTime > 0) {
            w.averageSpeed = runningDistance / runningTime;
        } else {
            w.averageSpeed = 0;
        }
    });

    // Block summary metrics calculations
    const totalDistance = weeks.reduce((sum, w) => sum + w.totalDistance, 0);
    const totalTime = weeks.reduce((sum, w) => sum + w.totalTime, 0);
    const totalRuns = weeks.reduce((sum, w) => sum + w.runs.length, 0);
    
    // Average Running Pace (excludes cross training runs)
    const blockRunningRuns = blockRuns.filter(r => r.average_speed && r.average_speed >= 2.980265);
    const blockRunningDistance = blockRunningRuns.reduce((sum, r) => sum + r.distance, 0);
    const blockRunningTime = blockRunningRuns.reduce((sum, r) => sum + r.moving_time, 0);
    const avgPaceMps = blockRunningTime > 0 ? (blockRunningDistance / blockRunningTime) : 0;
    
    // Average Heart Rate (includes all runs that have HR data)
    const hrRuns = blockRuns.filter(r => r.has_heartrate && r.average_heartrate > 0);
    const avgHeartRate = hrRuns.length > 0
        ? Math.round(hrRuns.reduce((sum, r) => sum + r.average_heartrate, 0) / hrRuns.length)
        : null;

    // Peak Mileage week
    let peakDistance = 0;
    let peakWeekNum = 0;
    weeks.forEach(w => {
        if (w.totalDistance > peakDistance) {
            peakDistance = w.totalDistance;
            peakWeekNum = w.weekNum;
        }
    });

    // Find the longest run of the target race/event day regardless of distance
    const raceDayStart = new Date(raceDateObj.getTime());
    raceDayStart.setHours(0, 0, 0, 0);
    const raceDayEnd = new Date(raceDateObj.getTime());
    raceDayEnd.setHours(23, 59, 59, 999);

    const raceDayRuns = blockRuns.filter(run => {
        const runDate = new Date(run.start_date_local);
        return runDate >= raceDayStart && runDate <= raceDayEnd;
    });

    const raceActivity = raceDayRuns.length > 0
        ? raceDayRuns.reduce((longest, current) => current.distance > longest.distance ? current : longest, raceDayRuns[0])
        : null;

    const peakLongRunDistance = Math.max(...weeks.map(w => w.longestRun));

    return {
        block,
        weeks,
        summary: {
            totalDistance,
            totalTime,
            totalRuns,
            avgWeeklyDistance: totalDistance / 20,
            peakDistance,
            peakWeekNum,
            peakLongRunDistance,
            avgPaceMps,
            avgHeartRate,
            raceActivity,
            weeks
        }
    };
}

// Render empty state table when no blocks are selected
function renderEmptyStateTable() {
    comparisonTableHeaders.innerHTML = '<th>Metric</th>';
    comparisonTableBody.innerHTML = `
        <tr>
            <td colspan="2" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                No training blocks selected. Please check at least one block in the sidebar.
            </td>
        </tr>
    `;
}

// Render Side-by-Side Summary Table
function renderComparisonTable(blockData) {
    // 1. Setup headers
    let headersHtml = '<th>Metric</th>';
    blockData.forEach(data => {
        headersHtml += `
            <th style="border-bottom: 2px solid ${data.block.color}cc">
                <div class="table-header-content">
                    <span class="table-header-name" style="color: ${data.block.color}">${data.block.name}</span>
                    <div class="table-header-actions">
                        <button class="btn-table-edit" data-id="${data.block.id}" title="Edit block">✏️ Edit</button>
                        <button class="btn-table-delete" data-id="${data.block.id}" title="Delete block">✕ Delete</button>
                    </div>
                </div>
            </th>
        `;
    });
    comparisonTableHeaders.innerHTML = headersHtml;

    // Attach click listeners to table header edit/delete buttons
    blockData.forEach(data => {
        const thElement = comparisonTableHeaders.querySelector(`.btn-table-edit[data-id="${data.block.id}"]`).closest('th');
        
        thElement.querySelector('.btn-table-edit').addEventListener('click', () => {
            openEditForm(data.block);
        });

        thElement.querySelector('.btn-table-delete').addEventListener('click', () => {
            if (editingBlockId === data.block.id) {
                resetBlockForm();
            }
            trainingBlocks = trainingBlocks.filter(b => b.id !== data.block.id);
            saveBlocksToStorage();
            renderBlockManager();
            updateDashboard();
        });
    });

    // 2. Setup rows
    const unit = getDistanceUnit();
    const rows = [
        {
            label: 'Block Status',
            valFunc: (d) => {
                const today = new Date();
                const raceDateObj = new Date(d.block.raceDate);
                const startWindow = new Date(raceDateObj.getTime());
                startWindow.setDate(raceDateObj.getDate() - 140);
                
                if (today > raceDateObj) {
                    return '<span style="color: var(--text-secondary)">Completed</span>';
                } else if (today < startWindow) {
                    const daysToStart = Math.ceil((startWindow - today) / (1000 * 60 * 60 * 24));
                    return `<span style="color: var(--strava-orange)">Starts in ${daysToStart} days</span>`;
                } else {
                    const diffTime = raceDateObj.getTime() - today.getTime();
                    const diffDays = diffTime / (1000 * 60 * 60 * 24);
                    const currentWeek = 20 - Math.floor(diffDays / 7);
                    return `<span style="color: var(--success); font-weight: 600;">Week ${currentWeek} of 20 (In Progress)</span>`;
                }
            }
        },
        {
            label: 'Total Distance',
            valFunc: (d) => `<span class="highlight-val">${convertDistance(d.summary.totalDistance).toFixed(1)}</span> ${unit}`
        },
        {
            label: 'Avg. Weekly Distance',
            valFunc: (d) => `${convertDistance(d.summary.avgWeeklyDistance).toFixed(1)} ${unit} / wk`
        },
        {
            label: 'Peak Week Volume',
            valFunc: (d) => `<span class="highlight-val">${convertDistance(d.summary.peakDistance).toFixed(1)}</span> ${unit} <span style="font-size: 0.75rem; color: var(--text-muted)">(Week ${d.summary.peakWeekNum})</span>`
        },
        {
            label: 'Total Runs Done',
            valFunc: (d) => `${d.summary.totalRuns} runs`
        },
        {
            label: 'Average Running Pace',
            valFunc: (d) => `${formatPace(d.summary.avgPaceMps)} / ${unit}`
        },
        {
            label: isMetric ? 'Long Runs (≥15 / ≥20 / ≥25 / ≥30 km)' : 'Long Runs (≥10 / ≥15 / ≥20 / ≥25 mi)',
            valFunc: (d) => {
                let count1, count2, count3, count4;
                if (isMetric) {
                    // 15km = 15000m, 20km = 20000m, 25km = 25000m, 30km = 30000m
                    count1 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => r.distance >= 15000).length, 0);
                    count2 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => r.distance >= 20000).length, 0);
                    count3 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => r.distance >= 25000).length, 0);
                    count4 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => r.distance >= 30000).length, 0);
                } else {
                    // 10mi = 16093.4m, 15mi = 24140.2m, 20mi = 32186.8m, 25mi = 40233.6m
                    count1 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => metersToMiles(r.distance) >= 10).length, 0);
                    count2 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => metersToMiles(r.distance) >= 15).length, 0);
                    count3 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => metersToMiles(r.distance) >= 20).length, 0);
                    count4 = d.weeks.reduce((sum, w) => sum + w.runs.filter(r => metersToMiles(r.distance) >= 25).length, 0);
                }
                return `<span class="highlight-val">${count1}</span> / <span class="highlight-val">${count2}</span> / <span class="highlight-val">${count3}</span> / <span class="highlight-val">${count4}</span>`;
            }
        },
        {
            label: 'Elevation Gain',
            valFunc: (d) => {
                const totalMeters = d.weeks.reduce((sum, w) => sum + w.runs.reduce((s, r) => s + r.total_elevation_gain, 0), 0);
                return isMetric 
                    ? `${totalMeters.toLocaleString()} m` 
                    : `${Math.round(totalMeters * 3.28084).toLocaleString()} ft`;
            }
        },
        {
            label: 'Avg. Heart Rate',
            valFunc: (d) => d.summary.avgHeartRate ? `${d.summary.avgHeartRate} bpm` : '<span style="color: var(--text-muted)">-- bpm</span>'
        },
        {
            label: 'Target Day Performance',
            valFunc: (d) => {
                const race = d.summary.raceActivity;
                if (!race) return '<span style="color: var(--text-muted)">No run recorded on target day</span>';
                
                const isCrossTraining = (race.distance / race.moving_time) < 2.980265;
                const timeStr = formatDuration(race.moving_time);
                const distStr = convertDistance(race.distance).toFixed(2);
                const paceStr = isCrossTraining ? '' : ` @ ${formatPace(race.distance / race.moving_time)}/${unit}`;
                return `<strong style="color: var(--success);">${timeStr}</strong> (${distStr} ${unit}${paceStr})`;
            }
        }
    ];

    let bodyHtml = '';
    rows.forEach(row => {
        bodyHtml += `<tr><td>${row.label}</td>`;
        blockData.forEach(data => {
            bodyHtml += `<td>${row.valFunc(data)}</td>`;
        });
        bodyHtml += `</tr>`;
    });
    comparisonTableBody.innerHTML = bodyHtml;
}

// Format seconds to h:mm:ss
function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    const minutesStr = minutes < 10 && hours > 0 ? '0' + minutes : minutes;
    const secondsStr = seconds < 10 ? '0' + seconds : seconds;
    
    if (hours > 0) {
        return `${hours}:${minutesStr}:${secondsStr}`;
    }
    return `${minutesStr}:${secondsStr}`;
}

// Destroy all charts before rendering
function destroyCharts() {
    if (weeklyMileageChart) weeklyMileageChart.destroy();
    if (cumulativeMileageChart) cumulativeMileageChart.destroy();
    if (longRunChart) longRunChart.destroy();
    if (paceChart) paceChart.destroy();
    if (paceDistributionChart) paceDistributionChart.destroy();
}

// Shared Chart.js styling configurations
const chartGridStyle = {
    color: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)'
};

const getChartOptions = (yLabel, unit, formatYValFunc = (v) => v) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false // We use our sidebar checkboxes + custom colors as the legend
        },
        tooltip: {
            backgroundColor: 'rgba(15, 15, 25, 0.95)',
            titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
            bodyFont: { family: 'Outfit', size: 12 },
            borderColor: 'rgba(252, 76, 2, 0.2)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
                title: (context) => `Training Week ${context[0].label}`,
                label: (context) => {
                    const blockName = context.dataset.label;
                    const val = context.parsed.y;
                    return ` ${blockName}: ${formatYValFunc(val)} ${unit}`;
                }
            }
        }
    },
    scales: {
        x: {
            grid: chartGridStyle,
            ticks: {
                color: '#6b7280',
                font: { family: 'Outfit', size: 11 }
            },
            title: {
                display: true,
                text: 'Weeks leading to Race',
                color: '#6b7280',
                font: { family: 'Outfit', size: 12, weight: 'semibold' }
            }
        },
        y: {
            grid: chartGridStyle,
            ticks: {
                color: '#6b7280',
                font: { family: 'Outfit', size: 11 }
            },
            title: {
                display: true,
                text: yLabel,
                color: '#6b7280',
                font: { family: 'Outfit', size: 12, weight: 'semibold' }
            }
        }
    }
});

// Render Chart 1: Weekly Mileage Progression
function renderWeeklyMileageChart(blockData) {
    if (weeklyMileageChart) weeklyMileageChart.destroy();

    const unit = getDistanceUnit();
    const datasets = blockData.map(data => ({
        label: data.block.name,
        data: data.weeks.map(w => w.isFuture ? null : convertDistance(w.totalDistance)),
        borderColor: data.block.color,
        backgroundColor: data.block.color + '15',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: data.block.color,
        pointHoverRadius: 6
    }));

    const ctx = document.getElementById('weekly-mileage-chart').getContext('2d');
    
    // Update heading label units
    document.querySelector('#weekly-mileage-chart').closest('.chart-card').querySelector('.chart-unit').textContent = `${unit.toUpperCase()} / WEEK`;

    weeklyMileageChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: 20 }, (_, i) => i + 1),
            datasets: datasets
        },
        options: getChartOptions('Weekly Distance', unit, (val) => val.toFixed(1))
    });
}

// Render Chart 2: Cumulative Mileage Builder
function renderCumulativeMileageChart(blockData) {
    if (cumulativeMileageChart) cumulativeMileageChart.destroy();

    const unit = getDistanceUnit();
    const datasets = blockData.map(data => {
        let runningSum = 0;
        const cumulativeData = data.weeks.map(w => {
            if (w.isFuture) return null;
            runningSum += convertDistance(w.totalDistance);
            return runningSum;
        });

        return {
            label: data.block.name,
            data: cumulativeData,
            borderColor: data.block.color,
            borderWidth: 3,
            tension: 0.2,
            pointBackgroundColor: data.block.color,
            pointHoverRadius: 6,
            fill: false
        };
    });

    const ctx = document.getElementById('cumulative-mileage-chart').getContext('2d');
    
    // Update heading label units
    document.querySelector('#cumulative-mileage-chart').closest('.chart-card').querySelector('.chart-unit').textContent = `TOTAL ${unit.toUpperCase()}`;

    cumulativeMileageChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: 20 }, (_, i) => i + 1),
            datasets: datasets
        },
        options: getChartOptions('Cumulative Volume', unit, (val) => val.toFixed(1))
    });
}

// Render Chart 3: Weekly Long Run
function renderLongRunChart(blockData) {
    if (longRunChart) longRunChart.destroy();

    const unit = getDistanceUnit();
    const datasets = blockData.map(data => ({
        label: data.block.name,
        data: data.weeks.map(w => w.isFuture ? null : convertDistance(w.longestRun)),
        borderColor: data.block.color,
        backgroundColor: data.block.color + '18',
        borderWidth: 2.5,
        tension: 0.15,
        pointBackgroundColor: data.block.color,
        pointHoverRadius: 6,
        fill: false
    }));

    const ctx = document.getElementById('long-run-chart').getContext('2d');

    // Update heading label units
    document.querySelector('#long-run-chart').closest('.chart-card').querySelector('.chart-unit').textContent = `LONGEST RUN (${unit.toUpperCase()})`;

    longRunChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: 20 }, (_, i) => i + 1),
            datasets: datasets
        },
        options: getChartOptions('Long Run Distance', unit, (val) => val.toFixed(1))
    });
}

// Render Chart 4: Pace Trends
function renderPaceChart(blockData) {
    if (paceChart) paceChart.destroy();

    const unit = getDistanceUnit();
    const datasets = blockData.map(data => {
        // Convert average speed (m/s) to minutes per mile/km
        const paceData = data.weeks.map(w => {
            if (w.isFuture) return null;
            if (w.averageSpeed === 0) return null;
            const speedMps = w.averageSpeed;
            // Decimal minutes
            return isMetric ? (16.6667 / speedMps) : (26.8224 / speedMps);
        });

        return {
            label: data.block.name,
            data: paceData,
            borderColor: data.block.color,
            borderWidth: 3,
            tension: 0.3,
            pointBackgroundColor: data.block.color,
            pointHoverRadius: 6,
            spanGaps: true,
            fill: false
        };
    });

    const ctx = document.getElementById('pace-chart').getContext('2d');

    // Update heading label units
    document.querySelector('#pace-chart').closest('.chart-card').querySelector('.chart-unit').textContent = `MIN / ${unit.toUpperCase()}`;

    paceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: 20 }, (_, i) => i + 1),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 15, 25, 0.95)',
                    titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
                    bodyFont: { family: 'Outfit', size: 12 },
                    borderColor: 'rgba(252, 76, 2, 0.2)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        title: (context) => `Training Week ${context[0].label}`,
                        label: (context) => {
                            const blockName = context.dataset.label;
                            const decimalPace = context.parsed.y;
                            
                            const minutes = Math.floor(decimalPace);
                            const seconds = Math.round((decimalPace - minutes) * 60);
                            const formattedSeconds = seconds < 10 ? '0' + seconds : (seconds === 60 ? '00' : seconds);
                            const displayMinutes = seconds === 60 ? minutes + 1 : minutes;

                            return ` ${blockName}: ${displayMinutes}:${formattedSeconds} /${unit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: chartGridStyle,
                    ticks: {
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 11 }
                    },
                    title: {
                        display: true,
                        text: 'Weeks leading to Race',
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 12, weight: 'semibold' }
                    }
                },
                y: {
                    grid: chartGridStyle,
                    ticks: {
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 11 },
                        // Invert pace scale so faster pace (smaller numbers like 6:00) is higher on the chart
                        reverse: true,
                        callback: function(value) {
                            const minutes = Math.floor(value);
                            const seconds = Math.round((value - minutes) * 60);
                            const paddedSeconds = seconds < 10 ? '0' + seconds : (seconds === 60 ? '00' : seconds);
                            const displayMinutes = seconds === 60 ? minutes + 1 : minutes;
                            return `${displayMinutes}:${paddedSeconds}`;
                        }
                    },
                    title: {
                        display: true,
                        text: 'Average Pace',
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 12, weight: 'semibold' }
                    }
                }
            }
        }
    });
}

// Render empty state predictor message
function renderEmptyStatePredictor() {
    const grid = document.getElementById('predictor-grid');
    grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px;">
            No training blocks selected. Please check at least one block in the sidebar to view race predictions.
        </div>
    `;
}

// Render dynamic Race Predictor cards
function renderRacePredictor(blockData) {
    const grid = document.getElementById('predictor-grid');
    grid.innerHTML = '';

    blockData.forEach(data => {
        const block = data.block;
        const summary = data.summary;
        
        // Calculate dynamic mathematical predictions
        const pred = calculatePrediction(summary, block.name, block);
        
        const card = document.createElement('div');
        card.className = 'predictor-card';
        card.style.borderColor = block.color + '33';
        
        // Determine status
        const today = new Date();
        const raceDateObj = new Date(block.raceDate);
        const startWindow = new Date(raceDateObj.getTime());
        startWindow.setDate(raceDateObj.getDate() - 140);
        
        let statusClass = 'completed';
        let statusText = 'Completed';
        if (today < startWindow) {
            statusText = 'Future block';
        } else if (today <= raceDateObj) {
            statusClass = 'in-progress';
            statusText = 'In progress';
        }

        // Format target distance
        const targetDistKm = pred.targetDistance / 1000;
        const targetDistMiles = metersToMiles(pred.targetDistance);
        const targetDistStr = isMetric 
            ? `${targetDistKm.toFixed(1)} km` 
            : `${targetDistMiles.toFixed(1)} mi`;
        
        // Format predicted time and pace
        const predTimeStr = formatDuration(Math.round(pred.predictedTimeSeconds));
        const predPaceStr = formatPace(pred.targetDistance / pred.predictedTimeSeconds);
        
        // Predicted vs Actual scoreboard row
        let scoreboardHtml = `
            <div class="scoreboard-row">
                <span class="scoreboard-label">Predicted Time</span>
                <span class="scoreboard-time">${predTimeStr}</span>
            </div>
            <div class="scoreboard-row">
                <span class="scoreboard-label">Predicted Pace</span>
                <span class="scoreboard-pace">${predPaceStr}/${getDistanceUnit()}</span>
            </div>
        `;
        
        if (summary.raceActivity) {
            const actualTime = summary.raceActivity.elapsed_time;
            const actualTimeStr = formatDuration(actualTime);
            const diffSeconds = actualTime - pred.predictedTimeSeconds;
            const diffTimeStr = formatDuration(Math.abs(Math.round(diffSeconds)));
            const accuracy = (100 * (1 - Math.abs(diffSeconds) / actualTime)).toFixed(1);
            
            const isSlower = diffSeconds > 0;
            const badgeClass = isSlower ? 'slower' : 'faster';
            const badgeText = isSlower ? `+${diffTimeStr} slower` : `-${diffTimeStr} faster`;
            
            scoreboardHtml += `
                <div class="scoreboard-row" style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem; margin-top: 0.25rem;">
                    <span class="scoreboard-label">Actual Time</span>
                    <span class="scoreboard-pace" style="color: var(--success);">${actualTimeStr}</span>
                </div>
                <div class="scoreboard-row">
                    <span class="scoreboard-label">Accuracy & Delta</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-secondary);">${accuracy}%</span>
                        <span class="comparison-badge ${badgeClass}">${badgeText}</span>
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="predictor-card-header">
                <div>
                    <h3 class="predictor-card-title" style="color: ${block.color}">${block.name}</h3>
                    <p class="predictor-card-subtitle">Target: ${targetDistStr} event on ${new Date(block.raceDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <span class="predictor-badge ${statusClass}">${statusText}</span>
            </div>
            
            <div class="predictor-scoreboard-grid">
                ${scoreboardHtml}
            </div>
            
            <div class="predictor-gauges">
                <div class="gauge-row">
                    <div class="gauge-meta">
                        <span class="gauge-name">Endurance Rating</span>
                        <span class="gauge-percent">${Math.round(pred.enduranceRating * 100)}%</span>
                    </div>
                    <div class="gauge-track">
                        <div class="gauge-fill" style="width: ${pred.enduranceRating * 100}%; background-color: ${block.color};"></div>
                    </div>
                </div>
                
                <div class="gauge-row">
                    <div class="gauge-meta">
                        <span class="gauge-name">Weekly Volume Consistency</span>
                        <span class="gauge-percent">${Math.round(pred.volScore * 100)}%</span>
                    </div>
                    <div class="gauge-track">
                        <div class="gauge-fill" style="width: ${pred.volScore * 100}%; background-color: ${block.color};"></div>
                    </div>
                </div>
                
                <div class="gauge-row">
                    <div class="gauge-meta">
                        <span class="gauge-name">Peak Long Run Prep</span>
                        <span class="gauge-percent">${Math.round(pred.lrScore * 100)}%</span>
                    </div>
                    <div class="gauge-track">
                        <div class="gauge-fill" style="width: ${pred.lrScore * 100}%; background-color: ${block.color};"></div>
                    </div>
                </div>

                <div class="gauge-row">
                    <div class="gauge-meta">
                        <span class="gauge-name">Consistency Rating</span>
                        <span class="gauge-percent">${Math.round(pred.consistencyScore * 100)}%</span>
                    </div>
                    <div class="gauge-track">
                        <div class="gauge-fill" style="width: ${pred.consistencyScore * 100}%; background-color: ${block.color};"></div>
                    </div>
                </div>
            </div>
            
            <div class="insight-box" style="border-left-color: ${block.color};">
                ${pred.insight}
            </div>
        `;
        grid.appendChild(card);
    });
}

// Calculate target race distance from summary data and name hints
function getTargetDistance(summary, blockName, block) {
    if (block && block.targetDistance) {
        return block.targetDistance;
    }
    if (summary.raceActivity) {
        return summary.raceActivity.distance;
    }
    const nameLower = blockName.toLowerCase();
    if (nameLower.includes('50k')) return 50000;
    if (nameLower.includes('marathon') || nameLower.includes('42k') || nameLower.includes('26.2')) return 42195;
    if (nameLower.includes('half') || nameLower.includes('21k') || nameLower.includes('13.1')) return 21097.5;
    if (nameLower.includes('10k')) return 10000;
    if (nameLower.includes('5k')) return 5000;
    
    // Fallback based on longest run in block
    if (summary.peakLongRunDistance > 0) {
        const maxRun = summary.peakLongRunDistance;
        if (maxRun > 32000) return 42195;
        if (maxRun > 18000) return 21097.5;
        if (maxRun > 8000) return 10000;
        return 5000;
    }
    return 42195; // Default to Marathon
}

// Compile a virtual 20-week training block leading up to a specific historical date
function processVirtualBlock(activitiesList, raceDateStr) {
    const raceDateObj = new Date(raceDateStr);
    
    const weeks = Array.from({ length: 20 }, (_, i) => ({
        weekNum: i + 1,
        totalDistance: 0,
        totalTime: 0,
        longestRun: 0,
        runs: []
    }));
    
    const startWindow = new Date(raceDateObj.getTime());
    startWindow.setDate(raceDateObj.getDate() - 140);
    startWindow.setHours(0, 0, 0, 0);
    
    const endWindow = new Date(raceDateObj.getTime());
    endWindow.setHours(23, 59, 59, 999);
    
    // Exclude the actual race run on the race day to avoid counting the race itself as training
    const blockRuns = activitiesList.filter(run => {
        const runDate = new Date(run.start_date_local);
        const isActualRaceRun = Math.abs(runDate.getTime() - raceDateObj.getTime()) < 10000;
        return runDate >= startWindow && runDate <= endWindow && !isActualRaceRun;
    });
    
    blockRuns.forEach(run => {
        const runDate = new Date(run.start_date_local);
        const diffTime = endWindow.getTime() - runDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        
        if (diffDays >= 0 && diffDays < 140) {
            const weekIndex = 20 - Math.floor(diffDays / 7);
            if (weekIndex >= 1 && weekIndex <= 20) {
                const w = weeks[weekIndex - 1];
                w.runs.push(run);
                w.totalDistance += run.distance;
                w.totalTime += run.moving_time;
                if (run.distance > w.longestRun) {
                    w.longestRun = run.distance;
                }
            }
        }
    });
    
    const totalDistance = weeks.reduce((sum, w) => sum + w.totalDistance, 0);
    const avgWeeklyDistance = totalDistance / 20;
    const peakLongRunDistance = Math.max(...weeks.map(w => w.longestRun));
    
    // Consistency Score
    const activeWeeks = weeks.filter(w => w.runs.length >= 2).length;
    const activeWeeksRatio = activeWeeks / 20;
    
    const activeMileages = weeks.filter(w => w.totalDistance > 0).map(w => w.totalDistance);
    let varPenalty = 0;
    if (activeMileages.length > 1) {
        const avg = activeMileages.reduce((s, m) => s + m, 0) / activeMileages.length;
        const variance = activeMileages.reduce((sum, m) => sum + Math.pow(m - avg, 2), 0) / activeMileages.length;
        const stdDev = Math.sqrt(variance);
        varPenalty = Math.min(0.4, stdDev / (avg || 1));
    }
    const consistencyScore = Math.min(1.0, Math.max(0.0, activeWeeksRatio * (1 - varPenalty)));
    
    return {
        avgWeeklyDistance,
        peakLongRunDistance,
        consistencyScore
    };
}

function getDistanceForBracket(name) {
    if (name === '5K') return 5000;
    if (name === '10K') return 10000;
    if (name === 'Half') return 21097.5;
    if (name === 'Marathon') return 42195;
    if (name === '50K') return 50000;
    return 42195;
}

// Compute training quality score (Endurance Rating) from raw metrics
function getEnduranceRating(avgWeeklyDist, peakLongRun, consistencyScore, targetDist) {
    let recommendedVolume = 80000;
    let recommendedLongRun = 32000;
    
    if (targetDist <= 5000) {
        recommendedVolume = 24000;
        recommendedLongRun = 10000;
    } else if (targetDist <= 10000) {
        recommendedVolume = 40000;
        recommendedLongRun = 16000;
    } else if (targetDist <= 21100) {
        recommendedVolume = 56000;
        recommendedLongRun = 22000;
    } else if (targetDist <= 42200) {
        recommendedVolume = 80000;
        recommendedLongRun = 32000;
    } else {
        recommendedVolume = 96000;
        recommendedLongRun = 38000;
    }
    
    const volScore = Math.min(1.0, avgWeeklyDist / recommendedVolume);
    const lrScore = Math.min(1.0, peakLongRun / recommendedLongRun);
    return (volScore * 0.3) + (lrScore * 0.5) + (consistencyScore * 0.2);
}

// Calibrated Running Prediction Formula (Weighted Baseline Model)
function calculatePrediction(summary, blockName, block) {
    if (!summary) {
        summary = {
            totalDistance: 0,
            totalTime: 0,
            totalRuns: 0,
            avgWeeklyDistance: 0,
            peakDistance: 0,
            peakWeekNum: 0,
            peakLongRunDistance: 0,
            avgPaceMps: 0,
            avgHeartRate: null,
            raceActivity: null,
            weeks: []
        };
    }
    const targetDist = getTargetDistance(summary, blockName, block);
    const blockId = block ? block.id : null;
    const blockRaceDate = block ? block.raceDate : null;
    
    // Set target guidelines for Volume (meters/week) & Long Run (meters)
    let recommendedVolume = 80000; // 50 miles in meters
    let recommendedLongRun = 32000; // 20 miles in meters
    
    if (targetDist <= 5000) {
        recommendedVolume = 24000; // 15 mi
        recommendedLongRun = 10000; // 6 mi
    } else if (targetDist <= 10000) {
        recommendedVolume = 40000; // 25 mi
        recommendedLongRun = 16000; // 10 mi
    } else if (targetDist <= 21100) {
        recommendedVolume = 56000; // 35 mi
        recommendedLongRun = 22000; // 14 mi
    } else if (targetDist <= 42200) {
        recommendedVolume = 80000; // 50 mi
        recommendedLongRun = 32000; // 20 mi
    } else {
        recommendedVolume = 96000; // 60 mi
        recommendedLongRun = 38000; // 24 mi
    }
    
    // 1. Volume Score
    const avgWeeklyDist = summary.avgWeeklyDistance || 0;
    const volScore = Math.min(1.0, avgWeeklyDist / recommendedVolume);
    
    // 2. Long Run Score
    const peakLongRun = summary.peakLongRunDistance || 0;
    const lrScore = Math.min(1.0, peakLongRun / recommendedLongRun);
    
    // 3. Consistency Score
    const summaryWeeks = summary.weeks || [];
    const activeWeeks = summaryWeeks.filter(w => w.runs && w.runs.length >= 2).length;
    const activeWeeksRatio = activeWeeks / 20;
    
    const activeMileages = summaryWeeks.filter(w => w.totalDistance > 0).map(w => w.totalDistance);
    let varPenalty = 0;
    if (activeMileages.length > 1) {
        const avg = activeMileages.reduce((s, m) => s + m, 0) / activeMileages.length;
        const variance = activeMileages.reduce((sum, m) => sum + Math.pow(m - avg, 2), 0) / activeMileages.length;
        const stdDev = Math.sqrt(variance);
        varPenalty = Math.min(0.4, stdDev / (avg || 1));
    }
    const consistencyScore = Math.min(1.0, Math.max(0.0, activeWeeksRatio * (1 - varPenalty)));
    
    // 4. Overall Endurance Rating
    const enduranceRating = getEnduranceRating(avgWeeklyDist, peakLongRun, consistencyScore, targetDist);
    
    // 5. Gather Candidate Baselines
    let candidates = [];
    let baselineSource = '';
    
    if (baselineRaces.length > 0) {
        // Use ONLY user-defined benchmark races
        candidates = baselineRaces.map(r => ({
            name: r.name,
            date: r.date,
            distance: r.distance,
            elapsed_time: r.elapsed_time,
            speed: r.distance / r.elapsed_time, // Use elapsed_time!
            type: 'user-defined'
        }));
        baselineSource = 'user benchmark races';
    } else {
        // Fallback 1: Scan completed blocks for race activities
        trainingBlocks.forEach(b => {
            if (blockId && b.id === blockId) return;
            const data = processBlock(b);
            if (data.summary.raceActivity) {
                candidates.push({
                    name: b.name,
                    date: b.raceDate,
                    distance: data.summary.raceActivity.distance,
                    elapsed_time: data.summary.raceActivity.elapsed_time,
                    speed: data.summary.raceActivity.distance / data.summary.raceActivity.elapsed_time, // Use elapsed_time!
                    type: 'completed-block'
                });
            }
        });
        
        // Fallback 2: Scan all activities for best efforts in standard brackets (PR scan)
        if (candidates.length === 0) {
            const brackets = [
                { name: '5K', min: 4800, max: 6000 },
                { name: '10K', min: 9500, max: 12000 },
                { name: 'Half', min: 20000, max: 23000 },
                { name: 'Marathon', min: 40000, max: 45000 },
                { name: '50K', min: 48000, max: 55000 }
            ];
            
            brackets.forEach(br => {
                const runs = activities.filter(run => {
                    if (blockRaceDate) {
                        const raceDateObj = new Date(blockRaceDate);
                        const startWindow = new Date(raceDateObj.getTime());
                        startWindow.setDate(raceDateObj.getDate() - 140);
                        startWindow.setHours(0, 0, 0, 0);
                        const endWindow = new Date(raceDateObj.getTime());
                        endWindow.setHours(23, 59, 59, 999);
                        
                        const runDate = new Date(run.start_date_local);
                        if (runDate >= startWindow && runDate <= endWindow) return false;
                    }
                    return run.distance >= br.min && run.distance <= br.max;
                });
                
                if (runs.length > 0) {
                    // Sort by average speed calculated from elapsed_time descending!
                    runs.sort((a, b) => (b.distance / b.elapsed_time) - (a.distance / a.elapsed_time));
                    const bestRun = runs[0];
                    candidates.push({
                        name: bestRun.name,
                        date: bestRun.start_date_local,
                        distance: bestRun.distance,
                        elapsed_time: bestRun.elapsed_time,
                        speed: bestRun.distance / bestRun.elapsed_time, // Use elapsed_time!
                        type: 'historical-PR'
                    });
                }
            });
            baselineSource = 'all-time history PRs';
        } else {
            baselineSource = 'completed blocks';
        }
    }
    
    // 6. Calculate Weighted Speed Prediction
    let predictedSpeed = 0;
    let baselineDetailsHtml = '';
    const unitStr = getDistanceUnit();
    
    if (candidates.length > 0) {
        let speedWeightSum = 0;
        let weightSum = 0;
        const detailsList = [];
        
        candidates.forEach(c => {
            // Process virtual training block for this baseline run
            const vBlock = processVirtualBlock(activities, c.date);
            const baselineTQ = getEnduranceRating(
                vBlock.avgWeeklyDistance,
                vBlock.peakLongRunDistance,
                vBlock.consistencyScore,
                c.distance
            );
            
            // Scale historical speed to target distance (Riegel fatigue exponent 0.06)
            const riegelExponent = 0.06;
            const scaledSpeed = c.speed * Math.pow(c.distance / targetDist, riegelExponent);
            
            // Adjust by relative training quality
            const ratio = enduranceRating / (baselineTQ || 0.5);
            // Scales from -15% to +10% based on relative training quality ratio
            const speedAdjustment = 1.0 + Math.min(0.10, Math.max(-0.15, 0.12 * (ratio - 1)));
            
            const candidatePredictedSpeed = scaledSpeed * speedAdjustment;
            
            // Weight based on distance proximity (exponential decay)
            const weight = Math.exp(-2.0 * Math.abs(c.distance - targetDist) / targetDist);
            
            speedWeightSum += candidatePredictedSpeed * weight;
            weightSum += weight;
            
            detailsList.push({
                name: c.name,
                weight: weight,
                distFormatted: isMetric ? `${(c.distance / 1000).toFixed(1)}k` : `${metersToMiles(c.distance).toFixed(1)}m`,
                pace: formatPace(c.speed)
            });
        });
        
        predictedSpeed = speedWeightSum / weightSum;
        
        // Render weighted details showing active percentages
        const totalWeight = detailsList.reduce((s, d) => s + d.weight, 0);
        detailsList.forEach(d => {
            const pct = Math.round((d.weight / totalWeight) * 100);
            if (pct >= 5) { // Only show baselines contributing at least 5% weight
                if (baselineDetailsHtml) baselineDetailsHtml += ', ';
                baselineDetailsHtml += `${d.name} (${d.distFormatted} at ${d.pace} pace, Weight: ${pct}%)`;
            }
        });
    } else {
        // Ultimate Fallback: Training average
        let avgSpeed = summary.avgPaceMps;
        if (!avgSpeed || isNaN(avgSpeed)) {
            const validRuns = activities.filter(r => r.average_speed > 0);
            avgSpeed = validRuns.length > 0 
                ? validRuns.reduce((sum, r) => sum + r.average_speed, 0) / validRuns.length
                : 3.0;
        }
        
        const speedAdjustment = 0.92 + (0.23 * enduranceRating);
        const totalDist = summary.totalDistance;
        const totalRuns = summary.totalRuns;
        const avgRunDist = totalRuns > 0 ? totalDist / totalRuns : 8000;
        const riegelExponent = 0.05 + (0.07 * (1 - enduranceRating));
        const riegelFactor = Math.pow(avgRunDist / targetDist, riegelExponent);
        
        predictedSpeed = avgSpeed * speedAdjustment * riegelFactor;
        baselineDetailsHtml = `fallback all-time training average (${formatPace(avgSpeed)}/${unitStr})`;
    }
    
    const predictedTimeSeconds = targetDist / predictedSpeed;
    
    // Insights text
    let insight = '';
    const peakLongRunStr = convertDistance(summary.peakLongRunDistance || 0).toFixed(1);
    const avgWeeklyVolumeStr = Math.round(convertDistance(summary.avgWeeklyDistance));
    
    if (summary.totalRuns === 0) {
        insight = `<strong>No training runs recorded yet.</strong> Prediction is based on your historical baseline profile assuming standard training targets.`;
    } else if (enduranceRating > 0.82) {
        insight = `<strong>Excellent Preparation!</strong> Your weekly volume is highly solid (average ${avgWeeklyVolumeStr} ${unitStr}/wk) and consistency is outstanding (${Math.round(consistencyScore*100)}%). A peak long run of ${peakLongRunStr} ${unitStr} has built excellent aerobic capacity. You are fully on track to achieve or exceed your target!`;
    } else if (enduranceRating > 0.65) {
        insight = `<strong>Good Foundations.</strong> Balanced mileage and solid long run preparation (${peakLongRunStr} ${unitStr}). Your consistency is stable (${Math.round(consistencyScore*100)}%). To push to the next level, focus on stabilizing weekly variations and adding slightly more easy aerobic volume.`;
    } else if (enduranceRating > 0.45) {
        insight = `<strong>Moderate Training Depth.</strong> Your peak long run of ${peakLongRunStr} ${unitStr} is decent, but your average weekly volume of ${avgWeeklyVolumeStr} ${unitStr}/wk is thin for a target of this distance. Expect muscle fatigue in the final third of the race. Increase your baseline mileage next block.`;
    } else {
        insight = `<strong>Under-Prepared.</strong> Weekly average mileage of ${avgWeeklyVolumeStr} ${unitStr}/wk and peak long runs are below optimal guidelines for this target distance. There is a high risk of hitting the wall. Consider scaling back your target race pace or choosing a shorter race distance.`;
    }

    insight += `<br><br><span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; display: block; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 0.5rem; margin-top: 0.5rem;">Baseline Model (${baselineSource}): ${baselineDetailsHtml}</span>`;
    
    return {
        targetDistance: targetDist,
        predictedTimeSeconds,
        enduranceRating,
        volScore,
        lrScore,
        consistencyScore,
        insight
    };
}

// Save benchmark races to localStorage
function saveBaselineRacesToStorage() {
    localStorage.setItem('baselineRaces', JSON.stringify(baselineRaces));
}

// Render the list of added baseline races in the sidebar
function renderBaselineRaces() {
    const list = document.getElementById('baseline-races-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (baselineRaces.length === 0) {
        list.innerHTML = `
            <div style="color: var(--text-muted); font-size: 0.75rem; text-align: center; padding: 0.75rem; border: 1px dashed var(--border-color); border-radius: 8px;">
                No benchmark races added. Standard PR search will be used as a fallback.
            </div>
        `;
        return;
    }
    
    baselineRaces.forEach(race => {
        const dateStr = new Date(race.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const distStr = isMetric 
            ? `${(race.distance / 1000).toFixed(2)} km` 
            : `${metersToMiles(race.distance).toFixed(2)} mi`;
        const timeStr = formatDuration(race.elapsed_time);
        
        const item = document.createElement('div');
        item.className = 'baseline-race-item';
        item.innerHTML = `
            <div class="baseline-race-info">
                <span class="baseline-race-name">${race.name}</span>
                <span class="baseline-race-meta">${dateStr} | ${distStr} | Time: ${timeStr}</span>
            </div>
            <button class="btn-delete-baseline" data-id="${race.id}" title="Remove benchmark">✕</button>
        `;
        
        item.querySelector('.btn-delete-baseline').addEventListener('click', () => {
            baselineRaces = baselineRaces.filter(r => r.id !== race.id);
            saveBaselineRacesToStorage();
            renderBaselineRaces();
            updateDashboard();
            
            // Force refresh block manager sidebar preview times
            renderBlockManager();
        });
        
        list.appendChild(item);
    });
}

// Generate simulated individual kilometer splits for a run to get realistic kilometer-by-kilometer pace distribution
function getSplitPaces(runDistanceM, movingTimeS) {
    if (runDistanceM <= 0 || movingTimeS <= 0) return [];
    
    const totalKm = runDistanceM / 1000;
    const numSplits = Math.ceil(totalKm);
    
    const splits = [];
    let remainingDistance = runDistanceM;
    
    for (let i = 0; i < numSplits; i++) {
        const splitDist = Math.min(1000, remainingDistance);
        splits.push({
            distance: splitDist,
            weight: 0,
            time: 0
        });
        remainingDistance -= splitDist;
    }
    
    let weightSum = 0;
    splits.forEach(s => {
        // Vary pace by +/- 8% around average
        const varianceFactor = 1.0 + (Math.random() - 0.5) * 0.16;
        s.weight = (s.distance / 1000) * varianceFactor;
        weightSum += s.weight;
    });
    
    splits.forEach(s => {
        s.time = movingTimeS * (s.weight / weightSum);
    });
    
    return splits.map(s => s.distance / s.time);
}

// Group training run kilometers into 30-second pace buckets for an area distribution chart
// Group training run kilometers into 30-second pace buckets for an area distribution chart (normalized to % of total running mileage)
function getPaceDistributionData(blockData) {
    const isMetricUnit = isMetric;
    const buckets = [];
    
    if (isMetricUnit) {
        // min/km buckets: <3:30, 3:30-4:00, ..., 6:30-7:00, >7:00
        buckets.push({ label: '< 3:30', min: 0, max: 3.5 });
        for (let m = 3.5; m < 7.0; m += 0.5) {
            const next = m + 0.5;
            const minStr = formatDecimalMinutes(m);
            const maxStr = formatDecimalMinutes(next);
            buckets.push({ label: `${minStr} - ${maxStr}`, min: m, max: next });
        }
        buckets.push({ label: '> 7:00', min: 7.0, max: 999 });
    } else {
        // min/mi buckets: <5:30, 5:30-6:00, ..., 9:00-9:30, >9:30
        buckets.push({ label: '< 5:30', min: 0, max: 5.5 });
        for (let m = 5.5; m < 9.5; m += 0.5) {
            const next = m + 0.5;
            const minStr = formatDecimalMinutes(m);
            const maxStr = formatDecimalMinutes(next);
            buckets.push({ label: `${minStr} - ${maxStr}`, min: m, max: next });
        }
        buckets.push({ label: '> 9:30', min: 9.5, max: 999 });
    }
    
    function formatDecimalMinutes(decimal) {
        const mins = Math.floor(decimal);
        const secs = Math.round((decimal - mins) * 60);
        return `${mins}:${secs < 10 ? '0' + secs : (secs === 60 ? '00' : secs)}`;
    }
    
    const datasets = blockData.map(data => {
        const counts = Array(buckets.length).fill(0);
        
        data.weeks.forEach(w => {
            w.runs.forEach(run => {
                // Ignore runs slower than 9 min/mile for pace profile (cross training runs have no running pace profile)
                if (run.average_speed < 2.980265) return;
                
                const splitSpeeds = getSplitPaces(run.distance, run.moving_time);
                
                splitSpeeds.forEach((speed, idx) => {
                    const isLast = idx === splitSpeeds.length - 1;
                    const splitDistM = isLast ? (run.distance - idx * 1000) : 1000;
                    const splitDistConverted = convertDistance(splitDistM);
                    
                    const paceDecimal = isMetricUnit ? (16.6667 / speed) : (26.8224 / speed);
                    
                    for (let b = 0; b < buckets.length; b++) {
                        const bucket = buckets[b];
                        if (paceDecimal >= bucket.min && paceDecimal < bucket.max) {
                            counts[b] += splitDistConverted;
                            break;
                        }
                    }
                });
            });
        });
        
        // Normalize counts to percentage of total running mileage in this block
        const totalBlockRunningDist = counts.reduce((sum, val) => sum + val, 0);
        const percentages = counts.map(val => 
            totalBlockRunningDist > 0 ? parseFloat(((val / totalBlockRunningDist) * 100).toFixed(1)) : 0
        );
        
        return {
            label: data.block.name,
            data: percentages,
            borderColor: data.block.color,
            backgroundColor: data.block.color + '22',
            borderWidth: 2.5,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: data.block.color,
            pointHoverRadius: 5
        };
    });
    
    return {
        labels: buckets.map(b => b.label),
        datasets: datasets
    };
}

// Render Chart 5: Pace Distribution (Histogram Area Chart)
function renderPaceDistributionChart(blockData) {
    if (paceDistributionChart) paceDistributionChart.destroy();

    const dataObj = getPaceDistributionData(blockData);

    const ctx = document.getElementById('pace-distribution-chart').getContext('2d');
    document.getElementById('pace-distribution-unit').textContent = `% OF RUNNING MILEAGE`;

    paceDistributionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataObj.labels,
            datasets: dataObj.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#9ca3af',
                        font: { family: 'Outfit', size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 15, 25, 0.95)',
                    titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
                    bodyFont: { family: 'Outfit', size: 12 },
                    borderColor: 'rgba(252, 76, 2, 0.2)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        title: (context) => `Pace Bucket: ${context[0].label}`,
                        label: (context) => {
                            const blockName = context.dataset.label;
                            const pctVal = context.parsed.y;
                            return ` ${blockName}: ${pctVal.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: chartGridStyle,
                    ticks: {
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 11 }
                    },
                    title: {
                        display: true,
                        text: `Pace Bracket (Min / ${getDistanceUnit().toUpperCase()})`,
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 12, weight: 'semibold' }
                    }
                },
                y: {
                    grid: chartGridStyle,
                    ticks: {
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 11 },
                        callback: (value) => `${value}%`
                    },
                    title: {
                        display: true,
                        text: `% of Running Mileage`,
                        color: '#6b7280',
                        font: { family: 'Outfit', size: 12, weight: 'semibold' }
                    }
                }
            }
        }
    });
}

// Start app on DOM content load
document.addEventListener('DOMContentLoaded', init);
