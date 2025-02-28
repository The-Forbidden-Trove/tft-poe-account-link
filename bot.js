const Discord = require('discord.js');
/**
 * @type {Discord.Client}
 */
let client;

if (process.env.RUN_TYPE !== 'server') {
  client = new Discord.Client({
    partials: ['CHANNEL', 'REACTION', 'MESSAGE'],
    presence: {
      activityName: 'DM me to verify',
      activityType: 'PLAYING'
    },
    intents: [
      Discord.Intents.FLAGS.GUILDS,
      Discord.Intents.FLAGS.GUILD_PRESENCES,
      Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
      Discord.Intents.FLAGS.GUILD_MEMBERS,
      Discord.Intents.FLAGS.MESSAGE_CONTENT,
      Discord.Intents.FLAGS.GUILD_MESSAGES,
      Discord.Intents.FLAGS.DIRECT_MESSAGES,
      Discord.Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
      Discord.Intents.FLAGS.DIRECT_MESSAGE_TYPING,
    ]
  });
}
const { v4 } = require('uuid');
const {
  createStateDiscordIdLink,
  getPoeTftStateLinkByDiscordId,
  getPoeTftStateLinkByPoeAccount,
  getBlacklistedUserAttempts,
  unlinkDiscordID,
  getBannedPoeUserAttempts,
  getAllDataFromDB,
  getPoeUuidByDiscordId
} = require('./database');
const dotenv = require('dotenv');
const nfetch = require('node-fetch');

const BOT_CONTROL_CHANNEL_ID = process.env.botControlId;
const REMOVE_TR_CHANNEL_ID = process.env.removeTrChannelId?.trim();
const CANT_LINK_CHANNEL_ID = process.env.cantLinkChannelId?.trim();
const MODMAIL_CATEGORY = '834148931213852743';
const MOD_ALERT_CHANNEL_ID = process.env.modAlertChannelId;
const LINKED_TFT_POE_ROLE_ID = '848751148478758914';
const LINKED_TFT_POE_ROLE_ID_NEW = '1307963535074131968';
const TFT_SERVER_ID = '645607528297922560';

if (process.env.NODE_ENV === 'dev' && process.env.testEnvProp === undefined) {
  dotenv.config({ path: __dirname + '/.env_dev' });
}

