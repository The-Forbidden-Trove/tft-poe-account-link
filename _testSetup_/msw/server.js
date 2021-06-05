const { setupServer } = require('msw/node');
const { handlers: gggOAuthHandlers }  = require('./gggOAuthHandlers');

const server = setupServer(...gggOAuthHandlers);

module.exports = {
    server,
}