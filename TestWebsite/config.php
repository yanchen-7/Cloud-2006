<?php
/**
 * Application Configuration File
 * Contains sensitive connection details for RDS and S3.
 */

// ==========================================================
// 1. RDS Database Connection Details
// ==========================================================

// ⚠️ IMPORTANT: This must be the **internal/private** RDS endpoint.
define('DB_SERVER', 'cloud-2006-db.cn4q042s0dlt.us-east-1.rds.amazonaws.com'); 
define('DB_USERNAME', 'clouddev');      
define('DB_PASSWORD', 'TourismPOI');    
define('DB_NAME', 'cloud2006db');       // The application database name

// Optional: Define a simple link for connection testing
$link = mysqli_connect(DB_SERVER, DB_USERNAME, DB_PASSWORD);

// Check RDS Connection - only check the server link, not the DB name yet
if($link === false){
    die("ERROR: Could not connect to RDS server. Please check RDS status and EC2 Security Group rules. " . mysqli_connect_error());
}

// ==========================================================
// 2. S3 Bucket Configuration
// ==========================================================

define('S3_BUCKET_NAME', 'cloud-2006-static-files-tourism-poi');
// Define the region for AWS commands (optional, but good practice)
define('AWS_REGION', 'us-east-1'); 
?>
