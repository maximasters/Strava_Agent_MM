import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import path from 'path';

// Disable SSL rejection for handling proxy/VPN self-signed certificate interceptions
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const PORT = 8111;
const CREDENTIALS_DIR = 'data';
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');

// HTML templates
const setupHTML = (error = '') => `
<!DOCTYPE html>
<html>
<head>
    <title>Strava Dashboard Setup</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #121214;
            color: #e1e1e6;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .card {
            background: #202024;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 400px;
            border: 1px solid #fc4c0233;
        }
        h1 {
            color: #fc4c02;
            margin-top: 0;
            font-size: 1.8rem;
            text-align: center;
        }
        p {
            color: #a8a8b3;
            font-size: 0.9rem;
            line-height: 1.4;
        }
        .form-group {
            margin-bottom: 1.2rem;
        }
        label {
            display: block;
            margin-bottom: 0.4rem;
            font-size: 0.85rem;
            color: #c4c4cc;
        }
        input {
            width: 100%;
            padding: 0.8rem;
            border-radius: 4px;
            border: 1px solid #29292e;
            background: #121214;
            color: #fff;
            box-sizing: border-box;
        }
        input:focus {
            outline: none;
            border-color: #fc4c02;
        }
        button {
            width: 100%;
            padding: 0.8rem;
            background: #fc4c02;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            font-size: 1rem;
            margin-top: 0.5rem;
        }
        button:hover {
            background: #e04302;
        }
        .error {
            color: #f75a68;
            background: #2d1f21;
            padding: 0.5rem;
            border-radius: 4px;
            font-size: 0.85rem;
            margin-bottom: 1rem;
            border: 1px solid #f75a6833;
        }
        .help {
            font-size: 0.8rem;
            color: #8d8d99;
            text-align: center;
            margin-top: 1.5rem;
            line-height: 1.4;
        }
        .help a {
            color: #fc4c02;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>🏃‍♂️ Connect Strava</h1>
        <p>Enter your Strava API credentials to authenticate and sync your marathon training blocks.</p>
        ${error ? `<div class="error">${error}</div>` : ''}
        <form method="POST" action="/setup">
            <div class="form-group">
                <label for="clientId">Client ID</label>
                <input type="text" id="clientId" name="clientId" placeholder="e.g. 123456" required>
            </div>
            <div class="form-group">
                <label for="clientSecret">Client Secret</label>
                <input type="password" id="clientSecret" name="clientSecret" placeholder="Your Client Secret" required>
            </div>
            <button type="submit">Authorize with Strava →</button>
        </form>
        <div class="help">
            Don't have credentials? <a href="https://www.strava.com/settings/api" target="_blank">Create Strava App</a><br>
            Ensure your <strong>Authorization Callback Domain</strong> is set to <strong>localhost</strong>.
        </div>
    </div>
</body>
</html>
`;

const successHTML = (athleteName) => `
<!DOCTYPE html>
<html>
<head>
    <title>Connection Successful!</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #121214;
            color: #e1e1e6;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .card {
            background: #202024;
            padding: 2.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 400px;
            text-align: center;
            border: 1px solid #12a45433;
        }
        .icon {
            font-size: 3.5rem;
            margin-bottom: 1rem;
        }
        h1 {
            color: #12a454;
            margin-top: 0;
            font-size: 1.8rem;
        }
        p {
            color: #c4c4cc;
            font-size: 0.95rem;
            line-height: 1.5;
        }
        .code-block {
            background: #121214;
            padding: 0.8rem;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.9rem;
            margin: 1.5rem 0;
            border: 1px solid #29292e;
            color: #e1e1e6;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✅</div>
        <h1>Connected successfully!</h1>
        <p>Welcome, ${athleteName || 'Athlete'}! Your Strava account has been linked.</p>
        <p>You can now close this tab, return to your terminal, and run:</p>
        <div class="code-block">npm run sync</div>
    </div>
</body>
</html>
`;

const errorHTML = (message) => `
<!DOCTYPE html>
<html>
<head>
    <title>Connection Failed</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #121214;
            color: #e1e1e6;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .card {
            background: #202024;
            padding: 2.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 400px;
            text-align: center;
            border: 1px solid #e23e4433;
        }
        .icon {
            font-size: 3.5rem;
            margin-bottom: 1rem;
        }
        h1 {
            color: #e23e44;
            margin-top: 0;
            font-size: 1.8rem;
        }
        p {
            color: #c4c4cc;
            font-size: 0.95rem;
            line-height: 1.5;
        }
        button {
            padding: 0.8rem 1.5rem;
            background: #fc4c02;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 1rem;
        }
        button:hover {
            background: #e04302;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">❌</div>
        <h1>Connection Failed</h1>
        <p>${message}</p>
        <button onclick="window.location.href='/'">Try Again</button>
    </div>
</body>
</html>
`;

// Temporarily store credentials during OAuth handshake
let tempCredentials = {
    clientId: '',
    clientSecret: ''
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/' || url.pathname === '/setup') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(setupHTML());
        } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                const params = new URLSearchParams(body);
                const clientId = params.get('clientId')?.trim();
                const clientSecret = params.get('clientSecret')?.trim();

                if (!clientId || !clientSecret) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(setupHTML('Please provide both Client ID and Client Secret.'));
                    return;
                }

                tempCredentials.clientId = clientId;
                tempCredentials.clientSecret = clientSecret;

                // Redirect to Strava OAuth consent screen
                const redirectUri = `http://localhost:${PORT}/callback`;
                const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=force&scope=activity:read_all`;

                res.writeHead(302, { Location: stravaAuthUrl });
                res.end();
            });
        }
    } else if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(errorHTML(`Authorization denied: ${error}`));
            return;
        }

        if (!code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(errorHTML('No code received from Strava callback.'));
            return;
        }

        // Exchange code for tokens
        try {
            const tokenExchangeUrl = 'https://www.strava.com/oauth/token';
            const requestBody = JSON.stringify({
                client_id: tempCredentials.clientId,
                client_secret: tempCredentials.clientSecret,
                code: code,
                grant_type: 'authorization_code'
            });

            const tokenResponse = await fetch(tokenExchangeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
            });

            if (!tokenResponse.ok) {
                const errData = await tokenResponse.json();
                throw new Error(errData.message || `Token exchange returned HTTP ${tokenResponse.status}`);
            }

            const tokenData = await tokenResponse.json();
            
            // Ensure data folder exists
            await fs.mkdir(CREDENTIALS_DIR, { recursive: true });

            // Save credentials and tokens
            const credentialsToSave = {
                clientId: tempCredentials.clientId,
                clientSecret: tempCredentials.clientSecret,
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: tokenData.expires_at // unix epoch timestamp in seconds
            };

            await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(credentialsToSave, null, 2), 'utf-8');

            const athleteName = tokenData.athlete ? `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}` : 'Athlete';

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(successHTML(athleteName));

            console.log(`\n=== Authentication Successful ===`);
            console.log(`Connected athlete: ${athleteName}`);
            console.log(`Credentials saved to ${CREDENTIALS_PATH}`);
            console.log(`You can now safely run: npm run sync\n`);

            // Gracefully stop the server after a short delay
            setTimeout(() => {
                server.close(() => {
                    process.exit(0);
                });
            }, 2000);

        } catch (err) {
            console.error('Error during token exchange:', err);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(errorHTML(`Token Exchange Failed: ${err.message}`));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`  Strava Dashboard Authentication Server running on port ${PORT}`);
    console.log(`  Please open http://localhost:${PORT} in your web browser`);
    console.log(`=============================================================\n`);
});
