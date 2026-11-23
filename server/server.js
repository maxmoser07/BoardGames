const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const jwksClient = require('jwks-rsa');
const { URLSearchParams } = require('url');

const db = require('./db');
const { generateState, generatePKCE, safeCompare } = require('./utils/oauth');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Google JWKS client for validating ID tokens securely
const googleClient = jwksClient({
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  cache: true,
  rateLimit: true,
});

function getGoogleSigningKey(header, callback) {
  googleClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

/* ==========================================
   AUTHENTICATION MIDDLEWARE
   ================================          */
function requireAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No session token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }
}

/* ==========================================
   STEP 2: OAUTH INITIATION ENDPOINTS
   ================================          */

// GET /auth/github
app.get('/auth/github', (req, res) => {
  const state = generateState();
  
  res.cookie('__Host-oauth_state', state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/github/callback`,
    scope: 'read:user user:email',
    state: state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// GET /auth/google
app.get('/auth/google', (req, res) => {
  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePKCE();
  const nonce = generateState();

  const cookieData = JSON.stringify({ state, codeVerifier, nonce });
  res.cookie('__Host-oauth_state', cookieData, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce: nonce,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/* ==========================================
   STEP 3: CALLBACK HANDLERS
   ================================          */

// GitHub Callback Handler
app.get('/auth/github/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const storedCookie = req.cookies['__Host-oauth_state'];

  res.clearCookie('__Host-oauth_state', { path: '/' });

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=access_denied`);
  }

  if (!code || !state || !storedCookie) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_request`);
  }

  if (!safeCompare(state, storedCookie)) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=csrf_mismatch`);
  }

  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/github/callback`,
      },
      {
        headers: { Accept: 'application/json' },
      }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      throw new Error('Failed to obtain access token from GitHub');
    }

    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` },
    });
    const githubUser = userResponse.data;

    const emailsResponse = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `token ${accessToken}` },
    });
    
    const primaryEmailObj = emailsResponse.data.find(
      (e) => e.primary && e.verified
    );
    const email = primaryEmailObj ? primaryEmailObj.email : githubUser.email;

    if (!email) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=email_not_verified`);
    }

    const githubUserId = String(githubUser.id);
    const name = githubUser.name || githubUser.login;
    const avatarUrl = githubUser.avatar_url;

    const client = await db.pool.connect();
    let userId;
    try {
      await client.query('BEGIN');

      const existingOAuth = await client.query(
        'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        ['github', githubUserId]
      );

      if (existingOAuth.rows.length > 0) {
        userId = existingOAuth.rows[0].user_id;
      } else {
        const existingUser = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          userId = existingUser.rows[0].id;
        } else {
          const newUser = await client.query(
            'INSERT INTO users (email, email_verified, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id',
            [email, true, name, avatarUrl]
          );
          userId = newUser.rows[0].id;
        }

        await client.query(
          'INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [userId, 'github', githubUserId]
        );
      }
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    const sessionToken = jwt.sign({ userId, email }, process.env.SESSION_SECRET, {
      expiresIn: '7d',
    });

    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error('GitHub OAuth Error:', err.response?.data || err.message);
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// Google Callback Handler
app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const storedCookieRaw = req.cookies['__Host-oauth_state'];

  res.clearCookie('__Host-oauth_state', { path: '/' });

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=access_denied`);
  }

  if (!code || !state || !storedCookieRaw) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_request`);
  }

  let storedCookie;
  try {
    storedCookie = JSON.parse(storedCookieRaw);
  } catch (e) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_request`);
  }

  if (!safeCompare(state, storedCookie.state)) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=csrf_mismatch`);
  }

  try {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.BACKEND_BASE_URL}/auth/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: storedCookie.codeVerifier,
    });

    const { id_token } = tokenResponse.data;
    if (!id_token) {
      throw new Error('Failed to obtain ID token from Google');
    }

    const decodedToken = await new Promise((resolve, reject) => {
      jwt.verify(
        id_token,
        getGoogleSigningKey,
        {
          audience: process.env.GOOGLE_CLIENT_ID,
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
        },
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        }
      );
    });

    if (decodedToken.nonce !== storedCookie.nonce) {
      throw new Error('Nonce validation failed');
    }

    if (!decodedToken.email_verified) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=email_not_verified`);
    }

    const googleUserId = decodedToken.sub;
    const email = decodedToken.email;
    const name = decodedToken.name;
    const avatarUrl = decodedToken.picture;

    const client = await db.pool.connect();
    let userId;
    try {
      await client.query('BEGIN');

      const existingOAuth = await client.query(
        'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        ['google', googleUserId]
      );

      if (existingOAuth.rows.length > 0) {
        userId = existingOAuth.rows[0].user_id;
      } else {
        const existingUser = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          userId = existingUser.rows[0].id;
        } else {
          const newUser = await client.query(
            'INSERT INTO users (email, email_verified, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id',
            [email, true, name, avatarUrl]
          );
          userId = newUser.rows[0].id;
        }

        await client.query(
          'INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [userId, 'google', googleUserId]
        );
      }
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    const sessionToken = jwt.sign({ userId, email }, process.env.SESSION_SECRET, {
      expiresIn: '7d',
    });

    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error('Google OAuth Error:', err.message);
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

/* ==========================================
   STEP 5: SESSION MANAGEMENT & LOGOUT API
   ================================          */

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, email_verified, name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows.shift() });
  } catch (err) {
    console.error('Failed to fetch user session profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
