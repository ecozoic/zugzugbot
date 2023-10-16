require('dotenv').config();

const {Client, Events, GatewayIntentBits} = require('discord.js');

const d4 = require('./d4/d4.js');
const wow = require('./wow/wow.js');

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
            const content = message.content.substring(3);
            let response = '';

            if (content.startsWith('d4 ')) {
                response = d4(content.substring(3));
            } else if (content.startsWith('wow ')) {
                response = wow(content.substring(4));
            } else {
                response = wow(content);
            }

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
