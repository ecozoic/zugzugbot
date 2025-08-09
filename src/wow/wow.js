const { genResponse } = require('../ai.js');

module.exports = async function buildResponse(message) {
    return await genResponse(message);
};