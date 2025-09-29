<?php
// Set the content type to JSON for programmatic responses
header('Content-Type: application/json');

// Include AWS SDK for PHP Composer autoloader
// This assumes 'vendor' directory is a sibling to this script.
// Adjust path if your Composer setup is different.
require __DIR__ . '/vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\Exception\AwsException;

try {
    // Load database config from a secure, non-public location
    $config = parse_ini_file('/var/www/private/db-config.ini', true); // Process sections

    // Check if the config file was loaded successfully
    if ($config === false) {
        http_response_code(500); // Internal Server Error
        echo json_encode(['status' => 'error', 'message' => 'Failed to read the configuration file.']);
        exit;
    }

    // Check for required S3 configuration keys
    $required_s3_keys = ['key', 'secret', 'region', 'bucket'];
    foreach ($required_s3_keys as $key) {
        if (!isset($config['s3'][$key])) {
            http_response_code(500); // Internal Server Error
            echo json_encode(['status' => 'error', 'message' => "Missing S3 configuration: '$key' in [s3] section of config file."]);
            exit;
        }
    }

    $s3_bucket_name = $config['s3']['bucket'];
    $s3_region = $config['s3']['region'];
    $s3_access_key = $config['s3']['key'];
    $s3_secret_key = $config['s3']['secret'];

    // Initialize S3 client
    $s3Client = new S3Client([
        'version'     => 'latest',
        'region'      => $s3_region,
        'credentials' => [
            'key'    => $s3_access_key,
            'secret' => $s3_secret_key,
        ],
    ]);

    // Define a test object key. This object should exist in your S3 bucket.
    // IMPORTANT: Replace 'your-test-object.txt' with an actual object key in your S3 bucket.
    // Ensure this object is NOT located in an 'images' folder, as per your request.
    $test_object_key = 'logow.jpg'; // <-- CHANGE THIS TO AN ACTUAL OBJECT KEY

    // Attempt to get the object's metadata (HeadObject) to verify existence and permissions
    // This avoids downloading the entire file content.
    $result = $s3Client->headObject([
        'Bucket' => $s3_bucket_name,
        'Key'    => $test_object_key,
    ]);

    // If successful, output details
    echo json_encode([
        'status'        => 'success',
        'message'       => "Successfully connected to S3 bucket and found object.",
        'bucket'        => $s3_bucket_name,
        'object_key'    => $test_object_key,
        'object_size'   => (int)$result['ContentLength'],
        'content_type'  => $result['ContentType'],
        'last_modified' => $result['LastModified']->format('Y-m-d H:i:s'),
    ]);

} catch (AwsException $e) {
    // Catch AWS specific errors (e.g., bucket not found, access denied, object not found)
    http_response_code(500); // Internal Server Error or 404 if object not found
    echo json_encode(['status' => 'error', 'message' => 'AWS S3 Error: ' . $e->getAwsErrorCode() . ' - ' . $e->getMessage()]);
} catch (Exception $e) {
    // Catch any other unexpected PHP errors
    http_response_code(500); // Internal Server Error
    echo json_encode(['status' => 'error', 'message' => 'An unexpected error occurred: ' . $e->getMessage()]);
}
?>