const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const redirect_uri = 'http://localhost:8888/callback';

app.get('/login', (req, res) => {
  const scopes = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private'
  ].join(' ');

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: scopes,
      redirect_uri
    }));
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const authOptions = {
    method: 'post',
    url: 'https://accounts.spotify.com/api/token',
    data: querystring.stringify({
      code: code,
      redirect_uri,
      grant_type: 'authorization_code'
    }),
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
      ).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  try {
    const response = await axios(authOptions);
    const { access_token, refresh_token } = response.data;

    fs.writeFileSync(path.resolve(__dirname, 'access_token.txt'), access_token, 'utf8');
    fs.writeFileSync(path.resolve(__dirname, 'refresh_token.txt'), refresh_token, 'utf8');

    res.send('Success! You can now close the window.');
  } catch (error) {
    console.error('Error authenticating:', error.response.data);
    res.send('Failed to authenticate');
  }
});

app.listen(8888, () => {
  console.log('Server is running on http://localhost:8888');
});