if (process.env.RUN_TYPE !== 'server') {
  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('DM me to verify')
    console.log(`Activity set to ${JSON.stringify(client.user.presence.activities)}`)
  });

  client.on('rateLimit', (rateLimitInfo) => {
    console.log(`Rate limited: ${JSON.stringify(rateLimitInfo)}`);
  });

  const postVerificationStuff = async (thread) => {
    const threadMsg = await thread.fetchStarterMessage();
    const footer = threadMsg?.embeds?.[0]?.footer?.text;
    if (!footer) {
      console.log(`no footer found, embeds?: ${threadMsg?.embeds?.length} -- ${JSON.stringify(threadMsg?.embeds?.[0]?.fields || '')}`);
    }
    const userId = footer.replace('User ID: ', '').trim();
    const poeAccount = await getPoeTftStateLinkByDiscordId(userId);
    const poeUuid = await getPoeUuidByDiscordId(userId);

    if (poeAccount !== false && poeAccount > "") {
      //Challenges completed
      const verificationInfo = `POE account:  \`${poeAccount}\` [${poeUuid}] (Discord: ${userId} - <@${userId}>)\n`
        + `POE url: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount.replace('#', '-'))}?discordid=${userId}&uuid=${poeUuid}\n`
        + `Please check https://www.pathofexile.com/account/view-profile/${encodeURIComponent(poeAccount.replace('#', '-'))}/challenges for their challenges\n\n`;
      await thread.send(verificationInfo);
      await thread.send(`Please, **don't forget to use the blacklist check from the yoink in their profile**`);
      if (thread.parentId !== REMOVE_TR_CHANNEL_ID) {
        return;
      }
      await thread.send(`Paste the info from the yoink into bot-control so that Tina can put it into the DB. Then, please use one of these commands in <#716528634092847154>:\n\n
      🟩 No action needed:\n
      \`?noaction ${userId}\`\n
      -# User has no restrictions, doesn't need verifying\n\n

      ✅  Approve:\n
      \`?trapprove ${userId}\`\n
      approves the user for TFT\n\n
      
      ❌ Reject (bad form):\n
      \`?trreject ${userId}\`\n
      private accounts, random answers\n\n
      
      🕒 Reject (too new):\n
      \`?trunmetreq ${userId}\`\n
      their account is younger than 30 days/their character is below lvl 85\n\n
      
      📩 Advanced case/more info needed:\n
      \`?trmm ${userId}\`\n
      previous poe/discord accounts, discord search turned up something, etc\n\n

      If you want to verify a user _just_ for POE2, use \`?poe2 ${userId}\` which will remove TR, adds poe1 locked role and time traveller role.\n
      If you want to force a user to link/fill out the form, use \`?link ${userId}\` which will send them a DM instructing them to do so, and add TR to them.\n\n
      
      After this close the thread with \`#closetr\``);
      return
    } else {
      await thread.send(`No POE account found for discord id ${userId} - user is not linked!\n\n
      To reject the user due to not being linked yet, please use the command \`?trreject ${userId}\` to send a rejection DM to them via dyno, then use the command\n\`#closetr\`\n to remove this thread.\n`);
    }
    return;
  }


  client.on('messageCreate', async (message) => {
    // is private message
    if (message.author.dmChannel && message.channel.id == message.author.dmChannel.id) {
      const isLinked = await getPoeTftStateLinkByDiscordId(message.author.id);
      if (isLinked) {
        if (isLinked.match(/#/)) {
          await message.author.dmChannel.send('You have already linked your POE account with the TFT-POE account linker! If you can\'t see the trade channels, please fill out this form https://dyno.gg/form/ea4bf8e5 and the team will be in touch. Please be **patient** as there are many applications that come in every single day, and they all need a final vetting by a moderator before approval. This may take a number of days, or in peak times, sometimes a week or more.');
          await assignTftVerifiedRole(message.author.id);
          return;  
        }
        else {
          const botControlChannel = await client.channels.fetch(BOT_CONTROL_CHANNEL_ID, true);
          await botControlChannel.send(`User ${message.author.id} with link ${isLinked} has been unlinked so they can link their account with discriminator.`);
          unlinkDiscordID(message.author.id);
        }
      }
      const generatedState = v4();
      await createStateDiscordIdLink(generatedState, message.author.id);
      await message.author.dmChannel.send(
        `Click here to authorize with the GGG oauth servers: ${buildAuthorizeURL(generatedState)} `
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
          await botControl.send(`Discord account with id ${userId} was successfully unlinked(from within a modmail).`);
          await message.channel.send(`Discord account with id ${userId} was successfully unlinked.`);
          return;
        }
      }
      if (lowerCaseContent.startsWith('=cdl')) {
        const poeAccount = await getPoeTftStateLinkByDiscordId(userId);
        const poeUuid = await getPoeUuidByDiscordId(userId);
        if (poeAccount !== false && poeAccount > "") {
          await message.channel.send(`The POE account linked to discord id ${userId} (<@${userId}>) is ${poeAccount} [${poeUuid}]`);
          await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount.replace('#','-'))}?discordid=${userId}&uuid=${poeUuid}`)
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

        if (lowerCaseContent.includes('advcdl')) {
          if (!message.member.roles.cache.find(r => r.id === '688053164037243179')) {
            await message.channel.send('You do not have permission to run this command.')
            return;
          }
          const userId = splitContent[1]
          const poeAccount = await getPoeTftStateLinkByDiscordId(userId);
          const poeUuid = await getPoeUuidByDiscordId(userId);
          if (poeAccount !== false && poeAccount > "") {
            await message.channel.send(`The POE account linked to discord id ${userId} (<@${userId}>) is ${poeAccount} [${poeUuid}]`);
            await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount.replace('#','-'))}?discordid=${userId}&uuid=${poeUuid}`);
            const charsResp = await nfetch(`https://www.pathofexile.com/character-window/get-characters?accountName=${encodeURIComponent(poeAccount)}`, {
              headers: {
                'Content-Type': 'application/json',
                'Host': 'www.pathofexile.com',
                'User-Agent': 'TftPoeLinkerCheck / 2.0'
              }
            });
            await new Promise((resolve) => setTimeout(resolve, 1000)); // wait 1 second to not get ratelimited
            const charsJson = await charsResp.json().catch((e) => {
              console.log(e);
              return '';
            });
            const chars = charsJson !== '' ? charsJson.map((char) => char.name) : 'No chars found - maybe private?';
            if (charsJson !== '') {
              await message.channel.send(`\`\`\`${chars.join(', ')}\`\`\`\n`);
            } else {
              await message.channel.send(chars);
            }
          }
          return;
        }

        if (message.content.includes(process.env.chkDiscCmd) || message.content.includes('dldata')) {
          await getAllDataFromDB();
          await message.channel.send({
            files: [{
              attachment: "./linkeddata.txt",
              name: "linkeddata.txt"
            }],
          });
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
            await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount.replace('#','-'))}?discordid=${splitContent[1]}&uuid=${poeUuid}`)
            return
          }
          await message.channel.send(`No POE account found for discord id ${splitContent[1]}`);
          return;
        }
        if (lowerCaseContent.includes(process.env.chkpoecmd) || lowerCaseContent.includes('cpl')) {
          let discordId = await getPoeTftStateLinkByPoeAccount(splitContent[1]);
          let poeUuid = await getPoeUuidByDiscordId(discordId);
          let triedWithoutDiscriminator = false;
          if (discordId === false || discordId <= "") {
            discordId = await getPoeTftStateLinkByPoeAccount(splitContent[1].replace(/#.*/, ''));
            poeUuid = await getPoeUuidByDiscordId(discordId);
            triedWithoutDiscriminator = true;
          }
          if (discordId !== false && discordId > "") {
            await message.channel.send(`The discord id linked to the POE account ${splitContent[1]} is ${discordId} (<@${discordId}>)`);
            await message.channel.send(`Their pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(splitContent[1].replace('#', '-'))}`)
            if (triedWithoutDiscriminator) {
              await message.channel.send(`This lookup was done on the account name **without the discriminator** as a link to one with the given discriminator could not be found. Please double check discriminator and IGNs!`);
            }
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
    if (message.channel.parentId == REMOVE_TR_CHANNEL_ID || message.channel.parentId == CANT_LINK_CHANNEL_ID || message.channel.parentId === '772961816379785226') {
      const lowerCaseContent = message.content.toLowerCase().trim();
      if (lowerCaseContent === '#closetr') {
        const startingThreadMsg = await message.channel.fetchStarterMessage();
        await message.channel.delete();
        await startingThreadMsg.delete();
        return;
      }
      if ((message.channel.parentId == REMOVE_TR_CHANNEL_ID || message.channel.parentId === '772961816379785226') && lowerCaseContent === '#resendinfo') {
        await postVerificationStuff(message.channel);
      }
    }
  });

  client.on('messageReactionAdd', async (_reaction, user) => {
    const reaction = _reaction.partial ? await _reaction.fetch() : _reaction;
    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (message.channel.id === REMOVE_TR_CHANNEL_ID) {
      if (message.hasThread) {
        return;
      }
      const title = message?.embeds?.[0]?.title
      const newThread = await message.startThread({
        name: `${title} - Remove Trade Restriction`,
        autoArchiveDuration: "MAX",
      });
      await newThread.send(`User <@${user.id}> is taking this case.`);
      await postVerificationStuff(newThread);
    }
    if (message.channel.id === '1218578682889900112' || message.channel.id === '1317363510790852629') {
      if (reaction.emoji.name == '❌' || reaction.emoji.name == '✅') {
        await message.delete()
      }
    }
  });

  client.login(process.env.botToken);

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
    await guildMember.roles.add(LINKED_TFT_POE_ROLE_ID_NEW);
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
    "description": `The user in this modmail has linked a PoE account.\nTheir pathofexile account url is: https://www.pathofexile.com/account/view-profile/${encodeURI(poeAccount.replace('#', '-'))}?discordid=${discordUserId}`,
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
