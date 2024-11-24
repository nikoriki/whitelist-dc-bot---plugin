const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const axios = require('axios');
const fs = require('fs'); // Import the fs module to read files

// Read the token from the 'token.txt' file
const DISCORD_TOKEN = fs.readFileSync('./token.txt', 'utf-8').trim(); // Read the file and remove unnecessary spaces

const MINECRAFT_API_URL = 'http://localhost:3000/execute-command'; // Minecraft plugin API URL
const INPUT_CHANNEL_ID = 'INPUT_CHANNEL_ID'; // Channel where messages are written
const OUTPUT_CHANNEL_ID = 'OUTPUT_CHANNEL_ID'; // Channel where buttons are sent
const USERS_FILE_PATH = './used_users.txt'; // Path to the file where user IDs are saved

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Function to load used user IDs from the file
const loadUsedUserIds = () => {
    if (fs.existsSync(USERS_FILE_PATH)) {
        const data = fs.readFileSync(USERS_FILE_PATH, 'utf-8');
        return new Set(data.split('\n').filter(id => id)); // Load IDs from the file
    }
    return new Set();
};

// Initialize the set of `usedUserIds` from the file
let usedUserIds = loadUsedUserIds();

client.once('ready', () => {
    console.log(`Bot connected as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    // Ignore messages from the bot itself and from other channels
    if (message.author.bot) return;

    // Check if the message is from the correct channel and if the user has already sent a message
    if (message.channel.id !== INPUT_CHANNEL_ID || usedUserIds.has(message.author.id)) {
        // If the user has already sent a message, send a warning message
        const warningMessage = await message.reply({
            content: 'You have already whitelisted an username, you cannot whitelist more than one username.',
            ephemeral: true
        });

        // Wait 0.5 seconds and delete the user's message
        setTimeout(async () => {
            await message.delete(); // Delete the user's message
        }, 500); // 500 milliseconds (0.5 seconds)

        // Wait 3 seconds and delete the bot's message
        setTimeout(async () => {
            await warningMessage.delete(); // Delete the bot's warning message
        }, 3000); // 3000 milliseconds (3 seconds)

        return;
    }

    // If the user hasn't sent a message before, proceed
    const username = message.content.trim(); // Username sent in the input channel
    const userId = message.author.id; // Get the user's ID

    // Mark the user as having sent a message
    usedUserIds.add(userId);

    // Save the user's ID in the file
    fs.appendFileSync(USERS_FILE_PATH, `${userId}\n`, 'utf-8');

    // Send a message with buttons to the output channel
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`whitelist-${username}`)
            .setLabel('Whitelist')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`reject-${username}`)
            .setLabel('Reject')
            .setStyle(ButtonStyle.Danger)
    );

    const outputChannel = client.channels.cache.get(OUTPUT_CHANNEL_ID);
    if (outputChannel) {
        await outputChannel.send({
            content: `Select an option for **${username}**:`,
            components: [row],
        });
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return; // Ignore if it's not a button interaction

    const [action, username] = interaction.customId.split('-'); // Extract action and username from the CustomId
    let command;

    if (action === 'whitelist') {
        command = `whitelistaddcommand ${username}`;
    } else if (action === 'reject') {
        command = `whitelistremovecommand ${username}`;
    } else {
        await interaction.reply({
            content: 'Action not recognized',
            ephemeral: true,
        });
        return;
    }

    // Send the command to the Minecraft server
    try {
        const response = await axios.post(MINECRAFT_API_URL, { command });

        // Delete the previous message (button message)
        await interaction.message.delete();

        // Send a new message with the response depending on the action chosen
        if (action === 'whitelist') {
            await interaction.channel.send(`**${username}** has been whitelisted!`);
        } else if (action === 'reject') {
            await interaction.channel.send(`**${username}** has been rejected.`);
        }

        // Commented out the reply to the interaction (no client-side message)
        // await interaction.reply({
        //     content: `Command executed: \`${command}\`\nAnswer: ${response.data.message}`,
        //     ephemeral: true,
        // });
    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: `Error executing the command: ${error.response ? error.response.data.error : 'Unknown'}`,
            ephemeral: true,
        });
    }
});

client.login(DISCORD_TOKEN);
