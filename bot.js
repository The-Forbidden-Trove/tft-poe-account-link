const Discord = require('discord.js');
const { Intents } = require('discord.js');
const client = new Discord.Client({
  presence: {
    activityName: 'Message \'LINK\' to verify',
    activityType: 'PLAYING'
  },
  intents: [Intents.FLAGS.GUILD_MESSAGE_REACTIONS]
});
const { v4 } = require('uuid');
const { createStateDiscordIdLink, getPoeTftStateLinkByDiscordId, getPoeTftStateLinkByPoeAccount, getAllUnassignedLinkedUserIds, updateUnassignedLinkedUser, getBlacklistedUserAttempts, unlinkDiscordID } = require('./database');
const dotenv = require('dotenv');

const BOT_CONTROL_CHANNEL_ID = process.env.botControlId;
const LINKED_TFT_POE_ROLE_ID = '848751148478758914';
const TFT_SERVER_ID = '645607528297922560';
const MOD_ALERT_CHANNEL_ID = process.env.modAlertChannelId;

if (process.env.NODE_ENV === 'dev' && process.env.testEnvProp === undefined) {
  dotenv.config({ path: __dirname + '/.env_dev' });
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('Message \'link\' to verify')
    .then(presence => console.log(`Activity set to ${JSON.stringify(presence)}`))
    .catch((err) => console.log(`ERROR SETTING ACTIVITY: ${err}`));
});

client.on('message', async (message) => {
  // is private message
  if (message.author.dmChannel && message.channel.id == message.author.dmChannel.id) {
    const isLinked = await getPoeTftStateLinkByDiscordId(message.author.id);
    if (isLinked) {
      await message.author.dmChannel.send('You have already linked your POE account with the TFT-POE account linker!');
      return;
    }
    const generatedState = v4();
    await createStateDiscordIdLink(generatedState, message.author.id);
    await message.author.dmChannel.send(
      `Click here to authorize with the GGG oauth servers: ${buildAuthorizeURL(generatedState)}`
    );
  }

  if (message.channel.id === BOT_CONTROL_CHANNEL_ID) {
    const lowerCaseContent = message.content.toLowerCase();
    if (lowerCaseContent.startsWith('#')) {
      const splitContent = lowerCaseContent.split(' ');

      if (splitContent[1].includes(' ') || splitContent[1].includes(';') || splitContent[1].includes('-') || splitContent[1].includes('\'') || splitContent[1].includes('"')) {
        return
      }
      //unlink command
      if (lowerCaseContent.includes('unlink') && message.member.roles.cache.find(r => r.id === "727715562037313566")) {
        console.log(`unlink initiated`)
        if (isNaN(splitContent[1])) {
          await message.channel.send(`Given argument ${splitContent[1]} is not a valid discord id`);
          return;
        }
        const unlink = await unlinkDiscordID(splitContent[1]);
        console.log(unlink);
        await message.channel.send(`Discord account with id ${splitContent[1]} was successfully unlinked.`);
        return;
      }

      if (lowerCaseContent.includes(process.env.chkDiscCmd) || lowerCaseContent.includes('cdl')) {
        if (isNaN(splitContent[1])) {
          await message.channel.send(`Given argument ${splitContent[1]} is not a valid discord id`);
          return;
        }
        const poeAccount = await getPoeTftStateLinkByDiscordId(splitContent[1]);
        if (poeAccount !== false && poeAccount > "") {
          await message.channel.send(`The POE account linked to discord id ${splitContent[1]} is ${poeAccount}`);
          await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount)}`)
          return
        }
        await message.channel.send(`No POE account found for discord id ${splitContent[1]}`);
        return;
      }
      if (lowerCaseContent.includes(process.env.chkpoecmd) || lowerCaseContent.includes('cpl')) {
        const discordId = await getPoeTftStateLinkByPoeAccount(splitContent[1]);
        if (discordId !== false && discordId > "") {
          await message.channel.send(`The discord id linked to the POE account ${splitContent[1]} is ${discordId}`);
          await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(splitContent[1])}`)
          return;
        }
        await message.channel.send(`No discord id found for POE account ${splitContent[1]}`);
        return;
      }
    }
  }
});

client.login(process.env.botToken);

setInterval(async () => {
  const discordIds = await getAllUnassignedLinkedUserIds();
  await Promise.all(discordIds.map((id) => assignRoleThenUpdateUser(id)));
}, 30000);

setInterval(async () => {
  const blacklistLinkAttempts = await getBlacklistedUserAttempts();
  const modAlertChannel = await client.channels.fetch(MOD_ALERT_CHANNEL_ID, true);
  blacklistLinkAttempts.forEach(async (attempt) => {
    const { discordId, poeAcc } = attempt;
    await modAlertChannel.send(`Blacklisted user with discord account ${discordId} and poe account ${poeAcc} attempted to link their account!`)
  })
}, 60000);

const assignRoleThenUpdateUser = async (discordId) => {
  return assignTftVerifiedRole(discordId).then(async () => await updateUnassignedLinkedUser(discordId));
}

const assignTftVerifiedRole = async (discordUserId) => {
  const guild = await client.guilds.fetch(TFT_SERVER_ID, true);
  console.log(`assignTftVerifiedRole to:  ${discordUserId}`);
  let guildMember;
  try {
    guildMember = await guild.members.fetch({ user: String(discordUserId), cache: false });
  } catch (e) {
    console.log(e.stack);
    console.log(e.message);
    return Promise.resolve(new Error('user does not exist'));
  }
  if (guildMember) {
    await guildMember.roles.add(LINKED_TFT_POE_ROLE_ID);
  }
}

const buildAuthorizeURL = (state) => {
  const params = {
    client_id: process.env.clientId,
    response_type: 'code',
    scope: 'account:profile',
    state: state,
    redirect_uri: "https://theforbiddentrove.xyz/oauth_redirect",
    prompt: "consent"
  };

  const queryParamStr = Object.entries(params).map(([key, val]) => `${key}=${val}`).join('&');
  return `https://www.pathofexile.com/oauth/authorize?${queryParamStr}`;
}

// Once alert is :wh: it goes in alert-history
client.on('messageReactionAdd', async (reaction, user) => {
    if(reaction.message.channelId == MOD_ALERT_CHANNEL_ID) {
        if (reaction.emoji.name == ":white_check_mark:" && reaction.message.author.id == "846461921023885353") {
          client.channels.cache.get("809553170367381534").send(`${reaction.message.content} ** - resolved by ** ${user}`);                                        
          reaction.message.delete();
        }
    }
});