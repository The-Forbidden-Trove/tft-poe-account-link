const express = require('express');
const nodeFetch = require('node-fetch');
const dotenv = require('dotenv');
const { getDiscordIdStateLink } = require('./database');
const { callProfileApiWithRetryBackoff } = require('./oauthCalls');
const { getBlacklistedAccountNames } = require('./blacklist');

if (process.env.NODE_ENV === 'dev' && process.env.testEnvProp === undefined) {
  dotenv.config({ path: __dirname + '/.env_dev' });
}

const app = express();
const port = 4050;

let blacklist;

console.log(`process.env.NODE_ENV: ${process.env.NODE_ENV}`)

const API_TIMEOUT_ENABLED = false;

const enableTemporaryTimeout = (retryAfter) => {
  API_TIMEOUT_ENABLED = true;
  setTimeout(() => {
    API_TIMEOUT_ENABLED = false;
  }, Math.min(retryAfter * 1000, 60000))
}

app.get('/oauth_redirect', async (req, res) => {
  if (req.query.state <= "" || req.query.code <= "") {
    console.log('no state or code given');
    return;
  }
  const discordId = await getDiscordIdStateLink(req.query.state);
  if (discordId === undefined) {
    console.log(`No discord id for state ${req.query.state} found`);
    return;
  }

  if (API_TIMEOUT_ENABLED === true) {
    console.log('API timeout enabled due to 429 response');
    return;
  }
  await nodeFetch('https://www.pathofexile.com/oauth/token', {
    method: 'post',
    body: JSON.stringify({
      client_id: process.env.clientId,
      client_secret: process.env.clientSecret,
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: "https://theforbiddentrove.xyz/oauth_redirect",
      scope: "account:profile",
      state: req.query.state
    }),
    headers: {
      'Content-Type': 'application/json',
      'Host': 'www.pathofexile.com',
      'User-Agent': 'TftPoeLinker / 1.0'
    }
  }).then(async (tokenResp) => {
    if (tokenResp.status === 429) {
      enableTemporaryTimeout(tokenResp.headers.raw()['Retry-After'])
    }

    if (blacklist === undefined) {
      blacklist = await getBlacklistedAccountNames();
    }

    await callProfileApiWithRetryBackoff(tokenResp, res, discordId, blacklist);
  }, (rejectTokenReason) => {
    console.log(`rejectTokenReason: ${JSON.stringify(rejectTokenReason)}`)
  })
})

app.listen(port, () => {
  console.log(`TFT poe link app listening at http://localhost:${port}`);
});

setInterval(async () => {
  blacklist = await getBlacklistedAccountNames();
}, 60000);

module.exports = {
  callProfileApiWithRetryBackoff,
}
