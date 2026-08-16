"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOrderNumber = generateOrderNumber;
const node_crypto_1 = require("node:crypto");
function generateOrderNumber(date = new Date()) {
    const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 6; i += 1)
        suffix += alphabet[(0, node_crypto_1.randomInt)(alphabet.length)];
    return `BQ-${stamp}-${suffix}`;
}
