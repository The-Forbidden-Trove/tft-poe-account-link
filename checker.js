var mysql2 = require('mysql2');
const request = require('request');

const LINK_TABLE = 'tft_poe_account_links';
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

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

// Get all of the accounts in DB
const getAccounts = async () => {
  const conn = await getConnection();
  const [rows] = await conn.execute(
    `SELECT poe_account_name FROM ${LINK_TABLE}`
  )

  const bannedCheck = rows.map((row) => row['poe_account_name']);

  bannedCheck.forEach(i => {
    sleep(2000);
    checkBannedAccount(i);
  });
}

//Checks if account is banned
const checkBannedAccount = async (poeAcc) => {
  var bannedStr = "<div class=\"roleLabel banned\">Banned</div>"
  request(`https://www.pathofexile.com/account/view-profile/${poeAcc}`, function (
    error,
    body
  ) {
    console.error('error:', error)

    if (body.includes(bannedStr)) {
      console.log(poeAcc);
      return poeAcc;
    }

  })
}
getAccounts();