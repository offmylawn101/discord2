const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const useS3 = !!(process.env.S3_BUCKET && process.env.S3_ENDPOINT);
let s3Client, bucket;

if (useS3) {
  const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  });
  bucket = process.env.S3_BUCKET;
}

async function uploadFile(fileBuffer, filename, contentType) {
  const key = `${uuidv4()}${path.extname(filename)}`;

  if (useS3) {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    }));
    return { key, url: `${process.env.S3_ENDPOINT}/${bucket}/${key}` };
  }

  // Local disk fallback
  const uploadDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, key), fileBuffer);
  return { key, url: `/uploads/${key}` };
}

async function deleteFile(key) {
  if (useS3) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } else {
    const filepath = path.join(__dirname, '..', '..', 'uploads', key);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
}

module.exports = { uploadFile, deleteFile, useS3 };
