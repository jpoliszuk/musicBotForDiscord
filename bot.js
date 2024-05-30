const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const SpotifyWebApi = require('spotify-web-api-node');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

let accessToken = fs.readFileSync(path.resolve(__dirname, 'access_token.txt'), 'utf8');
const refreshToken = fs.readFileSync(path.resolve(__dirname, 'refresh_token.txt'), 'utf8');

spotifyApi.setAccessToken(accessToken);
spotifyApi.setRefreshToken(refreshToken);

const queue = new Map();

async function refreshAccessToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    accessToken = data.body['access_token'];
    spotifyApi.setAccessToken(accessToken);
    fs.writeFileSync(path.resolve(__dirname, 'access_token.txt'), accessToken, 'utf8');
    console.log('Access token refreshed\n\n\n\n\n');
  } catch (err) {
    console.error('Could not refresh access token', err);
  }
}

async function callSpotifyApi(method, ...args) {
  try {
    return await spotifyApi[method](...args);
  } catch (err) {
    if (err.statusCode === 401 && err.body.error.message === 'The access token expired') {
      console.log('\n\n\n\n\nAccess token expired, refreshing...');
      await refreshAccessToken();
      return await spotifyApi[method](...args);
    } else {
      throw err;
    }
  }
}

client.once('ready', () => {
  console.log('Bot is online!');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'playlist') {
    const playlistName = options.getString('playlist_name');
    await handlePlaylistCommand(interaction, playlistName);
  } else if (commandName === 'play') {
    const songTitle = options.getString('song_title');
    await handlePlayCommand(interaction, songTitle);
  } else if (commandName === 'skip') {
    skipSong(interaction, queue);
  } else if (commandName === 'stop') {
    stopSong(interaction, queue);
  } else if (commandName === 'queue') {
    const position = options.getInteger('position');
    if (position !== null) {
      moveSongToTop(interaction, queue, position);
    } else {
      showQueue(interaction, queue);
    }
  } else if (commandName === 'showplaylists') {
    await handleShowPlaylistsCommand(interaction);
  } else if (commandName === 'bothelp') {
    sendHelpMessage(interaction);
  } else if (commandName === 'addtoplaylist') {
    const playlistName = options.getString('playlist_name');
    await handleAddToPlaylistCommand(interaction, playlistName);
  }
});

async function handleAddToPlaylistCommand(interaction, playlistName) {
  try {
    await interaction.deferReply();
    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue || !serverQueue.songs[0]) {
      return interaction.editReply({ embeds: [createEmbed('There is no song currently playing.', 'error')] });
    }

    const currentSong = serverQueue.songs[0];

    const data = await callSpotifyApi('getUserPlaylists');
    const playlists = data.body.items;

    const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

    if (playlist) {
      const trackUri = await getSpotifyTrackUri(currentSong.title);

      if (trackUri) {
        await callSpotifyApi('addTracksToPlaylist', playlist.id, [trackUri]);
        await interaction.editReply({ embeds: [createEmbed(`Added ${currentSong.title} to the playlist **${playlistName}**.`, 'info')] });
      } else {
        await interaction.editReply({ embeds: [createEmbed('Could not find the song on Spotify.', 'error')] });
      }
    } else {
      await interaction.editReply({ embeds: [createEmbed('Playlist not found.', 'error')] });
    }
  } catch (err) {
    console.error('Error adding to playlist:', err.message);
    await interaction.editReply({ embeds: [createEmbed(`Error: ${err.message}`, 'error')] });
  }
}

async function getSpotifyTrackUri(songTitle) {
  try {
    const data = await callSpotifyApi('searchTracks', songTitle);
    if (data.body.tracks.items.length > 0) {
      return data.body.tracks.items[0].uri;
    }
    return null;
  } catch (error) {
    console.error('Error searching Spotify:', error.message);
    return null;
  }
}

