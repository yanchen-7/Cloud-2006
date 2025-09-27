<?php
// Include the central configuration file
require_once 'config.php';

echo "<h1>RDS MySQL Database CRUD Test</h1>";

// 1. CONNECT TO DB SERVER
// Connect using the constants defined in config.php
$conn = new mysqli(DB_SERVER, DB_USERNAME, DB_PASSWORD);

if ($conn->connect_error) {
    die("<p style='color:red;'>CONNECTION ERROR (SERVER): " . $conn->connect_error . "</p>");
}
echo "<p style='color:green;'>1. Connection to RDS server successful.</p>";

// 2. CREATE DATABASE if it doesn't exist
$sql = "CREATE DATABASE IF NOT EXISTS " . DB_NAME;
if ($conn->query($sql) === TRUE) {
    echo "<p>2. Database '" . DB_NAME . "' created or already exists.</p>";
} else {
    echo "<p style='color:red;'>Error creating database: " . $conn->error . "</p>";
    $conn->close();
    exit;
}

// 3. Select the database
$conn->select_db(DB_NAME);

// 4. CREATE TABLE
$table_name = "test_data"; // Table name can be kept local as it's for this script only
$sql = "CREATE TABLE IF NOT EXISTS $table_name (
    id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message VARCHAR(255) NOT NULL,
    test_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)";
if ($conn->query($sql) === TRUE) {
    echo "<p>3. Table '$table_name' created successfully.</p>";
} else {
    echo "<p style='color:red;'>Error creating table: " . $conn->error . "</p>";
    $conn->close();
    exit;
}

// 5. CREATE (INSERT)
$test_message = "Test insert from EC2 web app at " . date("Y-m-d H:i:s");
$sql = "INSERT INTO $table_name (message) VALUES ('$test_message')";
if ($conn->query($sql) === TRUE) {
    $last_id = $conn->insert_id;
    echo "<p style='color:green;'>4. **CREATE (INSERT) Success.** New record created with ID: $last_id</p>";
} else {
    echo "<p style='color:red;'>Error inserting record: " . $conn->error . "</p>";
}

// 6. READ
// ... (Read logic is unchanged, it uses the $conn object)

$sql = "SELECT id, message, test_time FROM $table_name ORDER BY id DESC LIMIT 5";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    echo "<h3>5. **READ Success.** Last 5 Records:</h3>";
    echo "<table border='1' cellpadding='10'><tr><th>ID</th><th>Message</th><th>Time</th></tr>";
    while($row = $result->fetch_assoc()) {
        echo "<tr><td>" . $row["id"]. "</td><td>" . $row["message"]. "</td><td>" . $row["test_time"]. "</td></tr>";
    }
    echo "</table>";
} else {
    echo "<h3>5. **READ Success.** 0 results.</h3>";
}

// 7. DELETE (Cleanup)
$sql = "DROP TABLE $table_name";
if ($conn->query($sql) === TRUE) {
    echo "<p style='color:orange; margin-top:20px;'>6. **DELETE (Cleanup) Success.** Table '$table_name' dropped.</p>";
} else {
    echo "<p style='color:red;'>Error dropping table: " . $conn->error . "</p>";
}

$conn->close();

echo "<p><a href='index.php'>&lt;&lt; Back to Index</a></p>";
?>