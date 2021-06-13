const nodeFetch = require('node-fetch');
const parse = require('csv-parse/lib/sync')

const getBlacklistedAccountNames = async () => {
    const blacklistRes = await nodeFetch('https://raw.githubusercontent.com/The-Forbidden-Trove/ForbiddenTroveBlacklist/main/blacklist.csv');
    const csvText = await blacklistRes.text()
    return parse(csvText.replace(/['"]+/g, ''), {
        skipLinesWithError: true,
        columns: true,
        skip_empty_lines: true
    }).map((csvEntry) => csvEntry.account_name.toLowerCase());
}

module.exports = {
    getBlacklistedAccountNames,
}