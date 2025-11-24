import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // NEW: Helper for large files
import { init as initDB, pool } from '../src/mysql.js';

// 1. Load Environment Variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
console.log(`🔹 Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

if (!process.env.DB_HOST) {
  console.error("❌ CRITICAL ERROR: DB_HOST is undefined.");
  process.exit(1);
}

const BUCKET_NAME = "cloud-2006-bucket-vf6xtl9u"; 
const REGION = process.env.AWS_REGION || "us-east-1";
const TEMP_FILE_PATH = path.resolve(__dirname, 'temp_reviews.csv');

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    // sessionToken is removed since you are using permanent user keys
  }
});

// Helper: Convert row object to CSV string
const rowToCSV = (row) => {
  const dateStr = row.publish_time instanceof Date 
    ? row.publish_time.toISOString().split('T')[0] 
    : row.publish_time;

  const safeText = (val) => {
    if (val === null || val === undefined) return '';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  return `${safeText(row.place_id)},${safeText(row.review_text)},${safeText(row.rating)},${safeText(dateStr)}\n`;
};

async function run() {
  console.log("🚀 Starting Data Deployment (Multipart Mode)...");
  let connection;

  try {
    // A. Initialize DB
    await initDB({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT || 3306),
      ssl: process.env.DB_SSL_MODE || "Amazon RDS",
      awsRegion: REGION
    });

    // B. Stream Data to Local File
    console.log("🌊 Opening DB Stream -> Local File...");
    const writeStream = fs.createWriteStream(TEMP_FILE_PATH);
    writeStream.write("place_id,review_text,rating,publish_time\n");

    connection = await pool.getConnection();
    const sql = `SELECT place_id, review_text, rating, publish_time FROM review WHERE review_text IS NOT NULL AND review_text != ''`;
    const queryStream = connection.connection.query(sql).stream();

    let count = 0;

    await new Promise((resolve, reject) => {
      queryStream
        .on('error', (err) => reject(err))
        .on('data', (row) => {
          count++;
          const canWrite = writeStream.write(rowToCSV(row));
          if (!canWrite) {
            queryStream.pause();
            writeStream.once('drain', () => queryStream.resume());
          }
          if (count % 10000 === 0) process.stdout.write(`\rProcessed ${count} rows...`);
        })
        .on('end', () => {
          writeStream.end();
          console.log(`\n✅ Finished writing ${count} rows to disk.`);
          resolve();
        });
    });

    // C. Upload to S3 using Multipart Upload (The Fix)
    console.log("cloud-upload Starting Multipart Upload to S3...");
    const fileContent = fs.createReadStream(TEMP_FILE_PATH);
    
    // Use the Upload utility for reliability
    const parallelUpload = new Upload({
      client: s3,
      params: {
        Bucket: BUCKET_NAME,
        Key: "reviews_nlp/input/reviews.csv",
        Body: fileContent,
        ContentType: "text/csv"
      },
      queueSize: 4, // Upload 4 chunks in parallel
      partSize: 1024 * 1024 * 10, // 10MB chunks
    });

    parallelUpload.on("httpUploadProgress", (progress) => {
      const percent = Math.round((progress.loaded / progress.total) * 100);
      process.stdout.write(`\rUploading: ${percent}% done...`);
    });

    await parallelUpload.done();
    console.log("\n✅ Data uploaded successfully to S3.");

    // D. Upload Python Script (Small file, simple Put is fine)
    console.log("🐍 Uploading Python Script...");
    const scriptPath = path.resolve(__dirname, '../src/jobs/spark/keyword_extractor.py');
    const scriptContent = fs.readFileSync(scriptPath);
    
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: "reviews_nlp/scripts/keyword_extractor.py",
      Body: scriptContent,
      ContentType: "text/x-python"
    }));
    console.log("✅ Script uploaded.");

  } catch (err) {
    console.error("\n❌ Error:", err);
  } finally {
    if (fs.existsSync(TEMP_FILE_PATH)) {
        console.log("🧹 Cleaning up local temp file...");
        fs.unlinkSync(TEMP_FILE_PATH);
    }
    if (connection) connection.release();
    if (pool) await pool.end();
    process.exit();
  }
}

run();