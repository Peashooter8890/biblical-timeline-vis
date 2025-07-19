import { formatDuration, formatLocations, formatParticipants, formatVerses } from './utils.jsx';
import { peopleFullData, placesFullData } from './teststuff.js';

export const TIME_RANGES = [
    { start: -4100, end: -2200, color: '#5795ff' },
    { start: -2199, end: -1600, color: '#ff7f00' },
    { start: -1599, end: -1375, color: '#fc8eac' },
    { start: -1374, end: -1052, color: '#89b4c3' },
    { start: -1051, end: -931,  color: '#b2df8a' },
    { start: -930,  end: -715,  color: '#fdbf6f' },
    { start: -714,  end: -431,  color: '#cab2d6' },
    { start: -430,  end: -1,    color: '#FFB6C1' },
    { start: 0,     end: 150,   color: '#C4A484' }
];

export const PERIODS = [
    { value: 'all', label: 'ALL' },
    { value: 'period1', label: '4101 BC - 3001 BC' },
    { value: 'period2', label: '3000 BC - 2001 BC' },
    { value: 'period3', label: '2000 BC - 1001 BC' },
    { value: 'period4', label: '1000 BC - 1 BC' },
    { value: 'period5', label: '1 AD - 150 AD' }
];

export const DETAIL_FIELDS = [
    { key: 'duration', label: 'Duration', formatter: formatDuration },
    { key: 'participants', label: 'Participants', formatter: (val) => formatParticipants(val, peopleFullData) },
    { key: 'groups', label: 'Groups' },
    { key: 'locations', label: 'Locations', formatter: (val) => formatLocations(val, placesFullData) },
    { key: 'verses', label: 'Verses', formatter: formatVerses },
    { key: 'partOf', label: 'Part Of' },
    { key: 'predecessor', label: 'Predecessor' },
    { key: 'lag', label: 'Lag', formatter: formatDuration },
    { key: 'lagType', label: 'Lag Type' },
    { key: 'notes', label: 'Notes' }
];