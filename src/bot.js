require('dotenv').config();

const {Client, Events, GatewayIntentBits} = require('discord.js');
const wow = require('./wow.js');

const token = process.env.BOT_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.on(Events.MessageCreate, async message => {
    if (message.content.startsWith('zz ')) {
        try {
            const response = wow(message.content.substring(3));
            console.log(response);
            client.channels
                .fetch(message.channelId)
                .then(channel => channel.send(response));
        } catch (e) {
            console.log(e.message);
            client.channels
                .fetch(message.channelId)
                .then(channel => channel.send(e.message));
        }
    }
});

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.login(token);
