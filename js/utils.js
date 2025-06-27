import { TIME_RANGES } from './constants.js';

const parseDuration = (durationStr) => {
    if (!durationStr) return 0;
    const value = parseFloat(durationStr);
    if (durationStr.toUpperCase().includes('D')) return value / 365.25;
    if (durationStr.toUpperCase().includes('Y')) return value;
    return value;
};

const getRangeInfo = (startDate) => {
    const range = TIME_RANGES.find(r => startDate >= r.start && startDate <= r.end);
    if (!range) return { color: '#ccc', span: 1 };
    const span = Math.abs(range.end - range.start);
    return { ...range, span: span > 0 ? span : 1 };
};

const formatYear = (year) => {
    if (year < 0) return `${Math.abs(year)} BC`;
    if (year >= 0) return `${year} AD`;
    return year;
};

const getEffectiveColumn = (event) => {
    const fields = event.fields;
    if (fields.customColumn && fields.customColumn.trim() !== '') {
        return parseFloat(fields.customColumn);
    }
    if (fields.column && fields.column.trim() !== '') {
        return parseFloat(fields.column);
    }
    return 1;
};

export { parseDuration, getRangeInfo, formatYear, getEffectiveColumn };