async function handlePlaylistCommand(interaction, playlistName) {
  try {
    await interaction.deferReply();
    const serverQueue = queue.get(interaction.guild.id);

    console.log(`Searching for playlist: ${playlistName}`);

    const data = await callSpotifyApi('getUserPlaylists');
    const playlists = data.body.items;

    const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

    if (playlist) {
      console.log(`Found playlist: ${playlist.name}`);

      const tracksData = await callSpotifyApi('getPlaylistTracks', playlist.id);
      const tracks = tracksData.body.items.map(item => ({
        name: item.track.name,
        artist: item.track.artists[0].name,
        albumCover: item.track.album.images[0].url,
      }));

      if (!serverQueue) {
        const queueContruct = {
          textChannel: interaction.channel,
          voiceChannel: interaction.member.voice.channel,
          connection: null,
          songs: [],
          player: createAudioPlayer(),
          playing: false,
        };

        queue.set(interaction.guild.id, queueContruct);
        queueContruct.player.setMaxListeners(50);

        for (const track of tracks) {
          console.log(`Searching YouTube for: ${track.name} by ${track.artist}`);
          const video = await searchYouTube(`${track.name} ${track.artist}`);
          if (video) {
            console.log(`Found YouTube video: ${video.url}`);
            const song = {
              title: `${track.name} by ${track.artist}`,
              url: video.url,
              albumCover: track.albumCover,
            };
            queueContruct.songs.push(song);
          } else {
            console.log(`No YouTube video found for: ${track.name} by ${track.artist}`);
          }
        }

        if (queueContruct.songs.length > 0) {
          shuffleArray(queueContruct.songs);
          try {
            const connection = joinVoiceChannel({
              channelId: interaction.member.voice.channel.id,
              guildId: interaction.guild.id,
              adapterCreator: interaction.guild.voiceAdapterCreator,
            });
            queueContruct.connection = connection;
            playSong(interaction.guild, queueContruct.songs[0]);
            await interaction.editReply({ embeds: [createEmbed('Queue has been successfully added and shuffled.', 'info')] });
          } catch (err) {
            console.log(err);
            queue.delete(interaction.guild.id);
            return await interaction.editReply({ embeds: [createEmbed(err.toString(), 'error')] });
          }
        } else {
          await interaction.editReply({ embeds: [createEmbed('No valid YouTube videos found for the playlist.', 'error')] });
        }
      } else {
        for (const track of tracks) {
          console.log(`Searching YouTube for: ${track.name} by ${track.artist}`);
          const video = await searchYouTube(`${track.name} ${track.artist}`);
          if (video) {
            console.log(`Found YouTube video: ${video.url}`);
            const song = {
              title: `${track.name} by ${track.artist}`,
              url: video.url,
              albumCover: track.albumCover,
            };
            serverQueue.songs.push(song);
          } else {
            console.log(`No YouTube video found for: ${track.name} by ${track.artist}`);
          }
        }
        shuffleArray(serverQueue.songs);
        await interaction.editReply({ embeds: [createEmbed('Queue has been successfully added and shuffled.', 'info')] });
      }
    } else {
      await interaction.editReply({ embeds: [createEmbed('Playlist not found', 'error')] });
      console.log('Playlist not found');
    }
  } catch (err) {
    console.error('Error retrieving playlist:', err.message);
    await interaction.editReply({ embeds: [createEmbed(`Error retrieving playlist: ${err.message}`, 'error')] });
  }
}

async function handlePlayCommand(interaction, songTitle) {
  try {
    await interaction.deferReply();

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.editReply({ embeds: [createEmbed('You need to be in a voice channel to play music!', 'error')] });
    }

    const serverQueue = queue.get(interaction.guild.id);

    // Search for the song on YouTube and fetch album cover from Spotify
    const video = await searchYouTube(songTitle);
    const spotifyTrack = await searchSpotifyTrack(songTitle);

    if (video) {
      const song = {
        title: video.title,
        url: video.url,
        albumCover: spotifyTrack ? spotifyTrack.album.images[0].url : null, // Fetch cover from Spotify if available
      };

      if (!serverQueue) {
        const queueContruct = {
          textChannel: interaction.channel,
          voiceChannel: interaction.member.voice.channel,
          connection: null,
          songs: [song],
          player: createAudioPlayer(),
          playing: false,
        };

        queue.set(interaction.guild.id, queueContruct);
        queueContruct.player.setMaxListeners(50);

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
          });
          queueContruct.connection = connection;
          playSong(interaction.guild, queueContruct.songs[0]);
          await interaction.editReply({ embeds: [createEmbed(`${song.title} has been added to the top of the queue!`, 'info')] });
        } catch (err) {
          console.log(err);
          queue.delete(interaction.guild.id);
          return await interaction.editReply({ embeds: [createEmbed(err.toString(), 'error')] });
        }
      } else {
        // Check if the currently playing song is the same as the one being added
        const currentlyPlaying = serverQueue.songs[0];
        if (currentlyPlaying && currentlyPlaying.url === song.url) {
          await interaction.editReply({ embeds: [createEmbed('The song is already playing.', 'info')] });
        } else {
          // Add the new song to the top of the queue without affecting the current song
          serverQueue.songs.splice(1, 0, song);
          await interaction.editReply({ embeds: [createEmbed(`${song.title} has been added to the top of the queue!`, 'info')] });
        }
      }
    } else {
      await interaction.editReply({ embeds: [createEmbed('No YouTube video found for the song.', 'error')] });
    }
  } catch (err) {
    console.error('Error:', err.message);
    await interaction.editReply({ embeds: [createEmbed(`Error: ${err.message}`, 'error')] });
  }
}

