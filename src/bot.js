require('dotenv').config();

const {Client, Events, GatewayIntentBits} = require('discord.js');

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
    if (message.content.startsWith('/zz')) {
        try {
            const content = message.content.substring(4);
            client.channels
                .fetch(message.channelId)
                .then(channel => channel.send('Thinking... work is da poop!'));
                
            const response = await wow(content);

            console.log(response);

            if (response != null) {
                client.channels
                    .fetch(message.channelId)
                    .then(channel => channel.send(response));
            }
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