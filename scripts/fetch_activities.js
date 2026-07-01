import fs from 'fs/promises';
import path from 'path';

// Disable TLS verification to handle intercepting proxies/VPNs in local environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CREDENTIALS_PATH = path.join('data', 'credentials.json');
const ACTIVITIES_DIR = 'data';
const ACTIVITIES_PATH = path.join(ACTIVITIES_DIR, 'activities.json');

async function loadCredentials() {
    try {
        const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        throw new Error('No credentials found. Please run "npm run auth" first to connect your Strava account.');
    }
}

async function saveCredentials(credentials) {
    await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), 'utf-8');
}

async function refreshAccessToken(credentials) {
    console.log('Access token expired or expiring soon. Refreshing token...');
    const refreshUrl = 'https://www.strava.com/oauth/token';
    const requestBody = JSON.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken
    });

    const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`Token refresh failed: ${errData.message || response.status}`);
    }

    const data = await response.json();
    credentials.accessToken = data.access_token;
    credentials.refreshToken = data.refresh_token;
    credentials.expiresAt = data.expires_at;

    await saveCredentials(credentials);
    console.log('Access token successfully refreshed.');
    return credentials.accessToken;
}

async function fetchActivitiesPage(accessToken, page, perPage = 100) {
    const url = `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`Strava API returned HTTP ${response.status}: ${errData.message || response.statusText}`);
    }

    return await response.json();
}

async function main() {
    try {
        console.log('Loading Strava credentials...');
        let credentials = await loadCredentials();

        // Check token expiration (refresh if expiring in less than 5 minutes)
        const fiveMinutes = 5 * 60;
        const nowInSeconds = Math.floor(Date.now() / 1000);
        let token = credentials.accessToken;

        if (credentials.expiresAt - nowInSeconds < fiveMinutes) {
            credentials = await refreshAccessToken(credentials);
            token = credentials.accessToken;
        }

        console.log('Fetching activities from Strava...');
        let page = 1;
        let allRuns = [];
        let totalActivitiesFetched = 0;
        let done = false;

        while (!done) {
            console.log(`Fetching page ${page}...`);
            const activities = await fetchActivitiesPage(token, page);
            
            if (!activities || activities.length === 0) {
                console.log('No more activities found.');
                done = true;
                break;
            }

            totalActivitiesFetched += activities.length;
            
            // Filter and map only running activities, keeping privacy in mind
            const runs = activities
                .filter(act => act.type === 'Run')
                .map(act => ({
                    id: act.id,
                    name: act.name,
                    distance: act.distance, // meters
                    moving_time: act.moving_time, // seconds
                    elapsed_time: act.elapsed_time, // seconds
                    total_elevation_gain: act.total_elevation_gain, // meters
                    start_date_local: act.start_date_local, // e.g. "2024-10-13T08:00:00Z"
                    average_speed: act.average_speed, // m/s
                    max_speed: act.max_speed, // m/s
                    has_heartrate: act.has_heartrate || false,
                    average_heartrate: act.average_heartrate || null
                }));

            allRuns.push(...runs);
            console.log(`Page ${page}: found ${runs.length} runs out of ${activities.length} activities.`);

            // If we fetched fewer than the requested page size, we've reached the end
            if (activities.length < 100) {
                done = true;
            } else {
                page++;
                // Add a small delay to avoid hitting rate limits too fast
                await new Promise(r => setTimeout(r, 200));
            }
        }

        console.log(`\nSynchronization complete.`);
        console.log(`Total activities fetched from Strava: ${totalActivitiesFetched}`);
        console.log(`Total runs extracted & sanitized: ${allRuns.length}`);

        // Ensure data directory exists
        await fs.mkdir(ACTIVITIES_DIR, { recursive: true });

        // Save sanitized runs to activities.json
        await fs.writeFile(ACTIVITIES_PATH, JSON.stringify(allRuns, null, 2), 'utf-8');
        console.log(`Saved sanitized activities to ${ACTIVITIES_PATH}`);

    } catch (err) {
        console.error('\n❌ Synchronization error:', err.message);
        process.exit(1);
    }
}

main();
