const fs = require('fs');

// Import the Bible chapter data and book names
const { bibleChapterVersesCountData, bibleBooks, eventsChildrenData } = require('./dev-useful/verseSeqsHelp.js');

// Load data files
const eventsData = JSON.parse(fs.readFileSync('./public/data/events.json', 'utf8'));
const peopleData = JSON.parse(fs.readFileSync('./public/data/people.json', 'utf8'));
const placesData = JSON.parse(fs.readFileSync('./public/data/places.json', 'utf8'));

function processParticipants(participantsString) {
    if (!participantsString || typeof participantsString !== 'string') return [];
    
    const participantIds = participantsString.split(',').map(id => id.trim()).filter(id => id);
    
    return participantIds.map(id => {
        const person = peopleData.find(p => p.fields && p.fields.personLookup === id);
        return person && person.fields && person.fields.displayTitle ? person.fields.displayTitle : id;
    }).filter(name => name); // Remove any null/undefined entries
}

function processLocations(locationsString) {
    if (!locationsString || typeof locationsString !== 'string') return [];
    
    const locationIds = locationsString.split(',').map(id => id.trim()).filter(id => id);
    
    return locationIds.map(id => {
        const place = placesData.find(p => p.fields && p.fields.placeLookup === id);
        return place && place.fields && place.fields.displayTitle ? place.fields.displayTitle : id;
    }).filter(name => name); // Remove any null/undefined entries
}

function processVerses(versesString) {
    if (!versesString || typeof versesString !== 'string') return [];
    
    // Split by comma and clean up
    const versesList = versesString.split(',').map(v => v.trim()).filter(v => v);
    
    if (versesList.length === 0) return [];
    
    // Parse each verse into components
    const parsedVerses = versesList.map(verse => {
        const match = verse.match(/^([a-zA-Z0-9]+)\.(\d+)\.(\d+)$/);
        if (!match) return null;
        
        return {
            original: verse,
            book: match[1],
            chapter: parseInt(match[2]),
            verse: parseInt(match[3])
        };
    }).filter(v => v !== null);
    
    if (parsedVerses.length === 0) return [];
    
    // Step 1: Extract 2-connected or longer sequences of the same book (xxx part)
    const bookSequences = extractBookSequences(parsedVerses);
    
    // Step 2: Process each book sequence
    const result = [];
    bookSequences.forEach(bookSequence => {
        if (bookSequence.length >= 1) {
            const processedSequences = processBookSequence(bookSequence);
            result.push(...processedSequences);
        }
    });
    
    return result;
}

function extractBookSequences(parsedVerses) {
    const sequences = [];
    let currentSequence = [];
    let currentBook = null;
    
    parsedVerses.forEach(verse => {
        if (currentBook === null || verse.book === currentBook) {
            currentSequence.push(verse);
            currentBook = verse.book;
        } else {
            // Book changed, start new sequence
            if (currentSequence.length > 0) {
                sequences.push([...currentSequence]);
            }
            currentSequence = [verse];
            currentBook = verse.book;
        }
    });
    
    // Add the last sequence
    if (currentSequence.length > 0) {
        sequences.push(currentSequence);
    }
    
    return sequences;
}

function processBookSequence(bookSequence) {
    const book = bookSequence[0].book;
    
    // Step 2a: Sort by chapter (y), then by verse (z)
    bookSequence.sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verse - b.verse;
    });
    
    // Step 2b: Find verse sequences
    return findVerseSequences(bookSequence, book);
}

function findVerseSequences(verses, book) {
    const sequences = [];
    let i = 0;
    
    while (i < verses.length) {
        const sequenceStart = i;
        let sequenceEnd = i;
        
        // Find the longest continuous sequence starting at position i
        while (sequenceEnd + 1 < verses.length && 
               isContinuous(verses[sequenceEnd], verses[sequenceEnd + 1], book)) {
            sequenceEnd++;
        }
        
        // Format the sequence
        const sequence = verses.slice(sequenceStart, sequenceEnd + 1);
        sequences.push(formatSequence(sequence, book));
        
        i = sequenceEnd + 1;
    }
    
    return sequences;
}

function isContinuous(prevVerse, currVerse, book) {
    // Same chapter - check if verse numbers are consecutive
    if (prevVerse.chapter === currVerse.chapter) {
        return currVerse.verse === prevVerse.verse + 1;
    }
    
    // Different chapters - check if it's cross-chapter continuous
    if (currVerse.chapter === prevVerse.chapter + 1 && currVerse.verse === 1) {
        // Check if prev verse is the last verse of its chapter
        const chapterKey = `${book}.${prevVerse.chapter}`;
        const chapterData = bibleChapterVersesCountData.find(
            data => data.chapter === chapterKey
        );
        
        if (chapterData && chapterData.numberOfVerses === prevVerse.verse) {
            return true;
        }
    }
    
    return false;
}

