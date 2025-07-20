import { formatDuration, formatLocations, formatParticipants, formatVerses } from './utils.jsx';
import { peopleFullData, placesFullData } from './teststuff.js';

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