import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const ATHENA_DB = process.env.ATHENA_DB || process.env.ATHENA_DATABASE || "cloud_2006_recommender";
const ATHENA_OUTPUT =
  process.env.ATHENA_OUTPUT ||
  process.env.ATHENA_OUTPUT_LOCATION ||
  "s3://cloud-2006-bucket-vf6xtl9u/athena-results/";
const ATHENA_WORKGROUP = process.env.ATHENA_WORKGROUP || "primary";
const POLL_INTERVAL_MS = Number(process.env.ATHENA_POLL_INTERVAL_MS || 1000);
const POLL_TIMEOUT_MS = Number(process.env.ATHENA_POLL_TIMEOUT_MS || 45000);

const athena = new AthenaClient({ region: REGION });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForQueryCompletion(queryExecutionId) {
  const started = Date.now();

  while (true) {
    const response = await athena.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );

    const execution = response.QueryExecution;
    const state = execution?.Status?.State;

    if (state === "SUCCEEDED") {
      return execution;
    }

    if (state === "FAILED" || state === "CANCELLED") {
      const reason = execution?.Status?.StateChangeReason || "Unknown reason";
      throw new Error(`Athena query ${state}: ${reason}`);
    }

    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new Error(
        `Athena query timed out after ${POLL_TIMEOUT_MS}ms (id: ${queryExecutionId})`
      );
    }

    await delay(POLL_INTERVAL_MS);
  }
}

function parseRows(header, dataRows) {
  if (!header?.length || !dataRows?.length) return [];
  return dataRows.map((row) => {
    const obj = {};
    row.Data.forEach((col, i) => {
      obj[header[i]] = col?.VarCharValue ?? null;
    });
    return obj;
  });
}

async function fetchResults(queryExecutionId) {
  let nextToken;
  let header;
  const dataRows = [];

  do {
    const response = await athena.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        NextToken: nextToken,
      })
    );

    const rows = response.ResultSet?.Rows || [];
    if (!header && rows.length) {
      // First row of first page is the header
      header = rows[0].Data.map((d) => d.VarCharValue);
      dataRows.push(...rows.slice(1));
    } else {
      dataRows.push(...rows);
    }

    nextToken = response.NextToken;
  } while (nextToken);

  if (!header) return [];
  return parseRows(header, dataRows);
}

/**
 * Run an Athena query.
 * Optional outputLocation lets callers write results to a different S3 prefix.
 */
export async function runAthenaQuery(sql, { outputLocation } = {}) {
  if (!sql || typeof sql !== "string") {
    throw new Error("SQL query string is required to run Athena query");
  }
  const resolvedOutput = outputLocation || ATHENA_OUTPUT;
  if (!resolvedOutput) {
    throw new Error("ATHENA_OUTPUT (S3 path) is required for Athena queries");
  }

  try {
    const start = await athena.send(
      new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: ATHENA_DB ? { Database: ATHENA_DB } : undefined,
        ResultConfiguration: { OutputLocation: resolvedOutput },
        WorkGroup: ATHENA_WORKGROUP,
      })
    );

    const queryExecutionId = start.QueryExecutionId;
    if (!queryExecutionId) {
      throw new Error("Athena failed to return a QueryExecutionId");
    }

    await waitForQueryCompletion(queryExecutionId);
    return await fetchResults(queryExecutionId);
  } catch (err) {
    const msg = err?.message || String(err);
    throw new Error(`Athena query failed to run: ${msg}`);
  }
}
