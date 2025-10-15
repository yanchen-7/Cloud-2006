import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

let sqsClient;

function getClient(region) {
  const resolvedRegion = region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!resolvedRegion) {
    throw new Error("AWS region is required to use SQS");
  }
  if (!sqsClient) {
    sqsClient = new SQSClient({ region: resolvedRegion });
  }
  return sqsClient;
}

/**
 * Sends the review payload to SQS. Returns true if the message was queued, false if
 * the queue is not configured (allowing the caller to fall back to a synchronous path).
 */
export async function enqueueReview(payload, { region } = {}) {
  const queueUrl = process.env.REVIEW_QUEUE_URL;
  if (!queueUrl) {
    return false;
  }
  const client = getClient(region);
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  });
  await client.send(command);
  return true;
}
