# musicBotForDiscord
a music bot for discord that links up with a spotify account

# 1. Install node

# 2. run the install dependencies script
node install-dependencies.js

# 3. update the .env file with your credentials
GUILD_ID - right click on your discord server and select copy server ID

For spotify creds you will have to make an account here: 
https://www.google.com/url?sa=t&rct=j&q=&esrc=s&source=web&cd=&ved=2ahUKEwj1-Zb9g7aGAxW8mYkEHVlJAIgQFnoECAgQAQ&url=https%3A%2F%2Fdeveloper.spotify.com%2F&usg=AOvVaw3rfQBIVfFWQckMYcjZ_2KD&opi=89978449

##### SPOTIFY_CLIENT_ID - on spotify developer app
##### SPOTIFY_CLIENT_SECRET - on spotify developer app

# 4. Open the following URL and invite to your server
##### https://discord.com/oauth2/authorize?client_id=1245431686775439390&permissions=2150697984&scope=bot

# 5. Run the following:
##### node auth.js
##### if successful, navigate to http://localhost:8888/login and authorize and then close that terminal

# 6. Run the following:
##### node register-commands.js
##### node bot.js

### Bot should now be online and functional. This node server needs to be up and running to keep the bot online.


#### NOTES: if you run the register-commands.js file more than once and notice you have duplicate slash commands in your discord, you can run the remove-commands.js file and then you'll have to rerun the register-commands.js file
