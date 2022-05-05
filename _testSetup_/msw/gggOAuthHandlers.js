const { rest } = require('msw');

const handlers = [
    rest.get(/.*pathofexile.com\/api\/profile.*/, (_, res, ctx) => {
        const response = {
            name: 'mycoolaccount'
        };
        return res(
            ctx.json(response)
        );
    })
];

module.exports = {
    handlers,
}