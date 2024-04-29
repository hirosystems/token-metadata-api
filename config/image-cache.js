#!/usr/bin/env node
const sharp = require('sharp');
const { stream, Agent } = require('undici');
const fs = require('fs');
const path = require('path');

async function downloadImage(url, outputPath) {
  return new Promise(async (resolve, reject) => {
    const fileStream = fs.createWriteStream(outputPath);
    stream(
      url,
      {
        method: 'GET',
        opaque: fileStream,
        dispatcher: new Agent({
          headersTimeout: process.env['METADATA_FETCH_TIMEOUT_MS'],
          bodyTimeout: process.env['METADATA_FETCH_TIMEOUT_MS'],
          maxRedirections: process.env['METADATA_FETCH_MAX_REDIRECTIONS'],
          // maxResponseSize: process.env.METADATA_MAX_PAYLOAD_BYTE_SIZE,
          connect: {
            rejectUnauthorized: false, // Ignore SSL cert errors.
          },
        }),
      },
      ({ statusCode, headers, opaque: fileStream }) => {
        if (statusCode !== 200)
          reject(new Error(`Failed to fetch image with status code: ${statusCode}`));
        else return fileStream;
      }
    )
      .then(() => {
        fileStream.on('finish', resolve);
        fileStream.on('error', error => {
          reject(new Error('Error writing file: ' + error.message));
        });
      })
      .catch(error => {
        fileStream.close();
        reject(new Error('Error downloading image: ' + error.message));
      });
  });
}

async function resizeImage() {
  //
}

async function uploadImageToCdn() {
  //
}

const imgUrl = process.argv[2];
const contractPrincipal = process.argv[3];
const tokenNumber = process.argv[4];

const tmpPath = `./tmp/${contractPrincipal}/`;
fs.mkdir(tmpPath, { recursive: true });
downloadImage(imgUrl, `${tmpPath}/${tokenNumber}.png`);

// const encodedUrl = encodeURIComponent(imgUrl);
// const [imgixDomain, imgixToken] = [process.env['IMGIX_DOMAIN'], process.env['IMGIX_TOKEN']];
// const signature = require('crypto')
//   .createHash('md5')
//   .update(imgixToken + '/' + encodedUrl)
//   .digest('hex');

// const resultUrl = new URL(encodedUrl + '?s=' + signature, imgixDomain);
// console.log(resultUrl.toString());
