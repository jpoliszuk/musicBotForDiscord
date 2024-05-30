const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started removing application (/) commands.');

    // Fetch and delete all global commands
    const globalCommands = await rest.get(
      Routes.applicationCommands(process.env.CLIENT_ID)
    );

    for (const command of globalCommands) {
      await rest.delete(
        `${Routes.applicationCommands(process.env.CLIENT_ID)}/${command.id}`
      );
      console.log(`Deleted global command ${command.name}`);
    }

    // Fetch and delete all guild-specific commands
    const guildCommands = await rest.get(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    );

    for (const command of guildCommands) {
      await rest.delete(
        `${Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)}/${command.id}`
      );
      console.log(`Deleted guild command ${command.name}`);
    }

    console.log('Successfully removed all application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
