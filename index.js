// server.js

// --- Dependencies ---
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const basicAuth = require('express-basic-auth');

// --- App Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Security ---
// Basic Authentication middleware
const users = { 'admin': 'password' }; // IMPORTANT: Use environment variables in a real application
const unauthorizedResponse = (req) => {
    return req.auth ? ('Credentials ' + req.auth.user + ':' + req.auth.password + ' rejected') : 'No credentials provided';
};
const authenticator = basicAuth({ users, challenge: true, unauthorizedResponse });

// --- Database Setup ---
const dbPath = path.join(__dirname, 'safetyfixs.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create/update the submissions table
        db.run(`CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shopName TEXT,
            phoneNumber TEXT,
            dropOffType TEXT,
            vehicleYear INTEGER,
            vehicleMake TEXT,
            vehicleModel TEXT,
            vehicleIssueDescription TEXT,
            moduleCount INTEGER,
            singleStageCount INTEGER,
            dualStageCount INTEGER,
            threeStageCount INTEGER,
            buckleCount INTEGER,
            isDone BOOLEAN NOT NULL DEFAULT 0,
            isPrinted BOOLEAN NOT NULL DEFAULT 0,
            submittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            doneAt TIMESTAMP,
            printedAt TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating/updating table', err.message);
            } else {
                console.log('Submissions table is ready.');
            }
        });
    }
});

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// --- API Endpoints ---

/**
 * @route   POST /api/submit
 * @desc    Receive a new form submission and store it in the database.
 */
app.post('/api/submit', (req, res) => {
    const {
        customerName, phoneNumber, dropOffType, 
        vehicleMake, vehicleModel, vehicleIssueDescription,
        vehicleYear, moduleCount, singleStageCount, 
        dualStageCount, threeStageCount, buckleCount
    } = req.body;

    const sql = `INSERT INTO submissions (
        shopName, phoneNumber, dropOffType, vehicleYear, vehicleMake, vehicleModel, 
        vehicleIssueDescription, moduleCount, singleStageCount, dualStageCount, 
        threeStageCount, buckleCount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
        customerName, phoneNumber, dropOffType, vehicleYear, vehicleMake, vehicleModel,
        vehicleIssueDescription, moduleCount, singleStageCount, dualStageCount,
        threeStageCount, buckleCount
    ];

    db.run(sql, params, function(err) {
        if (err) {
            console.error('Error inserting data', err.message);
            return res.status(500).json({ error: 'Failed to submit form.' });
        }
        console.log(`A new submission has been added with ID: ${this.lastID}`);
        res.status(201).json({ message: 'Form submitted successfully!', id: this.lastID });
    });
});


/**
 * @route   GET /api/submissions
 * @desc    Retrieve all submissions from the database.
 */
app.get('/api/submissions', authenticator, (req, res) => {
    let sql = "SELECT * FROM submissions";
    const { showAll } = req.query;

    if (showAll !== 'true') {
        sql += " WHERE isDone = 0";
    }

    sql += " ORDER BY submittedAt DESC";
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Error fetching submissions', err.message);
            return res.status(500).json({ error: 'Could not retrieve submissions.' });
        }
        res.json(rows);
    });
});

/**
 * @route   POST /api/submissions/:id/status
 * @desc    Update the status of a specific submission.
 */
app.post('/api/submissions/:id/status', authenticator, (req, res) => {
    const { id } = req.params;
    const { isDone, isPrinted } = req.body;

    let sql = "UPDATE submissions SET ";
    const params = [];
    const updates = [];

    if (isDone !== undefined) {
        updates.push("isDone = ?");
        params.push(isDone);
        updates.push("doneAt = ?");
        params.push(isDone ? new Date().toISOString() : null);
    }
    if (isPrinted !== undefined) {
        updates.push("isPrinted = ?");
        params.push(isPrinted);
        updates.push("printedAt = ?");
        params.push(isPrinted ? new Date().toISOString() : null);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No status fields provided to update.' });
    }

    sql += updates.join(', ') + " WHERE id = ?";
    params.push(id);

    db.run(sql, params, function(err) {
        if (err) {
            console.error(`Error updating status for ID ${id}`, err.message);
            return res.status(500).json({ error: 'Failed to update status.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Submission not found.' });
        }
        console.log(`Status for submission ID ${id} updated.`);
        res.json({ message: `Status updated successfully.` });
    });
});


