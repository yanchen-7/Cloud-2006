<?php
// Include the central configuration file
require_once 'config.php';

$s3_bucket = S3_BUCKET_NAME; // Use the constant defined in config.php
$test_file_name = "s3-web-test-" . time() . ".txt"; 
$test_file_content = "This is a test file created by the PHP web application at " . date("Y-m-d H:i:s");
$local_temp_path = "/tmp/" . $test_file_name;

echo "<h1>S3 Bucket CRUD Test</h1>";
echo "<p>Bucket: <code>s3://$s3_bucket</code></p>";

// 1. CREATE local temporary file (needed for upload)
file_put_contents($local_temp_path, $test_file_content);
if (file_exists($local_temp_path)) {
    echo "<p style='color:green;'>1. Local test file created successfully at <code>$local_temp_path</code>.</p>";
} else {
    die("<p style='color:red;'>ERROR: Could not create local temp file.</p>");
}

// 2. CREATE (Upload/PutObject)
$command_cp = "aws s3 cp $local_temp_path s3://$s3_bucket/$test_file_name 2>&1";
$output_cp = shell_exec($command_cp);
if (strpos($output_cp, 'upload:') !== false) {
    echo "<p style='color:green;'>2. **CREATE (Upload) Success.** File uploaded: <code>$test_file_name</code></p>";
} else {
    echo "<p style='color:red;'>2. **CREATE (Upload) FAILED.** Output: $output_cp</p>";
}

// 3. READ (ListBucket)
$command_ls = "aws s3 ls s3://$s3_bucket/ 2>&1";
$output_ls = shell_exec($command_ls);
echo "<h3>3. **READ (ListBucket) Success.** Bucket Contents:</h3>";
echo "<pre>$output_ls</pre>";

// 4. DELETE (DeleteObject)
$command_rm = "aws s3 rm s3://$s3_bucket/$test_file_name 2>&1";
$output_rm = shell_exec($command_rm);
if (strpos($output_rm, 'delete:') !== false) {
    echo "<p style='color:orange;'>4. **DELETE Success.** File removed: <code>$test_file_name</code></p>";
} else {
    echo "<p style='color:red;'>4. **DELETE FAILED.** Output: $output_rm</p>";
}

// 5. CLEANUP local file
unlink($local_temp_path);
if (!file_exists($local_temp_path)) {
    echo "<p>5. Local temp file cleaned up.</p>";
}

echo "<p><a href='index.php'>&lt;&lt; Back to Index</a></p>";
?>