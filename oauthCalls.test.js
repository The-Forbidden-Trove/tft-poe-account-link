const { callProfileApiWithRetryBackoff } = require('./oauthCalls');
const { server } = require('./_testSetup_/msw/server');
const { rest } = require('msw');
const database = require('./database');

jest.mock('./database');

describe('api/profile tests', () => {
    it('should fail and retry the api', async () => {
        server.use(
            rest.get(/.*pathofexile.com\/api\/profile.*/, (_, res, ctx) => {
                const response = {
                    error: 'ono an error'
                };

                return res(
                    ctx.json(response)
                )
            })
        );

        const success = await callProfileApiWithRetryBackoff(
            {
                json: () => Promise.resolve({
                    access_token: 'test'
                })
            },
            {
                send: jest.fn(),
            }
        );

        expect(success).toBe(false);
    }, 7000);

    it('should succeed and go on to link accounts in the database', async () => {
        const success = await callProfileApiWithRetryBackoff(
            {
                json: () => Promise.resolve({
                    access_token: 'test'
                })
            },
            {
                send: jest.fn(),
            }
        );

        expect(success).toBe(true);
    });
});