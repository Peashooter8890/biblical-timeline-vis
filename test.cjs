const fs = require('fs');
const path = require('path');

// Paths to the JSON files
const peopleFilePath = path.join(__dirname, 'public', 'data', 'people.json');
const placesFilePath = path.join(__dirname, 'public', 'data', 'places.json');

// Function to process the JSON data
function processJson(filePath, lookupKey) {
  const rawData = fs.readFileSync(filePath, 'utf8');
  const jsonData = JSON.parse(rawData);

  // Extract only the "fields" attribute and map it to the lookupKey
  return jsonData.map((item) => ({
    [lookupKey]: item.fields[lookupKey],
    displayTitle: item.fields.displayTitle,
  }));
}

// Process people.json and save the result
const processedPeople = processJson(peopleFilePath, 'personLookup');
const peopleOutputPath = path.join(__dirname, 'public', 'data', 'processed_people.json');
fs.writeFileSync(peopleOutputPath, JSON.stringify(processedPeople, null, 2), 'utf8');
console.log('Processed people JSON saved to:', peopleOutputPath);

// Process places.json and save the result
const processedPlaces = processJson(placesFilePath, 'placeLookup');
const placesOutputPath = path.join(__dirname, 'public', 'data', 'processed_places.json');
fs.writeFileSync(placesOutputPath, JSON.stringify(processedPlaces, null, 2), 'utf8');
console.log('Processed places JSON saved to:', placesOutputPath);