const Discord = require('discord.js');
const client = new Discord.Client({
  presence: {
    activityName: 'Message \'LINK\' to verify',
    activityType: 'PLAYING'
  }
});
const { v4 } = require('uuid');
const {
  createStateDiscordIdLink,
  getPoeTftStateLinkByDiscordId,
  getPoeTftStateLinkByPoeAccount,
  getAllUnassignedLinkedUserIds,
  updateUnassignedLinkedUser,
  getBlacklistedUserAttempts,
  unlinkDiscordID,
  getBannedPoeUserAttempts,
  getAllDataFromDB,
  getPoeUuidByDiscordId
} = require('./database');
const dotenv = require('dotenv');

const BOT_CONTROL_CHANNEL_ID = process.env.botControlId;
const MODMAIL_CATEGORY = '834148931213852743';
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
      await message.author.dmChannel.send('You have already linked your POE account with the TFT-POE account linker! If you can\'t see the trade channels, you need to send a message to <@825395083184439316> to get verified!');
      await assignTftVerifiedRole(message.author.id);
      return;
    }
    const generatedState = v4();
    await createStateDiscordIdLink(generatedState, message.author.id);
    await message.author.dmChannel.send(
      `Click here to authorize with the GGG oauth servers: ${buildAuthorizeURL(generatedState)}`
    );
  }

  // handler for modmail CDL
  if (message.channel.parent == MODMAIL_CATEGORY) {
    const lowerCaseContent = message.content.toLowerCase();
    let channelDescription = message.channel.topic;
    let userId = channelDescription.match(/ModMail Channel (\d+)/)[1];
    const botControl = client.channels.cache.find(channel => channel.id === "716528634092847154")
    if (lowerCaseContent.startsWith('=unlink')) {
      if (lowerCaseContent.includes('unlink') && (message.member.roles.cache.find(r => r.id === "727715562037313566") || message.member.roles.cache.find(r => r.id === "721971308618842184"))) {
        console.log(`unlink initiated`)
        if (isNaN(userId)) {
          await message.channel.send(`Given argument ${userId} is not a valid discord id`);
          return;
        }
        const unlink = await unlinkDiscordID(userId);
        console.log(unlink);
        await botControl.send(`Discord account with id ${userId} was successfully unlinked (from within a modmail).`);
        await message.channel.send(`Discord account with id ${userId} was successfully unlinked.`);
        return;
      }
    }
    if (lowerCaseContent.startsWith('=cdl')) {
      const poeAccount = await getPoeTftStateLinkByDiscordId(userId);
      const poeUuid = await getPoeUuidByDiscordId(userId);
      if (poeAccount !== false && poeAccount > "") {
        await message.channel.send(`The POE account linked to discord id ${userId} (<@${userId}>) is ${poeAccount} [${poeUuid}]`);
        await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount)}?discordid=${userId}&uuid=${poeUuid}`)
        return
      }
      await message.channel.send(`No POE account found for discord id ${userId}`);
      return;
    }
  }

  if (message.channel.id === BOT_CONTROL_CHANNEL_ID) {
    const lowerCaseContent = message.content.toLowerCase();
    if (lowerCaseContent.startsWith('#')) {
      const splitContent = lowerCaseContent.split(' ');

      if (splitContent[1].includes(' ') || splitContent[1].includes(';') || splitContent[1].includes('-') || splitContent[1].includes('\'') || splitContent[1].includes('"')) {
        return
      }
      //unlink command
      if (lowerCaseContent.includes('unlink') && (message.member.roles.cache.find(r => r.id === "727715562037313566") || message.member.roles.cache.find(r => r.id === "721971308618842184"))) {
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

      if (message.content.includes(process.env.chkDiscCmd) || message.content.includes('dldata')) {
        const data = await getAllDataFromDB();
        console.log(data);
        await message.channel.send("Data ready for download.", { files: ["./linkeddata.txt"] });
      }

      if (lowerCaseContent.includes(process.env.chkDiscCmd) || lowerCaseContent.includes('cdl')) {
        if (isNaN(splitContent[1])) {
          await message.channel.send(`Given argument ${splitContent[1]} is not a valid discord id`);
          return;
        }
        const poeAccount = await getPoeTftStateLinkByDiscordId(splitContent[1]);
        const poeUuid = await getPoeUuidByDiscordId(splitContent[1]);
        if (poeAccount !== false && poeAccount > "") {
          await message.channel.send(`The POE account linked to discord id ${splitContent[1]} (<@${splitContent[1]}>) is ${poeAccount} [${poeUuid}]`);
          await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount)}?discordid=${splitContent[1]}&uuid=${poeUuid}`)
          return
        }
        await message.channel.send(`No POE account found for discord id ${splitContent[1]}`);
        return;
      }
      if (lowerCaseContent.includes(process.env.chkpoecmd) || lowerCaseContent.includes('cpl')) {
        const discordId = await getPoeTftStateLinkByPoeAccount(splitContent[1]);
        const poeUuid = await getPoeUuidByDiscordId(discordId);
        if (discordId !== false && discordId > "") {
          await message.channel.send(`The discord id linked to the POE account ${splitContent[1]} is ${discordId} (<@${discordId}>)`);
          await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(splitContent[1])}`)
          if (poeUuid !== false) {
            await message.channel.send(`UUID:\n ${poeUuid}`);
          }
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
  const modAlertChannel = await client.channels.fetch(MOD_ALERT_CHANNEL_ID, true);

  const blacklistLinkAttempts = await getBlacklistedUserAttempts();
  blacklistLinkAttempts.forEach(async (attempt) => {
    const { discordId, poeAcc, uuid } = attempt;
    await modAlertChannel.send(`Blacklisted user with discord account ${discordId} (<@${discordId}>) and poe account ${poeAcc} and uuid ${uuid} attempted to link their account!`)
  });

  const bannedLinkAttempts = await getBannedPoeUserAttempts();
  bannedLinkAttempts.forEach(async (attempt) => {
    const { discordId, poeAcc, uuid } = attempt;
    await modAlertChannel.send(`Banned POE account ${poeAcc} with discord account ${discordId} (<@${discordId}>) and uuid ${uuid} attempted to link their account!`)
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
    await notifyModmailLink(discordUserId);
  }
}

const notifyModmailLink = async (discordUserId) => {
  const guild = await client.guilds.fetch(TFT_SERVER_ID, true);
  const category = guild.channels.cache.get(MODMAIL_CATEGORY);
  let regex = new RegExp(discordUserId);
  let userChannel = category.children.filter(channel => regex.test(channel.topic));
  const poeAccount = await getPoeTftStateLinkByDiscordId(discordUserId);
  const infoEmbed = {
    "title": `ℹ️ User Linked ℹ️`,
    "description": `The user in this modmail has linked a PoE account.\nTheir pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount)}?discordid=${discordUserId}`,
    "color": 0xff448e
  }
  try {
    for (const channel of userChannel) {
      try {
        await channel.send({ embeds: [infoEmbed] });
      } catch (e) {
        console.error(`Error sending message to channel ${channel.id}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(e);
  }
}

const buildAuthorizeURL = (state) => {
  const params = {
    client_id: process.env.clientId,
    response_type: 'code',
    scope: 'account:profile%20account:characters',
    state: state,
    redirect_uri: "https://theforbiddentrove.xyz/oauth_redirect",
    prompt: "consent"
  };

  const queryParamStr = Object.entries(params).map(([key, val]) => `${key}=${val}`).join('&');
  return `https://www.pathofexile.com/oauth/authorize?${queryParamStr}`;
}
