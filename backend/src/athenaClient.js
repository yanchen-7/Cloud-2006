// athenaClient.js
const AWS = require('aws-sdk');

const athena = new AWS.Athena({
  region: 'us-east-1',            // your region
});

const ATHENA_DB = 'tourism';
const ATHENA_OUTPUT = 's3://cloud-2006-bucket-vf6xtl9u/athena-results/';

async function runAthenaQuery(sql) {
  // 1. Start query
  const startRes = await athena.startQueryExecution({
    QueryString: sql,
    QueryExecutionContext: { Database: ATHENA_DB },
    ResultConfiguration: { OutputLocation: ATHENA_OUTPUT },
  }).promise();

  const queryExecutionId = startRes.QueryExecutionId;

  // 2. Poll until SUCCEEDED / FAILED
  while (true) {
    const { QueryExecution } = await athena.getQueryExecution({
      QueryExecutionId: queryExecutionId,
    }).promise();

    const state = QueryExecution.Status.State;
    if (state === 'SUCCEEDED') break;
    if (state === 'FAILED' || state === 'CANCELLED') {
      throw new Error(`Athena query failed: ${QueryExecution.Status.StateChangeReason}`);
    }
    await new Promise(r => setTimeout(r, 1000)); // sleep 1s
  }

  // 3. Fetch results
  const results = await athena.getQueryResults({
    QueryExecutionId: queryExecutionId,
  }).promise();

  // First row is header
  const [headerRow, ...dataRows] = results.ResultSet.Rows;
  const headers = headerRow.Data.map(d => d.VarCharValue);

  const items = dataRows.map(row => {
    const obj = {};
    row.Data.forEach((col, i) => {
      obj[headers[i]] = col.VarCharValue;
    });
    return obj;
  });

  return items;
}

module.exports = { runAthenaQuery };
