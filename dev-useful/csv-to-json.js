const fs = require('fs');

function csvToJson(csvFilePath, outputPath = 'events.json') {
    try {
        // Read the CSV file
        const csvData = fs.readFileSync(csvFilePath, 'utf8');
        
        // Split into lines and filter out empty lines
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }
        
        // Extract headers from the first line
        const headers = lines[0].split(',').map(header => header.trim().replace(/"/g, ''));
        
        // Convert each data row to an object
        const rawData = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            
            if (values.length === headers.length) {
                const obj = {};
                headers.forEach((header, index) => {
                    // Clean up the value by removing quotes and trimming
                    let value = values[index].trim().replace(/^"|"$/g, '');
                    
                    // Convert boolean-like values
                    if (value.toLowerCase() === 'true') {
                        value = true;
                    } else if (value.toLowerCase() === 'false') {
                        value = false;
                    }
                    
                    obj[header] = value;
                });
                rawData.push(obj);
            }
        }
        
        // Transform data to required format without calculating columns
        const jsonData = rawData.map(row => {
            const fields = {};
            
            // Only include specified fields
            const includedFields = ['title', 'startDate', 'duration', 'column', 'sortKey'];
            includedFields.forEach(field => {
                if (row[field] !== undefined) {
                    fields[field] = row[field];
                }
            });
            
            return { fields };
        });
        
        // Write JSON to file
        const jsonString = JSON.stringify(jsonData, null, 2);
        fs.writeFileSync(outputPath, jsonString, 'utf8');
        
        console.log(`✅ Successfully converted CSV to JSON!`);
        console.log(`📁 Input: ${csvFilePath}`);
        console.log(`📁 Output: ${outputPath}`);
        console.log(`📊 Total records: ${jsonData.length}`);
        
        // Also output to console
        console.log('\n📋 JSON Output:');
        console.log(jsonString);
        
        return jsonData;
        
    } catch (error) {
        console.error('❌ Error converting CSV to JSON:', error.message);
        return null;
    }
}

// Function to properly parse CSV lines (handles commas within quoted fields)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current); // Add the last field
    return result;
}

// Main execution
const csvFilePath = 'dev-useful/events-Grid view.csv'; // Update this path if needed
const outputPath = 'data/events.json';

// Convert the CSV to JSON
const result = csvToJson(csvFilePath, outputPath);

// Export the function for use in other modules
module.exports = { csvToJson };