async function handleShowPlaylistsCommand(interaction) {
  try {
    await interaction.deferReply();

    const data = await callSpotifyApi('getUserPlaylists');
    const playlists = data.body.items;

    if (playlists.length > 0) {
      let reply = 'Your Spotify playlists:\n';
      playlists.forEach((playlist, index) => {
        reply += `${index + 1}. ${playlist.name}\n`;
      });
      await interaction.editReply({ embeds: [createEmbed(reply, 'info')] });
    } else {
      await interaction.editReply({ embeds: [createEmbed('No playlists found.', 'info')] });
    }
  } catch (err) {
    console.error('Error retrieving playlists:', err.message);
    await interaction.editReply({ embeds: [createEmbed(`Error retrieving playlists: ${err.message}`, 'error')] });
  }
}

async function searchYouTube(query) {
  const result = await ytSearch(query);
  return result.videos.length > 0 ? result.videos[0] : null;
}

async function searchSpotifyTrack(query) {
  try {
    const data = await callSpotifyApi('searchTracks', query);
    return data.body.tracks.items.length > 0 ? data.body.tracks.items[0] : null;
  } catch (error) {
    console.error('Error searching Spotify:', error.message);
    return null;
  }
}

async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.textChannel.send({ embeds: [createEmbed('Queue has ended. No more songs to play.', 'info')] });
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const maxAttempts = 3; // Maximum number of retry attempts
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const resource = createAudioResource(ytdl(song.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
      }));

      serverQueue.player.play(resource);
      serverQueue.connection.subscribe(serverQueue.player);
      serverQueue.playing = true;

      serverQueue.player.once(AudioPlayerStatus.Idle, () => {
        cleanupListeners(serverQueue.player);
        serverQueue.songs.shift();
        if (serverQueue.songs.length > 0) {
          playSong(guild, serverQueue.songs[0]);
        } else {
          serverQueue.textChannel.send({ embeds: [createEmbed('Queue has ended. No more songs to play.', 'info')] });
          serverQueue.connection.destroy();
          queue.delete(guild.id);
        }
      });

      serverQueue.player.once('error', error => {
        cleanupListeners(serverQueue.player);
        console.error('Error:', error.message);
        serverQueue.textChannel.send({ embeds: [createEmbed(`Error: ${error.message}. Skipping to the next song.`, 'error')] });
        serverQueue.songs.shift();
        if (serverQueue.songs.length > 0) {
          playSong(guild, serverQueue.songs[0]);
        } else {
          serverQueue.textChannel.send({ embeds: [createEmbed('Queue has ended. No more songs to play.', 'info')] });
          serverQueue.connection.destroy();
          queue.delete(guild.id);
        }
      });

      resource.playStream.once('readable', () => {
        let description = 'Now playing:';
        if (serverQueue.songs.length > 1) {
          description += `\n\n**Next up:**\n1. ${serverQueue.songs[1].title}`;
          if (serverQueue.songs.length > 2) {
            description += `\n2. ${serverQueue.songs[2].title}`;
          }
        }
        const embed = createEmbed(description, 'info', song.title, song.albumCover);
        serverQueue.textChannel.send({ embeds: [embed] });
      });

      console.log(`\nStarted playing: ${song.title} \n${song.url}\n`);
      break; // Break out of the loop if successful
    } catch (error) {
      attempts++;
      if (error.message.includes('Status code: 403')) {
        console.error(`Received 403 Forbidden. Retrying (${attempts}/${maxAttempts})...`);
        if (attempts >= maxAttempts) {
          serverQueue.textChannel.send({ embeds: [createEmbed(`Failed to play ${song.title} after ${maxAttempts} attempts. Skipping to the next song.`, 'error')] });
          serverQueue.songs.shift();
          if (serverQueue.songs.length > 0) {
            playSong(guild, serverQueue.songs[0]);
          } else {
            serverQueue.textChannel.send({ embeds: [createEmbed('Queue has ended. No more songs to play.', 'info')] });
            serverQueue.connection.destroy();
            queue.delete(guild.id);
          }
        }
      } else {
        console.error('Error:', error.message);
        serverQueue.textChannel.send({ embeds: [createEmbed(`Error: ${error.message}. Skipping to the next song.`, 'error')] });
        serverQueue.songs.shift();
        if (serverQueue.songs.length > 0) {
          playSong(guild, serverQueue.songs[0]);
        } else {
          serverQueue.textChannel.send({ embeds: [createEmbed('Queue has ended. No more songs to play.', 'info')] });
          serverQueue.connection.destroy();
          queue.delete(guild.id);
        }
        break; // Break out of the loop if it's not a 403 error
      }
    }
  }
}