// --- Frontend Route ---

/**
 * @route   GET /
 * @desc    Serve the dashboard page to view submissions.
 */
app.get('/', authenticator, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SafetyFixs - Submissions Dashboard</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; }
            </style>
        </head>
        <body class="bg-gray-100 text-gray-800">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <h1 class="text-3xl font-bold text-gray-900">Submissions Dashboard</h1>
                    <div class="flex items-center space-x-4">
                        <label class="flex items-center space-x-2">
                            <input type="checkbox" id="showAllToggle" class="h-5 w-5 text-amber-600 focus:ring-amber-500 border-gray-300 rounded">
                            <span>Show All</span>
                        </label>
                        <button id="refreshBtn" class="bg-amber-500 text-white px-4 py-2 rounded-md hover:bg-amber-600 transition">Refresh</button>
                    </div>
                </div>
                <div class="bg-white shadow-lg rounded-lg overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shop Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Done</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Done At</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Printed</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Printed At</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted At</th>
                            </tr>
                        </thead>
                        <tbody id="submissionsTableBody" class="bg-white divide-y divide-gray-200">
                            <!-- Rows will be inserted here by JavaScript -->
                        </tbody>
                    </table>
                </div>
            </div>

            <script>
                const tableBody = document.getElementById('submissionsTableBody');
                const refreshBtn = document.getElementById('refreshBtn');
                const showAllToggle = document.getElementById('showAllToggle');

                async function updateStatus(id, field, value) {
                    try {
                        const response = await fetch(\`/api/submissions/\${id}/status\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [field]: value })
                        });
                        if (!response.ok) throw new Error('Failed to update status');
                        fetchSubmissions(); // Refresh the table
                    } catch (error) {
                        console.error('Error updating status:', error);
                        alert('Failed to update status. Please try again.');
                    }
                }

                async function fetchSubmissions() {
                    try {
                        const showAll = showAllToggle.checked;
                        const response = await fetch(\`/api/submissions?showAll=\${showAll}\`);
                        if (!response.ok) throw new Error('Failed to fetch submissions');
                        const submissions = await response.json();
                        
                        tableBody.innerHTML = ''; // Clear existing rows
                        
                        if (submissions.length === 0) {
                            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No submissions found.</td></tr>';
                            return;
                        }

                        submissions.forEach(sub => {
                            const row = document.createElement('tr');
                            const doneAt = sub.doneAt ? new Date(sub.doneAt).toLocaleString() : 'N/A';
                            const printedAt = sub.printedAt ? new Date(sub.printedAt).toLocaleString() : 'N/A';
                            
                            row.innerHTML = \`
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">\${sub.id}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">\${sub.shopName || 'N/A'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">\${sub.vehicleYear ? \`\${sub.vehicleYear} \${sub.vehicleMake} \${sub.vehicleModel}\` : 'N/A'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-center">
                                    <input type="checkbox" class="h-5 w-5 text-amber-600 focus:ring-amber-500 border-gray-300 rounded" \${sub.isDone ? 'checked' : ''} onchange="updateStatus(\${sub.id}, 'isDone', this.checked)">
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${doneAt}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-center">
                                    <input type="checkbox" class="h-5 w-5 text-amber-600 focus:ring-amber-500 border-gray-300 rounded" \${sub.isPrinted ? 'checked' : ''} onchange="updateStatus(\${sub.id}, 'isPrinted', this.checked)">
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${printedAt}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${new Date(sub.submittedAt).toLocaleString()}</td>
                            \`;
                            tableBody.appendChild(row);
                        });

                    } catch (error) {
                        console.error(error);
                        tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">Error loading submissions.</td></tr>';
                    }
                }

                refreshBtn.addEventListener('click', fetchSubmissions);
                showAllToggle.addEventListener('change', fetchSubmissions);

                // Initial fetch
                fetchSubmissions();
            </script>
        </body>
        </html>
    `);
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
