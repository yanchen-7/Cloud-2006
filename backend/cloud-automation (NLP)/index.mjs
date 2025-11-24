import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { EMRServerlessClient, StartJobRunCommand } from '@aws-sdk/client-emr-serverless';
import mysql from 'mysql2/promise';
import { PassThrough } from 'stream';

// We fetch these from AWS Environment Variables (Secure)
const CONFIG = {
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  BUCKET_NAME: process.env.BUCKET_NAME, 
  EMR_APP_ID: process.env.EMR_APP_ID,       // Application ID from EMR Console
  EMR_ROLE_ARN: process.env.EMR_ROLE_ARN,   // The IAM Role EMR uses to run
};

const s3 = new S3Client({});
const emr = new EMRServerlessClient({});

// Helper: Convert Database Row to CSV Format
function rowToCSV(row) {
  const dateStr = row.publish_time instanceof Date 
    ? row.publish_time.toISOString().split('T')[0] 
    : row.publish_time;
  
  // Handle commas or quotes in text
  const safe = (val) => val ? `"${String(val).replace(/"/g, '""')}"` : '';
  return `${safe(row.place_id)},${safe(row.review_text)},${safe(row.rating)},${safe(dateStr)}\n`;
}

export const handler = async (event) => {
  console.log("🚀 Starting Daily Data Pipeline...");
  let connection;

  try {
    // 1. CONNECT TO DATABASE
    console.log("🔌 Connecting to MySQL...");
    connection = await mysql.createConnection({
      host: CONFIG.DB_HOST,
      user: CONFIG.DB_USER,
      password: CONFIG.DB_PASSWORD,
      database: CONFIG.DB_NAME,
      ssl: "Amazon RDS" 
    });

    // 2. SETUP STREAMS (MySQL -> Pipe -> S3)
    const passThrough = new PassThrough();
    passThrough.write("place_id,review_text,rating,publish_time\n"); // Header

    const sql = `SELECT place_id, review_text, rating, publish_time FROM review WHERE review_text IS NOT NULL AND review_text != ''`;
    const queryStream = connection.connection.query(sql).stream();

    // Pipe rows from DB to the upload stream
    queryStream.on('data', (row) => passThrough.write(rowToCSV(row)));
    queryStream.on('end', () => passThrough.end());
    queryStream.on('error', (err) => {
      console.error("Stream Error", err);
      passThrough.destroy(err);
    });

    // 3. UPLOAD TO S3
    console.log("🌊 Streaming data to S3...");
    const parallelUpload = new Upload({
      client: s3,
      params: {
        Bucket: CONFIG.BUCKET_NAME,
        Key: "reviews_nlp/input/reviews.csv", // Overwrites the old file
        Body: passThrough,
        ContentType: "text/csv"
      },
      queueSize: 4,
      partSize: 1024 * 1024 * 5, 
    });

    await parallelUpload.done();
    console.log("✅ Data Upload Complete.");

    // 4. TRIGGER EMR SERVERLESS JOB
    console.log("⚡ Triggering EMR Spark Job...");
    
    const emrCommand = new StartJobRunCommand({
      applicationId: CONFIG.EMR_APP_ID,
      executionRoleArn: CONFIG.EMR_ROLE_ARN,
      jobDriver: {
        sparkSubmit: {
          // This assumes your python script is already in S3. 
          // We can upload it manually once since it rarely changes.
          entryPoint: `s3://${CONFIG.BUCKET_NAME}/reviews_nlp/scripts/keyword_extractor.py`,
          entryPointArguments: [
            `s3://${CONFIG.BUCKET_NAME}/reviews_nlp/input/reviews.csv`,
            `s3://${CONFIG.BUCKET_NAME}/reviews_nlp/output/`
          ],
          sparkSubmitParameters: "--conf spark.executor.cores=1 --conf spark.executor.memory=4g --conf spark.driver.cores=1 --conf spark.driver.memory=2g"
        }
      },
      configurationOverrides: {
        monitoringConfiguration: {
          s3MonitoringConfiguration: {
            logUri: `s3://${CONFIG.BUCKET_NAME}/emr-logs/`
          }
        }
      }
    });

    const emrResponse = await emr.send(emrCommand);
    console.log(`✅ Job Started! Run ID: ${emrResponse.jobRunId}`);

    return { statusCode: 200, body: `Pipeline Success. Job ID: ${emrResponse.jobRunId}` };

  } catch (err) {
    console.error("❌ Pipeline Failed:", err);
    throw err;
  } finally {
    if (connection) await connection.end();
  }
};