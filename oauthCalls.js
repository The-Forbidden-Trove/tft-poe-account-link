const nodeFetch = require('node-fetch');
const Discord = require('discord.js');
const express = require('express');
const { addBlacklistedUserAttempt, addBannedPoeUserAttempt, getPoeTftStateLinkByDiscordId, linkTftPoeAccounts } = require('./database');
const { checkBannedAccount } = require('./checker');

const LINKED_TFT_POE_ROLE_ID = '848751148478758914';
const TFT_SERVER_ID = '645607528297922560';
const MODMAIL_CATEGORY = '834148931213852743';

/**
 * @type {Discord.Client}
 */
let giveLinkRoleClient;
if (process.env.RUN_TYPE === 'server' && giveLinkRoleClient === undefined) {
    giveLinkRoleClient = new Discord.Client({
        intents: [
            Discord.Intents.FLAGS.GUILDS,
            Discord.Intents.FLAGS.GUILD_MEMBERS,
        ]
    });
    giveLinkRoleClient.login(process.env.giveLinkRole.trim());
}

const assignTftVerifiedRole = async (discordUserId) => {
    const guild = await giveLinkRoleClient.guilds.fetch(TFT_SERVER_ID, true);
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
    const guild = await giveLinkRoleClient.guilds.fetch(TFT_SERVER_ID, true);
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

const callProfileApiWithRetryBackoff = async (tokenResp, pendingResponse, discordId, blacklist) => {
    const jsonResp = await tokenResp.json();
    // console.log(`jsonResp: ${JSON.stringify(jsonResp)}`);
    if (jsonResp['access_token'] > "") {
        const MAX_RETRIES = 3;
        let curRetries = 0;
        let success = await callProfileApi(jsonResp['access_token'], pendingResponse, discordId, blacklist);
        while (curRetries < MAX_RETRIES) {
            if (!success) {
                curRetries++;
                await new Promise(resolve => setTimeout(resolve, curRetries * 1000));
                success = await callProfileApi(jsonResp['access_token'], pendingResponse, discordId, blacklist);
            } else {
                break;
            }
        }
        if (!success) {
            pendingResponse.redirect('https://dyno.gg/form/e6fe79a8');
        }
        return success;
    }
    return false;
}

/**
 * 
 * @param {*} accessToken 
 * @param {express.Response} pendingResponse 
 * @param {*} discordId 
 * @param {*} blacklist 
 * @returns 
 */
const callProfileApi = async (accessToken, pendingResponse, discordId, blacklist) => {
    const resp = await nodeFetch('https://www.pathofexile.com/api/profile', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Host': 'www.pathofexile.com',
            'User-Agent': 'TftPoeLinker / 1.0'
        },
    }).then(async (profileResp) => {
        // console.log(`JSON.stringify(profileResp): ${JSON.stringify(profileResp)}`)
        // console.log(`profileResp: ${JSON.stringify(profileResp)}`)
        const profileRespJson = await profileResp.json();
        // console.log(`profileRespJson: ${JSON.stringify(profileRespJson)}`)
        if (profileRespJson['error'] !== undefined) {
            return false;
        }
        const poeAccName = profileRespJson.name;
        const poeAccRealm = profileRespJson.realm;
        const poeAccUUID = profileRespJson.uuid;
        //const poeCharName = await callCharactersApi(accessToken);
        //console.log(poeCharName);

        if (poeAccRealm != "pc") {
            pendingResponse.redirect('https://dyno.gg/form/e6fe79a8');
            return false;
        }

        if (blacklist.indexOf(poeAccName.toLowerCase()) > -1) {
            await addBlacklistedUserAttempt(discordId, poeAccName, poeAccUUID);
            pendingResponse.sendFile(__dirname + '/linked.html');
            console.log(`blacklisted user link attempt at ${new Date()} for ${poeAccName} and ${discordId}`);
            return true;
        }
        const isAccountBanned = await checkBannedAccount(poeAccName);
        if (isAccountBanned === true) {
            await addBannedPoeUserAttempt(discordId, poeAccName, poeAccUUID);
            pendingResponse.sendFile(__dirname + '/linked.html');
            console.log(`Banned user link attempt at ${new Date()} for ${poeAccName} and ${discordId}`);
            return true;
        }


        await linkTftPoeAccounts(discordId, poeAccName, poeAccUUID);
        await assignTftVerifiedRole(discordId);

        const guild = await giveLinkRoleClient.guilds.fetch(TFT_SERVER_ID, true);
        /**
         * @type {Discord.GuildMember}
         */
        let guildMember;
        try {
            guildMember = await guild.members.fetch({ user: String(discordId), cache: false });
        } catch (e) {
            console.log(e.stack);
            console.log(e.message);
            return Promise.resolve(new Error('user does not exist'));
        }
        if (guildMember) {
            const isTradeRestricted = guildMember.roles.cache.find(role => role.id === '749016638187372565');
            if (isTradeRestricted) {
                pendingResponse.redirect('https://dyno.gg/form/ea4bf8e5');
                return true
            }
        }
        pendingResponse.send('You have successfully linked your PoE account to TFT.\n Welcome to TFT! Please read ⁠<#667298412596559904>, ⁠<#669127045678104587> and <#805209481049800765>. \nAlso check out our blacklist tool which helps protect you from blacklisted users in game. You can find more info here https://discord.com/channels/645607528297922560/667298412596559904/869892738714333204 - enjoy your time trading on TFT!\n You can now close this tab.');
        return true;
    }, (rejectProfileReason) => {
        console.log(`rejectProfileReason: ${JSON.stringify(rejectProfileReason)}`)
        return false;
    }).catch((reason) => {
        console.log(`exception in api/profile call: ${reason}`);
        return false;
    });

    return resp;
}

const callCharactersApi = async (accessToken) => {
    const resp = await nodeFetch('https://www.pathofexile.com/api/character', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Host': 'www.pathofexile.com',
            'User-Agent': 'TftPoeLinker / 1.0'
        },
    }).then(async (charactersResp) => {
        console.log(charactersResp);
        const charactersRespJson = await charactersResp.json();
        if (charactersRespJson['error'] !== undefined) {
            return false;
        }
        const poeCharacters = charactersRespJson.characters;
        return poeCharacters;
    }, (rejectProfileReason) => {
        console.log(`rejectProfileReason: ${JSON.stringify(rejectProfileReason)}`)
        return false;
    }).catch((reason) => {
        console.log(`exception in api/profile call: ${reason}`);
        return false;
    });
    return resp;
}


module.exports = {
    callProfileApiWithRetryBackoff,
    callCharactersApi,
}
