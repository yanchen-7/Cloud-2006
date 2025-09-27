<?php
// Include the central configuration file
require_once 'config.php';

// --- Database Connection and Setup ---
$conn = new mysqli(DB_SERVER, DB_USERNAME, DB_PASSWORD, DB_NAME);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Create the database table if it doesn't exist
$sql_create_table = "
CREATE TABLE IF NOT EXISTS cloud_pois (
    id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    poi_name VARCHAR(255) NOT NULL,
    poi_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)";
if (!$conn->query($sql_create_table)) {
    echo "Error creating table: " . $conn->error;
}

// --- PHP Logic for RDS (Handling Form Submissions) ---
$rds_message = "";
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['rds_action'])) {
    $action = $_POST['rds_action'];
    $name = $_POST['poi_name'] ?? '';
    $desc = $_POST['poi_description'] ?? '';

    if ($action == 'create') {
        $stmt = $conn->prepare("INSERT INTO cloud_pois (poi_name, poi_description) VALUES (?, ?)");
        $stmt->bind_param("ss", $name, $desc);
        if ($stmt->execute()) {
            $rds_message = "<p class='text-green-500 font-bold'>Record created successfully!</p>";
        } else {
            $rds_message = "<p class='text-red-500 font-bold'>Error: " . $stmt->error . "</p>";
        }
    } elseif ($action == 'update') {
        $id = $_POST['poi_id'] ?? null;
        if ($id) {
            $stmt = $conn->prepare("UPDATE cloud_pois SET poi_name = ?, poi_description = ? WHERE id = ?");
            $stmt->bind_param("ssi", $name, $desc, $id);
            if ($stmt->execute()) {
                $rds_message = "<p class='text-green-500 font-bold'>Record updated successfully!</p>";
            } else {
                $rds_message = "<p class='text-red-500 font-bold'>Error: " . $stmt->error . "</p>";
            }
        }
    } elseif ($action == 'delete') {
        $id = $_POST['poi_id'] ?? null;
        if ($id) {
            $stmt = $conn->prepare("DELETE FROM cloud_pois WHERE id = ?");
            $stmt->bind_param("i", $id);
            if ($stmt->execute()) {
                $rds_message = "<p class='text-green-500 font-bold'>Record deleted successfully!</p>";
            } else {
                $rds_message = "<p class='text-red-500 font-bold'>Error: " . $stmt->error . "</p>";
            }
        }
    }
}

// --- PHP Logic for S3 (Handling Form Submissions) ---
$s3_message = "";
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['s3_action'])) {
    $action = $_POST['s3_action'];
    
    if ($action == 'upload' && isset($_FILES['file_to_upload'])) {
        $file = $_FILES['file_to_upload'];
        $file_name = basename($file['name']);
        $temp_path = $file['tmp_name'];
        $s3_uri = "s3://" . S3_BUCKET_NAME . "/" . $file_name;

        // Use shell_exec to call the AWS CLI
        $command = "aws s3 cp " . escapeshellarg($temp_path) . " " . escapeshellarg($s3_uri) . " --region " . escapeshellarg(AWS_REGION) . " 2>&1";
        $output = shell_exec($command);

        if (strpos($output, 'upload:') !== false) {
            $s3_message = "<p class='text-green-500 font-bold'>File '" . htmlspecialchars($file_name) . "' uploaded successfully!</p>";
        } else {
            $s3_message = "<p class='text-red-500 font-bold'>Error uploading file: " . htmlspecialchars($output) . "</p>";
        }
    } elseif ($action == 'delete' && isset($_POST['file_name'])) {
        $file_name = $_POST['file_name'];
        $s3_uri = "s3://" . S3_BUCKET_NAME . "/" . $file_name;

        $command = "aws s3 rm " . escapeshellarg($s3_uri) . " --region " . escapeshellarg(AWS_REGION) . " 2>&1";
        $output = shell_exec($command);

        if (strpos($output, 'delete:') !== false) {
            $s3_message = "<p class='text-green-500 font-bold'>File '" . htmlspecialchars($file_name) . "' deleted successfully!</p>";
        } else {
            $s3_message = "<p class='text-red-500 font-bold'>Error deleting file: " . htmlspecialchars($output) . "</p>";
        }
    }
}

// --- PHP Logic to Get S3 File List ---
$s3_files = [];
$command = "aws s3 ls s3://" . S3_BUCKET_NAME . " --region " . escapeshellarg(AWS_REGION) . " 2>&1";
$output = shell_exec($command);
$lines = explode("\n", trim($output));

