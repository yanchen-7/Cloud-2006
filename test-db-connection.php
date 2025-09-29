<?php
// Set the content type to plain text for easy viewing in a browser
header('Content-Type: text/plain');

try {
    // Load database config from a secure, non-public location
    $config = parse_ini_file('/var/www/private/db-config.ini');

    // Check if the config file was loaded successfully
    if ($config === false) {
        // Use json_encode for consistent error reporting
        http_response_code(500); // Internal Server Error
        echo json_encode(['status' => 'error', 'message' => 'Failed to read the database configuration file.']);
        exit;
    }

    // Establish the database connection
    $conn = new mysqli($config['servername'], $config['username'], $config['password'], $config['dbname']);

    // Check for a connection error
    if ($conn->connect_error) {
        http_response_code(500); // Internal Server Error
        echo json_encode(['status' => 'error', 'message' => 'Database connection failed: ' . $conn->connect_error]);
        exit;
    }

    // Query to get the total row count from the business_info table
    $result = $conn->query("SELECT COUNT(*) as count FROM business_info");
    if ($result) {
        $row = $result->fetch_assoc();
        // Output a success message with the count in JSON format
        echo json_encode(['status' => 'success', 'rowCount' => (int)$row['count']]);
    } else {
        http_response_code(500); // Internal Server Error
        echo json_encode(['status' => 'error', 'message' => 'Query failed: ' . $conn->error]);
    }

    $conn->close();
} catch (Exception $e) {
    http_response_code(500); // Internal Server Error
    echo json_encode(['status' => 'error', 'message' => 'An unexpected error occurred: ' . $e->getMessage()]);
}
?>