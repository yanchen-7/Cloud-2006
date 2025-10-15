import mysql from "mysql2/promise";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

let pool;
let cachedSecret;
let secretsClient;

async function loadSecret(secretName, region) {
  if (!secretName) return null;
  if (cachedSecret) return cachedSecret;

  const clientRegion = region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!clientRegion) {
    throw new Error("AWS region is required to load database secret");
  }

  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({ region: clientRegion });
  }

  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await secretsClient.send(command);
  const secretString = response.SecretString ?? Buffer.from(response.SecretBinary ?? "", "base64").toString("utf-8");
  try {
    cachedSecret = JSON.parse(secretString);
  } catch (err) {
    console.error("Failed to parse DB secret JSON", err);
    throw err;
  }
  return cachedSecret;
}

export async function init(config) {
  const {
    secretName,
    awsRegion,
    ...connectionConfig
  } = config || {};

  try {
    if (secretName) {
      const secret = await loadSecret(secretName, awsRegion);
      if (!secret?.username || !secret?.password) {
        throw new Error(`Secret ${secretName} missing username or password fields`);
      }
      connectionConfig.user = secret.username;
      connectionConfig.password = secret.password;
      if (secret.dbname && !connectionConfig.database) {
        connectionConfig.database = secret.dbname;
      }
      if (secret.host && !connectionConfig.host) {
        connectionConfig.host = secret.host;
      }
      if (secret.port && !connectionConfig.port) {
        connectionConfig.port = Number(secret.port);
      }
    }
  } catch (err) {
    console.error("Falling back to environment credentials after secret retrieval failure:", err);
  }

  pool = mysql.createPool(connectionConfig);
  console.log("Database pool initialized.");
}

export { pool };