function formatSequence(sequence, book) {
    // Replace book abbreviation with full name
    const fullBookName = bibleBooks[book] || book;
    
    if (sequence.length === 1) {
        // Single verse: "Genesis 5:3"
        const verse = sequence[0];
        return `${fullBookName} ${verse.chapter}:${verse.verse}`;
    }
    
    const first = sequence[0];
    const last = sequence[sequence.length - 1];
    
    if (first.chapter === last.chapter) {
        // Same chapter range: "Genesis 5:1-3"
        return `${fullBookName} ${first.chapter}:${first.verse}-${last.verse}`;
    } else {
        // Cross-chapter range: "Genesis 5:30 - 6:1"
        return `${fullBookName} ${first.chapter}:${first.verse}-${last.chapter}:${last.verse}`;
    }
}

// Build a map from eventID to event title for fast lookup
const eventIdToTitle = {};
eventsData.forEach(event => {
    if (event.fields && event.fields.eventID && event.fields.title) {
        eventIdToTitle[event.fields.eventID] = event.fields.title;
    }
});

// Build a map from child eventID to parent eventID(s)
const childToParentMap = {};
eventsChildrenData.forEach(parentObj => {
    if (parentObj.eventChildren && Array.isArray(parentObj.eventChildren)) {
        parentObj.eventChildren.forEach(childId => {
            if (!childToParentMap[childId]) {
                childToParentMap[childId] = [];
            }
            childToParentMap[childId].push(parentObj.eventID);
        });
    }
});

// Process each event
const processedEvents = eventsData.map(event => {
    const fields = event.fields || {};
    
    // Extract specified fields
    const filteredFields = {};
    
    // Always include these core fields
    const coreFields = ['title', 'eventID', 'column', 'sortKey', 'startDate', 'duration'];
    coreFields.forEach(fieldName => {
        if (fields[fieldName] !== undefined) {
            filteredFields[fieldName] = fields[fieldName];
        }
    });
    
    // Handle participants (convert to array of display titles)
    if (fields.participants && fields.participants.trim() !== '') {
        const processedParticipants = processParticipants(fields.participants);
        if (processedParticipants.length > 0) {
            filteredFields.participants = processedParticipants;
        }
    }
    
    // Handle locations (convert to array of display titles)
    if (fields.locations && fields.locations.trim() !== '') {
        const processedLocations = processLocations(fields.locations);
        if (processedLocations.length > 0) {
            filteredFields.locations = processedLocations;
        }
    }
    
    // Handle verses (special processing with full book names)
    if (fields.verses && fields.verses.trim() !== '') {
        const processedVerses = processVerses(fields.verses);
        if (processedVerses.length > 0) {
            filteredFields.verses = processedVerses;
        }
    }
    
    // Handle other fields
    const otherFields = ['groups', 'partOf', 'notes'];
    otherFields.forEach(fieldName => {
        if (fields[fieldName] && fields[fieldName].trim && fields[fieldName].trim() !== '') {
            filteredFields[fieldName] = fields[fieldName];
        } else if (fields[fieldName] && typeof fields[fieldName] !== 'string') {
            filteredFields[fieldName] = fields[fieldName];
        }
    });
    
    // Add eventsPartOf: list of titles of parent events this event is a child of
    if (fields.eventID && childToParentMap[fields.eventID]) {
        const parentTitles = childToParentMap[fields.eventID]
            .map(parentId => eventIdToTitle[parentId])
            .filter(Boolean);
        if (parentTitles.length > 0) {
            filteredFields.eventsPartOf = parentTitles;
        }
    }

    return {
        ...event,
        fields: filteredFields
    };
});

// Write the result to a new file
const outputPath = './public/data/events_filtered.json';
fs.writeFileSync(outputPath, JSON.stringify(processedEvents, null, 2));

console.log(`Processed ${eventsData.length} events and created ${outputPath}`);

// Show some sample processed data
const sampleWithVerses = processedEvents.find(e => e.fields.verses && e.fields.verses.length > 0);
const sampleWithParticipants = processedEvents.find(e => e.fields.participants && e.fields.participants.length > 0);
const sampleWithLocations = processedEvents.find(e => e.fields.locations && e.fields.locations.length > 0);

console.log('\nSample processed verses:', sampleWithVerses?.fields.verses);
console.log('Sample processed participants:', sampleWithParticipants?.fields.participants);
console.log('Sample processed locations:', sampleWithLocations?.fields.locations);