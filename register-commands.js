const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { SlashCommandBuilder } = require('@discordjs/builders');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Add songs from a Spotify playlist to the queue')
    .addStringOption(option =>
      option.setName('playlist_name')
        .setDescription('The name of the Spotify playlist')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Add a song to the queue')
    .addStringOption(option =>
      option.setName('song_title')
        .setDescription('The title of the song')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music and clear the queue'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the queue or move a song to the top')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('The position of the song in the queue')),
  new SlashCommandBuilder()
    .setName('showplaylists')
    .setDescription('Show your Spotify playlists'),
  new SlashCommandBuilder()
    .setName('bothelp')
    .setDescription('Show help information'),
  new SlashCommandBuilder()
    .setName('addtoplaylist')
    .setDescription('Add the currently playing song to a Spotify playlist')
    .addStringOption(option =>
      option.setName('playlist_name')
        .setDescription('The name of the Spotify playlist')
        .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
