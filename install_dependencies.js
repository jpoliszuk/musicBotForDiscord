const { exec } = require('child_process');

const dependencies = [
  'discord.js',
  '@discordjs/voice',
  'yt-search',
  'ytdl-core',
  'spotify-web-api-node',
  'axios',
  'express',
  'querystring',
  'dotenv'
];

const installCommand = `npm install ${dependencies.join(' ')}`;

exec(installCommand, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error installing dependencies: ${error.message}`);
    return;
  }

  if (stderr) {
    console.error(`stderr: ${stderr}`);
    return;
  }

  console.log(`Dependencies installed successfully:\n${stdout}`);
});
