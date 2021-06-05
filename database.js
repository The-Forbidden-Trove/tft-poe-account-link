const mysql = require('mysql2/promise');

const LINK_TABLE = 'tft_poe_account_links';
const STATE_DISCORD_ID_TABLE = 'state_discord_id_temp_link';

const createConnection = async () => {
  const connection = await mysql.createConnection({
    host: process.env.dbHost,
    user: process.env.dbUser,
    password: process.env.dbPassword,
    database: process.env.dbName
  });

  await connection.connect();
  return connection;
}

const getAllUnassignedLinkedUserIds = async () => {
  const conn = await createConnection();
  const [rows] = await conn.execute(
    `SELECT discord_id FROM ${LINK_TABLE} WHERE role_assigned = 0`
  );
  const ids = rows.map((row) => row['discord_id']);
  await conn.end();
  return ids;
}

const updateUnassignedLinkedUser = async (discord_id) => {
  const conn = await createConnection();
  await conn.execute(
    `UPDATE ${LINK_TABLE} SET role_assigned = 1 WHERE discord_id = ${discord_id}`
  )
  await conn.commit();
  await conn.end();
}

const getPoeTftStateLinkByDiscordId = async (discordId) => {
  const conn = await createConnection();
  const [rows] = await conn.execute(
    `SELECT poe_account_name FROM ${LINK_TABLE} WHERE discord_id = "${discordId}"`
  );

  if (rows.length > 0) {
    if (rows.length === 1) {
      return rows[0]['poe_account_name'];
    } else {
      console.log(`User somehow has more than two entries in ${LINK_TABLE} for discord id ${discordId}`);
      return false;
    }
  }
  return false;
}

const getPoeTftStateLinkByPoeAccount = async (poeAccountName) => {
  const conn = await createConnection();
  const [rows] = await conn.execute(
    `SELECT discord_id FROM ${LINK_TABLE} WHERE poe_account_name = "${poeAccountName}"`
  );

  if (rows.length > 0) {
    if (rows.length === 1) {
      return String(rows[0]['discord_id']);
    } else {
      console.log(`User somehow has more than two entries in ${LINK_TABLE} for poeAccountName ${poeAccountName}`);
      return false;
    }
  }
  return false;
}

const createStateDiscordIdLink = async (state, discordId) => {
  const connection = await createConnection();
  await connection.execute(`INSERT INTO ${STATE_DISCORD_ID_TABLE} (state, discord_id) VALUES ("${state}", "${discordId}")`);
  await connection.commit();
  await connection.end();
}

const getDiscordIdStateLink = async (state) => {
  let discordId;
  const connection = await createConnection();
  const [rows] = await connection.execute(
    `SELECT discord_id FROM ${STATE_DISCORD_ID_TABLE} WHERE state = "${state}"`
  );
  // console.log(JSON.stringify(rows))
  if (rows.length === 1) {
    rows.forEach((row) => {
      discordId = row['discord_id']
    })
  }
  await connection.end();

  // console.log(`discid2: ${discordId}`)
  return discordId;
}



const linkTftPoeAccounts = async (discordId, poeAccountName) => {
  // console.log(`linking accounts discord: ${discordId} and poe acc: ${poeAccountName}`)
  const connection = await createConnection();
  await connection.execute(
    `INSERT INTO ${LINK_TABLE} (poe_account_name, discord_id, datetime_linked) VALUES ("${poeAccountName}", "${discordId}", NOW())`
  );
  await connection.commit();
  await connection.end();
}

module.exports = {
  createStateDiscordIdLink,
  getDiscordIdStateLink,
  linkTftPoeAccounts,
  getPoeTftStateLinkByDiscordId,
  getPoeTftStateLinkByPoeAccount,
  getAllUnassignedLinkedUserIds,
  updateUnassignedLinkedUser,
}