function skipSong(interaction, queue) {
  const serverQueue = queue.get(interaction.guild.id);
  if (!interaction.member.voice.channel) return interaction.reply({ embeds: [createEmbed('You have to be in a voice channel to skip the music!', 'error')] });
  if (!serverQueue) return interaction.reply({ embeds: [createEmbed('There is no song that I could skip!', 'error')] });
  serverQueue.songs.shift();
  if (serverQueue.songs.length > 0) {
    playSong(interaction.guild, serverQueue.songs[0]);
    interaction.reply({ embeds: [createEmbed('Skipped the song.', 'info')] });
  } else {
    
	const serverQueue = queue.get(interaction.guild.id);
	if (!interaction.member.voice.channel) return interaction.reply({ embeds: [createEmbed('You have to be in a voice channel to stop the music!', 'error')] });
	if (!serverQueue) return interaction.reply({ embeds: [createEmbed('There is no song that I could stop!', 'error')] });

	serverQueue.songs = [];
	serverQueue.player.stop();
	serverQueue.connection.destroy();
	queue.delete(interaction.guild.id);
    interaction.reply({ embeds: [createEmbed('No more songs in the queue to play.', 'info')] });
  }
}

function stopSong(interaction, queue) {
  const serverQueue = queue.get(interaction.guild.id);
  if (!interaction.member.voice.channel) return interaction.reply({ embeds: [createEmbed('You have to be in a voice channel to stop the music!', 'error')] });
  if (!serverQueue) return interaction.reply({ embeds: [createEmbed('There is no song that I could stop!', 'error')] });

  serverQueue.songs = [];
  serverQueue.player.stop();
  serverQueue.connection.destroy();
  queue.delete(interaction.guild.id);
  interaction.reply({ embeds: [createEmbed('Stopped the music and cleared the queue.', 'info')] });
}

function showQueue(interaction, queue) {
  const serverQueue = queue.get(interaction.guild.id);
  if (!serverQueue || serverQueue.songs.length <= 1) {
    return interaction.reply({ embeds: [createEmbed('The queue is empty.', 'info')] });
  }

  let queueMessage = 'Upcoming songs:\n';
  for (let i = 1; i < serverQueue.songs.length; i++) {
    queueMessage += `${i}. ${serverQueue.songs[i].title}\n`;
  }
  interaction.reply({ embeds: [createEmbed(queueMessage, 'info')] });
}

function moveSongToTop(interaction, queue, position) {
  const serverQueue = queue.get(interaction.guild.id);

  if (!interaction.member.voice.channel) {
    return interaction.reply({ embeds: [createEmbed('You have to be in a voice channel to use this command!', 'error')] });
  }

  if (!serverQueue || serverQueue.songs.length <= 1) {
    return interaction.reply({ embeds: [createEmbed('The queue is empty or has only one song.', 'info')] });
  }

  if (position < 2 || position >= serverQueue.songs.length) {
    return interaction.reply({ embeds: [createEmbed('Invalid position. Please provide a valid song position in the queue.', 'error')] });
  }

  const song = serverQueue.songs.splice(position, 1)[0];
  serverQueue.songs.splice(1, 0, song);  // Insert the song at position 1 (right after the current playing song)

  interaction.reply({ embeds: [createEmbed(`Moved ${song.title} to the top of the queue!`, 'info')] });
}

function sendHelpMessage(interaction) {
  const helpMessage = `
**Bot Commands:**

**/playlist [playlist_name]** - Searches for songs from the specified Spotify playlist on YouTube, adds them to the queue, shuffles the queue, and starts playing after all songs are added.

**/play [song_title]** - Searches for the specified song on YouTube and adds it to the top of the queue.

**/skip** - Skips the current song and plays the next one in the queue.

**/stop** - Stops playing and clears the queue.

**/queue** - Displays the upcoming songs in the queue.

**/queue [position]** - Puts the song at specified position at the top of the queue

**/addtoplaylist [playlist_name]** - Adds the current playing song to the specified playlist

**/showplaylists** - Displays all playlists from your Spotify account.

**/bothelp** - Displays this help message.
  `;
  interaction.reply({ embeds: [createEmbed(helpMessage, 'info')] });
}

function createEmbed(description, type, title = '', thumbnail = '') {
  const embed = new EmbedBuilder()
    .setDescription(description)
    .setTimestamp();

  if (type === 'info') {
    embed.setColor('#00FF00');
  } else if (type === 'error') {
    embed.setColor('#FF0000');
  }

  if (title) {
    embed.setTitle(title);
  }

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  return embed;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function cleanupListeners(player) {
  player.removeAllListeners(AudioPlayerStatus.Idle);
  player.removeAllListeners('error');
}

client.login(process.env.DISCORD_TOKEN);
