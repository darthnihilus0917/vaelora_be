const crypto = require('crypto');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const r2Client = require('../config/r2Client');

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = String(process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

function buildKey(productId, originalName) {
  const ext = (String(originalName).match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
  return `products/${productId}/${crypto.randomUUID()}${ext}`;
}

async function uploadImage(productId, file) {
  const key = buildKey(productId, file.originalname);

  await r2Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  return { key, url: `${PUBLIC_URL}/${key}` };
}

async function deleteImage(key) {
  await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { uploadImage, deleteImage };
