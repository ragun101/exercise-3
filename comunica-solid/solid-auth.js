const {
  createDpopHeader,
  generateDpopKeyPair,
  buildAuthenticatedFetch,
} = require("@inrupt/solid-client-authn-core");

let authFetch = null;
let webId = null;
let session = null;

const TOKEN_REFRESH_INTERVAL = 60 * 1000; // refresh token every 60 seconds

async function acquireToken() {
  const solidEndpoint = process.env.SOLID_ENDPOINT;
  const email = process.env.SOLID_USERNAME;
  const password = process.env.SOLID_PASSWORD;
  const solidWebId = process.env.SOLID_WEBID;

  // Step 1: Get the account API controls
  const indexResponse1 = await fetch(`${solidEndpoint}/.account/`);
  const { controls: controls1 } = await indexResponse1.json();

  // Step 2: Log in to the account API
  const loginResponse = await fetch(controls1.password.login, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const { authorization } = await loginResponse.json();

  // Step 3: Get the authenticated controls (includes more endpoints)
  const indexResponse2 = await fetch(`${solidEndpoint}/.account/`, {
    headers: { authorization: `CSS-Account-Token ${authorization}` },
  });
  const { controls: controls2 } = await indexResponse2.json();

  // Step 4: Generate client credentials token
  const credentialsResponse = await fetch(
    controls2.account.clientCredentials,
    {
      method: "POST",
      headers: {
        authorization: `CSS-Account-Token ${authorization}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "comunica-solid-token",
        webId: solidWebId,
      }),
    }
  );
  const { id, secret } = await credentialsResponse.json();

  // Step 5: Generate DPoP-bound access token
  const dpopKey = await generateDpopKeyPair();
  const authString = `${encodeURIComponent(id)}:${encodeURIComponent(secret)}`;
  const tokenUrl = `${solidEndpoint}/.oidc/token`;

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(authString).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      dpop: await createDpopHeader(tokenUrl, "POST", dpopKey),
    },
    body: "grant_type=client_credentials&scope=webid",
  });
  const { access_token: accessToken } = await tokenResponse.json();

  // Step 6: Build the authenticated fetch function
  authFetch = await buildAuthenticatedFetch(accessToken, { dpopKey });
  webId = solidWebId;

  // Create a Session-like object for Comunica's Solid auth actor
  session = {
    info: { webId, isLoggedIn: true },
    fetch: authFetch,
  };
}

async function initSession() {
  const solidEndpoint = process.env.SOLID_ENDPOINT;
  const email = process.env.SOLID_USERNAME;
  const password = process.env.SOLID_PASSWORD;
  const solidWebId = process.env.SOLID_WEBID;

  if (!solidEndpoint || !email || !password || !solidWebId) {
    console.error(
      "Missing SOLID_ENDPOINT, SOLID_USERNAME, SOLID_PASSWORD, or SOLID_WEBID in environment"
    );
    process.exit(1);
  }

  await acquireToken();
  console.log(`Logged in as ${webId}`);

  // Refresh the token periodically to stay logged in
  setInterval(async () => {
    try {
      await acquireToken();
      console.log("Token refreshed successfully");
    } catch (err) {
      console.error("Token refresh failed:", err.message);
    }
  }, TOKEN_REFRESH_INTERVAL);
}

function getAuthFetch() {
  return authFetch;
}

function getWebId() {
  return webId;
}

function getSession() {
  return session;
}

module.exports = { initSession, getAuthFetch, getWebId, getSession };