foreach ($lines as $line) {
    if (!empty($line)) {
        $parts = preg_split('/\s+/', $line);
        if (count($parts) >= 4) {
            $s3_files[] = end($parts);
        }
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloud-2006 Infrastructure Test</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 font-sans p-4 md:p-8">
    <div class="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-6 md:p-10 border border-slate-200">
        <header class="text-center mb-10">
            <h1 class="text-4xl md:text-5xl font-extrabold text-blue-700 leading-tight mb-2">Cloud-2006 Infrastructure</h1>
            <p class="text-lg text-slate-500">Test your AWS RDS and S3 CRUD operations with this interactive web app.</p>
        </header>

        <!-- RDS Section -->
        <section class="mb-12 p-6 md:p-8 bg-blue-50 rounded-xl border border-blue-200 shadow-md">
            <h2 class="text-2xl font-bold text-blue-800 mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 4.142-3.358 7.5-7.5 7.5S5.25 10.517 5.25 6.375 8.608-1.125 12.75 3.017s7.5 4.142 7.5 7.5zM20.25 12c0 4.142-3.358 7.5-7.5 7.5S5.25 16.142 5.25 12s3.358-7.5 7.5-7.5 7.5 3.358 7.5 7.5zM4.5 9.75a7.5 7.5 0 0115 0" />
                </svg>                
                RDS MySQL Database Test
            </h2>
            <div class="mb-4 text-center"><?php echo $rds_message; ?></div>

            <!-- CRUD Forms -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <!-- Create Form -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg transition-shadow">
                    <h3 class="font-bold text-xl text-slate-700 mb-4">Create Record</h3>
                    <form method="POST" action="index.php">
                        <input type="hidden" name="rds_action" value="create">
                        <input type="text" name="poi_name" placeholder="Name" required class="w-full p-3 mb-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <textarea name="poi_description" placeholder="Description" rows="3" required class="w-full p-3 mb-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                        <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-md">Create</button>
                    </form>
                </div>
                <!-- Update & Delete Form -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg transition-shadow">
                    <h3 class="font-bold text-xl text-slate-700 mb-4">Update / Delete Record</h3>
                    <form method="POST" action="index.php" class="mb-4">
                        <input type="hidden" name="rds_action" value="update">
                        <input type="number" name="poi_id" placeholder="Record ID to update" required class="w-full p-3 mb-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
                        <input type="text" name="poi_name" placeholder="New Name" class="w-full p-3 mb-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500">
                        <textarea name="poi_description" placeholder="New Description" rows="3" class="w-full p-3 mb-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"></textarea>
                        <button type="submit" class="w-full bg-yellow-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-yellow-600 transition-colors shadow-md">Update</button>
                    </form>
                    <form method="POST" action="index.php">
                        <input type="hidden" name="rds_action" value="delete">
                        <input type="number" name="poi_id" placeholder="Record ID to delete" required class="w-full p-3 mb-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500">
                        <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors shadow-md">Delete</button>
                    </form>
                </div>
            </div>

            <!-- Read Table -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 class="font-bold text-xl text-slate-700 mb-4">Existing Records (READ)</h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-100">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-slate-200">
                            <?php
                            $result = $conn->query("SELECT id, poi_name, poi_description FROM cloud_pois ORDER BY id DESC");
                            if ($result && $result->num_rows > 0) {
                                while($row = $result->fetch_assoc()) {
                                    echo "<tr class='hover:bg-slate-50 transition-colors'>";
                                    echo "<td class='px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900'>" . htmlspecialchars($row['id']) . "</td>";
                                    echo "<td class='px-6 py-4 whitespace-nowrap text-sm text-slate-600'>" . htmlspecialchars($row['poi_name']) . "</td>";
                                    echo "<td class='px-6 py-4 whitespace-normal text-sm text-slate-600'>" . htmlspecialchars($row['poi_description']) . "</td>";
                                    echo "</tr>";
                                }
                            } else {
                                echo "<tr><td colspan='3' class='px-6 py-4 text-center text-slate-500'>No records found. Create one above!</td></tr>";
                            }
                            ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- S3 Section -->
        <section class="p-6 md:p-8 bg-green-50 rounded-xl border border-green-200 shadow-md">
            <h2 class="text-2xl font-bold text-green-800 mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 7.5l-2.25-1.312M21 7.5v2.25m0-2.25L18.75 4.5M18.75 4.5L16.5 6.375m1.25-1.25L21 7.5m-3-3l1.25-2.188L21 4.5m-3-3l2.25 1.312m0-2.25L21 7.5" />
                </svg>                                
                S3 Bucket Test
            </h2>
            <div class="mb-4 text-center"><?php echo $s3_message; ?></div>
            
            <!-- Upload Form -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 hover:shadow-lg transition-shadow">
                <h3 class="font-bold text-xl text-slate-700 mb-4">Upload Image (Create/Update)</h3>
                <form method="POST" action="index.php" enctype="multipart/form-data">
                    <input type="hidden" name="s3_action" value="upload">
                    <input type="file" name="file_to_upload" required class="w-full p-2 mb-4 border border-slate-300 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors">
                    <p class="text-sm text-slate-500 mb-4">Upload a new image. If a file with the same name exists, it will be updated.</p>
                    <button type="submit" class="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors shadow-md">Upload</button>
                </form>
            </div>

            <!-- Image Gallery (READ) -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 class="font-bold text-xl text-slate-700 mb-4">Uploaded Images (READ)</h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <?php
                    if (!empty($s3_files)) {
                        foreach ($s3_files as $file_name) {
                            $public_url = "https://" . S3_BUCKET_NAME . ".s3.amazonaws.com/" . urlencode($file_name);
                            echo "<div class='flex flex-col items-center bg-slate-50 p-3 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow'>";
                            echo "<a href='" . htmlspecialchars($public_url) . "' target='_blank' class='w-full h-32 flex justify-center items-center mb-2 overflow-hidden rounded-md border border-slate-200'>";
                            echo "<img src='" . htmlspecialchars($public_url) . "' alt='" . htmlspecialchars($file_name) . "' class='object-cover w-full h-full'>";
                            echo "</a>";
                            echo "<p class='text-xs text-center break-all mb-2 font-medium text-slate-700'>" . htmlspecialchars($file_name) . "</p>";
                            echo "<form method='POST' action='index.php' class='w-full'>";
                            echo "<input type='hidden' name='s3_action' value='delete'>";
                            echo "<input type='hidden' name='file_name' value='" . htmlspecialchars($file_name) . "'>";
                            echo "<button type='submit' class='w-full bg-red-600 text-white text-xs font-bold py-2 px-2 rounded-md hover:bg-red-700 transition-colors'>Delete</button>";
                            echo "</form>";
                            echo "</div>";
                        }
                    } else {
                        echo "<p class='col-span-full text-center text-slate-500 py-4'>No images found in the bucket. Upload one above!</p>";
                    }
                    ?>
                </div>
            </div>
        </section>
    </div>
</body>
</html>
