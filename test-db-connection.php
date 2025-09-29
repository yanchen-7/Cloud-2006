<?php
require __DIR__ . '/includes/bootstrap.php';

try {
    echo "Testing cloud database connection...\n";
    
    // Test mysqli connection
    $config = parse_ini_file('/var/www/private/db-config.ini');
    echo "Config loaded: " . print_r($config, true) . "\n";
    
    $conn = new mysqli($config['servername'], $config['username'], $config['password'], $config['dbname']);
    
    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }
    
    echo "Connected successfully to " . $config['servername'] . "\n";
    
    // Test business query
    $result = $conn->query("SELECT COUNT(*) as count FROM business_info");
    if ($result) {
        $row = $result->fetch_assoc();
        echo "Found " . $row['count'] . " businesses in database\n";
    } else {
        echo "Query failed: " . $conn->error . "\n";
    }
    
    $conn->close();
    echo "Database test completed successfully!\n";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>