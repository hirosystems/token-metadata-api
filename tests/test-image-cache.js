#!/usr/bin/env node
const imgUrl = process.argv[2].toString();
console.log(`${imgUrl}?processed=true`);
console.log(`${imgUrl}?processed=true&thumb=true`);
