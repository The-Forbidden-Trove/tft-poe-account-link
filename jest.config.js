module.exports = {
    testMatch: [
        "**/*.test.js",
    ],
    setupFilesAfterEnv: [
        "<rootDir>/_testSetup_/msw/setupTests.js"
    ],
    roots: [
        "."
    ],
}