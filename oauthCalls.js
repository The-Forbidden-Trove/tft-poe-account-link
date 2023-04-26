const nodeFetch = require('node-fetch');
const { linkTftPoeAccounts, addBlacklistedUserAttempt, addBannedPoeUserAttempt } = require('./database');
const { checkBannedAccount } = require('./checker');

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
            pendingResponse.sendFile(__dirname + '/error.html');
        }
        return success;
    }
    return false;
}

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
        const poeCharName = await callCharactersApi(accessToken);
        console.log(poeCharName);

        if (poeAccRealm != "pc") {
            pendingResponse.sendFile(__dirname + '/error.html');
            return false;
        }

        if (blacklist.indexOf(poeAccName.toLowerCase()) > -1) {
            await addBlacklistedUserAttempt(discordId, poeAccName);
            pendingResponse.sendFile(__dirname + '/linked.html');
            console.log(`blacklisted user link attempt at ${new Date()} for ${poeAccName} and ${discordId}`);
            return true;
        }
        const isAccountBanned = await checkBannedAccount(poeAccName);
        if (isAccountBanned === true){
            await addBannedPoeUserAttempt(discordId, poeAccName);
            pendingResponse.sendFile(__dirname + '/linked.html');
            console.log(`Banned user link attempt at ${new Date()} for ${poeAccName} and ${discordId}`);
            return true;
        }


        await linkTftPoeAccounts(discordId, poeAccName, poeAccUUID);
        pendingResponse.sendFile(__dirname + '/linked.html');
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
    const resp = await nodeFetch('https://www.pathofexile.com/api/characters', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Host': 'www.pathofexile.com',
            'User-Agent': 'TftPoeLinker / 1.0'
        },
    }).then(async (charactersResp) => {
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
}
