const mysql2 = require('mysql2');

const LINK_TABLE = 'tft_poe_account_links';
const STATE_DISCORD_ID_TABLE = 'state_discord_id_temp_link';
const BLACKLISTED_USER_ATTEMPT_TABLE = 'blacklisted_user_link_attempts';

const pool = mysql2.createPool({
  host: process.env.dbHost,
  user: process.env.dbUser,
  password: process.env.dbPassword,
  database: process.env.dbName,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 10,
});

const getConnection = async () => {
  return pool.promise();
}

const addBlacklistedUserAttempt = async (discordId, poeAccountName) => {
  const connection = await getConnection();
  await connection.execute(`INSERT INTO ${BLACKLISTED_USER_ATTEMPT_TABLE} (discord_id, poe_account_name) VALUES ("${discordId}", "${poeAccountName}")`);
};

const getBlacklistedUserAttempts = async () => {
  const conn = await getConnection();
  const [rows] = await conn.execute(
    `SELECT id, discord_id, poe_account_name FROM ${BLACKLISTED_USER_ATTEMPT_TABLE}`
  );

  const ids = rows.map((row) => row['id']);

  const attempts = rows.map((row) => ({
    discordId: row['discord_id'],
    poeAcc: row['poe_account_name']
  }));

  if (ids.length > 0) {
    await conn.execute(`DELETE FROM ${BLACKLISTED_USER_ATTEMPT_TABLE} WHERE id IN (${ids.join(',')})`);
  }

  return attempts;
}

const getAllUnassignedLinkedUserIds = async () => {
  const conn = await getConnection();
  const [rows] = await conn.execute(
    `SELECT discord_id FROM ${LINK_TABLE} WHERE role_assigned = 0`
  );
  const ids = rows.map((row) => row['discord_id']);
  return ids;
}

const updateUnassignedLinkedUser = async (discord_id) => {
  const conn = await getConnection();
  await conn.execute(
    `UPDATE ${LINK_TABLE} SET role_assigned = 1 WHERE discord_id = ${discord_id}`
  );
}

const getPoeTftStateLinkByDiscordId = async (discordId) => {
  const conn = await getConnection();
  const [rows] = await conn.execute(
    `SELECT poe_account_name FROM ${LINK_TABLE} WHERE discord_id = ?`,
    [discordId]
  );

  let retVal = false

  if (rows.length > 0) {
    if (rows.length === 1) {
      retVal = rows[0]['poe_account_name'];
    } else {
      console.log(`User somehow has more than two entries in ${LINK_TABLE} for discord id ${discordId}`);
    }
  }
  return retVal;
}

const getPoeTftStateLinkByPoeAccount = async (poeAccountName) => {
  const conn = await getConnection();
  const [rows] = await conn.execute(
    `SELECT discord_id FROM ${LINK_TABLE} WHERE poe_account_name = ?`,
    [poeAccountName]
  );

  let retVal = false;

  if (rows.length > 0) {
    if (rows.length === 1) {
      retVal = String(rows[0]['discord_id']);
    } else {
      console.log(`User somehow has more than two entries in ${LINK_TABLE} for poeAccountName ${poeAccountName}`);
    }
  }
  return retVal;
}

//unlink command
const unlinkDiscordID = async (discordId) => {
  const conn = await getConnection();
  const [rows] = await conn.execute(
    `DELETE FROM ${LINK_TABLE} WHERE discord_id = ${discordId}`
  );
}


const createStateDiscordIdLink = async (state, discordId) => {
  const connection = await getConnection();
  await connection.execute(`INSERT INTO ${STATE_DISCORD_ID_TABLE} (state, discord_id) VALUES ("${state}", "${discordId}")`);
}

const getDiscordIdStateLink = async (state) => {
  let discordId;
  const connection = await getConnection();
  const [rows] = await connection.execute(
    `SELECT discord_id FROM ${STATE_DISCORD_ID_TABLE} WHERE state = "${state}"`
  );
  // console.log(JSON.stringify(rows))
  if (rows.length === 1) {
    rows.forEach((row) => {
      discordId = row['discord_id']
    })
  }

  // console.log(`discid2: ${discordId}`)
  return discordId;
}



const linkTftPoeAccounts = async (discordId, poeAccountName) => {
  const isLinked = await getPoeTftStateLinkByDiscordId(discordId);
  if (isLinked) {
    return;
  }

  const connection = await getConnection();
  await connection.execute(
    `INSERT INTO ${LINK_TABLE} (poe_account_name, discord_id, datetime_linked) VALUES ("${poeAccountName}", "${discordId}", NOW())`
  );
}

module.exports = {
  createStateDiscordIdLink,
  getDiscordIdStateLink,
  linkTftPoeAccounts,
  getPoeTftStateLinkByDiscordId,
  getPoeTftStateLinkByPoeAccount,
  getAllUnassignedLinkedUserIds,
  updateUnassignedLinkedUser,
  addBlacklistedUserAttempt,
  getBlacklistedUserAttempts,
  unlinkDiscordID,
}