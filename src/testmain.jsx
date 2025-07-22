import React, { useRef, useEffect, useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import * as d3 from 'd3';
import { eventsFullData, peopleFullData, placesFullData } from './teststuff.js';
const getStyleOf = (fileName) => {};
import { 
    formatYear, 
    parseDuration, 
    getRangeInfo, 
    calculateColumns, 
    getEffectiveColumn, 
    calculateDimensions,
} from './utils.jsx';
import './testindex.css';

const TIME_RANGES = [
    { start: -4150, end: -2200, color: '#5795ff' },
    { start: -2199, end: -1600, color: '#ff7f00' },
    { start: -1599, end: -1375, color: '#fc8eac' },
    { start: -1374, end: -1052, color: '#89b4c3' },
    { start: -1051, end: -931,  color: '#b2df8a' },
    { start: -930,  end: -715,  color: '#fdbf6f' },
    { start: -714,  end: -431,  color: '#cab2d6' },
    { start: -430,  end: -1,    color: '#FFB6C1' },
    { start: 0,     end: 80,   color: '#C4A484' }
];

const TIME_PERIODS = {
    'all': [-4150, 80],
    'period1': [-4150, -3000],
    'period2': [-2999, -2000], 
    'period3': [-1999, -1000],
    'period4': [-999, 0],
    'period5': [1, 80]
};

const PERIODS = [
    { value: 'all', label: 'ALL' },
    { value: 'period1', label: '4151 BC - 3001 BC' },
    { value: 'period2', label: '3000 BC - 2001 BC' },
    { value: 'period3', label: '2000 BC - 1001 BC' },
    { value: 'period4', label: '1000 BC - 1 BC' },
    { value: 'period5', label: '1 AD - 80 AD' }
];

const UPDATE_THROTTLE_MS = 33; 
const EQUAL_DISTRIBUTION_AREA = 0.5;
const PROPORTIONATE_DISTRIBUTION_AREA = 0.5;
const YEAR_LABEL_INTERVAL = 500;
const YEAR_LABEL_RANGE_START = -4000;
const YEAR_LABEL_RANGE_END = 0;
const LABEL_MARGIN = 15;
const LABEL_LINE_LENGTH = 10;
const COLOR_BAR_WIDTH_RATIO = 1/6;
const MIN_SELECTION_HEIGHT = 45;
const HANDLE_HEIGHT = 14;
const HANDLE_WIDTH_RATIO = 1/2;
const TOOLTIP_OFFSET_X = 10;
const TOOLTIP_OFFSET_Y = 50;
const FULL_RANGE = [-4150, 80];

const LAYOUT_CONFIG = {
    SIDEBAR_RATIO: 0.4,        
    CONTENT_RATIO: 0.6,        
    MICROCHART_GAP: 20,        
    MACROCHART_WIDTH: 100,     
    MICROCHART_MIN_WIDTH: 100, 
};
const MICROCHART_MAX_DOT_DIAMETER = 10
const MICROCHART_COLUMNS = 10

const EventsTimeline = () => {
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);
    const [floatingHeaderYear, setFloatingHeaderYear] = useState(null);

    const macroContainerRef = useRef(null);
    const macroSvgRef = useRef(null);
    const microContainerRef = useRef(null);
    const microSvgRef = useRef(null);
    const eventDisplayRef = useRef(null);
    const macroIndicatorRef = useRef(null);
    const microIndicatorRef = useRef(null);
    const [processedEvents, setProcessedEvents] = useState([]);
    const masterScale = useRef(null);

    const selectionState = useRef({
        pixelBounds: [0, 0],
        yearBounds: FULL_RANGE,
        macroScaleInfo: null,
        overlayElements: null,
        isDragging: false,
        currentViewRange: TIME_PERIODS.all
    });

    const overlayElementsRef = useRef({
        overlay: null,
        topHandle: null,
        bottomHandle: null,
        topHandleText: null,
        bottomHandleText: null,
        cleanup: null
    });

    const stateRef = useRef({
        events: [],
        selection: TIME_PERIODS.all,
        currentViewRange: TIME_PERIODS.all,
        groupedEvents: []
    });

    const eventListenersRef = useRef(new Set());

    const scrollStateRef = useRef({
        isProgrammaticScroll: false,
        programmaticScrollTimeout: null
    });

    // PERFORMANCE FIX: Batch DOM state preservation
    const preserveExpandedStates = useCallback(() => {
        if (!eventDisplayRef.current) return new Map();
        
        const stateMap = new Map();
        const existingEvents = eventDisplayRef.current.querySelectorAll('[data-event-id]');
        
        existingEvents.forEach(element => {
            const eventId = element.getAttribute('data-event-id');
            const triangle = element.querySelector('.event-triangle');
            const isExpanded = triangle?.classList.contains('expanded') || false;
            stateMap.set(eventId, isExpanded);
        });
        
        return stateMap;
    }, []);

    // Formatting functions - simplified for performance
    const formatDuration = useCallback((duration) => {
        if (!duration) return '';
        
        const match = duration.match(/^(\d+)([DY])$/);
        if (!match) return duration;
        
        const [, number, unit] = match;
        const num = parseInt(number, 10);
        
        if (unit === 'D') {
            return num === 1 ? '1 Day' : `${num} Days`;
        } else if (unit === 'Y') {
            return num === 1 ? '1 Year' : `${num} Years`;
        }
        
        return duration;
    }, []);

    const formatParticipants = useCallback((participants, peopleData) => {
        if (!participants || !peopleData.length) return participants;
        
        const participantIds = participants.split(',').map(id => id.trim());
        
        return participantIds.map(id => {
            const person = peopleData.find(p => p.fields.personLookup === id);
            const displayName = person ? person.fields.displayTitle : id;
            return `<a href="https://theographic.netlify.app/person/${id}" target="_blank" rel="noopener noreferrer" class="event-link">${displayName}</a>`;
        }).join(', ');
    }, []);

    const formatLocations = useCallback((locations, placesData) => {
        if (!locations || !placesData.length) return locations;
        
        const locationIds = locations.split(',').map(id => id.trim());
        
        return locationIds.map(id => {
            const place = placesData.find(p => p.fields.placeLookup === id);
            const displayName = place ? place.fields.displayTitle : id;
            return `<a href="https://theographic.netlify.app/place/${id}" target="_blank" rel="noopener noreferrer" class="event-link">${displayName}</a>`;
        }).join(', ');
    }, []);

    const formatVerses = useCallback((verses) => {
        if (!verses) return verses;
        
        return verses.split(',').map(verse => {
            const trimmedVerse = verse.trim();
            const verseMatch = trimmedVerse.match(/^([a-zA-Z0-9]+)\.(\d+)\.(\d+)$/);
            
            if (verseMatch) {
                const [, book, chapter, verseNum] = verseMatch;
                const url = `https://theographic.netlify.app/${book}#${book}.${chapter}.${verseNum}`;
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="event-link">${trimmedVerse}</a>`;
            }
            
            return trimmedVerse;
        }).join(', ');
    }, []);

    const calculateLayoutDimensions = useCallback(() => {
        if (!macroContainerRef.current) return null;
        
        const timelineContainer = macroContainerRef.current.closest('.timeline-container');
        if (!timelineContainer) return null;
        
        const containerStyle = window.getComputedStyle(timelineContainer);
        const containerWidth = timelineContainer.clientWidth; 
        const gap = LAYOUT_CONFIG.MICROCHART_GAP;
        const availableWidth = containerWidth - gap;
        const sidebarWidth = Math.floor(availableWidth * LAYOUT_CONFIG.SIDEBAR_RATIO);
        const contentWidth = Math.floor(availableWidth * LAYOUT_CONFIG.CONTENT_RATIO);
        const microchartWidth = sidebarWidth - LAYOUT_CONFIG.MACROCHART_WIDTH;

        console.log('Layout calculation:', {
            containerWidth,
            availableWidth,
            sidebarWidth,
            microchartWidth,
            minWidth: LAYOUT_CONFIG.MICROCHART_MIN_WIDTH
        });
        
        const showMicrochart = microchartWidth >= LAYOUT_CONFIG.MICROCHART_MIN_WIDTH;
        
        return {
            availableWidth,
            sidebarWidth: showMicrochart ? sidebarWidth : LAYOUT_CONFIG.MACROCHART_WIDTH,
            microchartWidth: showMicrochart ? microchartWidth : 0,
            contentWidth: showMicrochart ? contentWidth : availableWidth - LAYOUT_CONFIG.MACROCHART_WIDTH,
            showMicrochart
        };
    }, []);

    const calculateMasterTimelineScale = useCallback(() => {
        const [fullStart, fullEnd] = FULL_RANGE;
        const referenceHeight = 10000;
        const totalSpan = TIME_RANGES.reduce((sum, range) => 
            sum + Math.abs(range.end - range.start), 0);
        
        const numRanges = TIME_RANGES.length;
        const equalPortionHeight = referenceHeight * EQUAL_DISTRIBUTION_AREA;
        const proportionalPortionHeight = referenceHeight * PROPORTIONATE_DISTRIBUTION_AREA;
        const equalHeightPerRange = equalPortionHeight / numRanges;
        
        const heights = TIME_RANGES.map(range => {
            const span = Math.abs(range.end - range.start);
            const proportionalHeight = (span / totalSpan) * proportionalPortionHeight;
            return equalHeightPerRange + proportionalHeight;
        });

        const positions = [];
        let currentY = 0;
        for (const height of heights) {
            positions.push(currentY);
            currentY += height;
        }

        const yearToPixel = (year) => {
            const rangeIndex = TIME_RANGES.findIndex(range => 
                year >= range.start && year <= range.end);
            
            if (rangeIndex === -1) {
                if (year < TIME_RANGES[0].start) return positions[0];
                if (year > TIME_RANGES[TIME_RANGES.length - 1].end) return referenceHeight;
                return 0;
            }
            
            const range = TIME_RANGES[rangeIndex];
            const rangeSpan = range.end - range.start;
            const positionInRange = (year - range.start) / rangeSpan;
            
            return positions[rangeIndex] + (positionInRange * heights[rangeIndex]);
        };

        const pixelToYear = (pixel) => {
            let rangeIndex = TIME_RANGES.length - 1;
            for (let i = 0; i < positions.length - 1; i++) {
                if (pixel < positions[i + 1]) {
                    rangeIndex = i;
                    break;
                }
            }

            const range = TIME_RANGES[rangeIndex];
            const rangeStart = positions[rangeIndex];
            const rangeHeight = heights[rangeIndex];

            if (rangeHeight <= 0) return range.start;

            const pixelIntoRange = pixel - rangeStart;
            const proportion = pixelIntoRange / rangeHeight;
            const yearSpan = range.end - range.start;
            return range.start + (proportion * yearSpan);
        };

        return { 
            yearToPixel, 
            pixelToYear, 
            totalHeight: referenceHeight,
            heights,
            positions
        };
    }, []);

    const groupEventsByYear = useCallback((events) => {
        const groups = {};
        
        events.forEach(event => {
            const key = event.fields.startDate;
            if (!groups[key]) groups[key] = [];
            groups[key].push(event);
        });
        
        return Object.keys(groups)
            .sort((a, b) => Number(a) - Number(b))
            .map(key => ({ year: Number(key), events: groups[key] }));
    }, []);

    useEffect(() => {
        const eventsWithColumns = calculateColumns(eventsFullData);
        setProcessedEvents(eventsWithColumns);
        masterScale.current = calculateMasterTimelineScale();
        stateRef.current.events = eventsWithColumns;
        stateRef.current.groupedEvents = groupEventsByYear(eventsWithColumns);
    }, [calculateMasterTimelineScale, groupEventsByYear]);

    const calculateMacroLayout = useCallback((dimensions) => {
        const totalSpan = TIME_RANGES.reduce((sum, range) => 
            sum + Math.abs(range.end - range.start), 0);
        
        const numRanges = TIME_RANGES.length;
        const equalPortionHeight = dimensions.height * EQUAL_DISTRIBUTION_AREA;
        const proportionalPortionHeight = dimensions.height * PROPORTIONATE_DISTRIBUTION_AREA;
        const equalHeightPerRange = equalPortionHeight / numRanges;
        
        const heights = TIME_RANGES.map(range => {
            const span = Math.abs(range.end - range.start);
            const proportionalHeight = (span / totalSpan) * proportionalPortionHeight;
            return equalHeightPerRange + proportionalHeight;
        });

        const positions = [];
        let currentY = 0;
        for (const height of heights) {
            positions.push(currentY);
            currentY += height;
        }

        return { heights, positions };
    }, []);

    const createMacroConverters = useCallback((dimensions, { heights, positions }) => {
        const yearToPixel = (year) => {
            const rangeIndex = TIME_RANGES.findIndex(range => 
                year >= range.start && year <= range.end);
            
            if (rangeIndex === -1) {
                if (year < TIME_RANGES[0].start) return positions[0];
                if (year > TIME_RANGES[TIME_RANGES.length - 1].end) return dimensions.height;
                return 0;
            }
            
            const range = TIME_RANGES[rangeIndex];
            const rangeSpan = range.end - range.start;
            const positionInRange = (year - range.start) / rangeSpan;
            
            return positions[rangeIndex] + (positionInRange * heights[rangeIndex]);
        };

        const pixelToYear = (pixel) => {
            let rangeIndex = TIME_RANGES.length - 1;
            for (let i = 0; i < positions.length - 1; i++) {
                if (pixel < positions[i + 1]) {
                    rangeIndex = i;
                    break;
                }
            }

            const range = TIME_RANGES[rangeIndex];
            const rangeStart = positions[rangeIndex];
            const rangeHeight = heights[rangeIndex];

            if (rangeHeight <= 0) return range.start;

            const pixelIntoRange = pixel - rangeStart;
            const proportion = pixelIntoRange / rangeHeight;
            const yearSpan = range.end - range.start;
            return range.start + (proportion * yearSpan);
        };

        return { yearToPixel, pixelToYear, dimensions };
    }, []);

    const cleanupOverlayElements = useCallback(() => {
        const elements = overlayElementsRef.current;
        const container = macroContainerRef.current;
        
        if (container && elements.cleanup) {
            elements.cleanup();
        }

        ['overlay', 'topHandle', 'bottomHandle', 'topHandleText', 'bottomHandleText'].forEach(key => {
            if (elements[key] && elements[key].parentNode) {
                elements[key].parentNode.removeChild(elements[key]);
            }
            elements[key] = null;
        });
        
        elements.cleanup = null;
        selectionState.current.overlayElements = null;
    }, []);

    const createThrottledFunction = useCallback((func, delay) => {
        let timeoutId;
        let lastExecTime = 0;
        
        const throttledFn = (...args) => {
            const currentTime = Date.now();
            
            if (currentTime - lastExecTime > delay) {
                func.apply(this, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                    lastExecTime = Date.now();
                }, delay - (currentTime - lastExecTime));
            }
        };
        
        throttledFn.cancel = () => {
            clearTimeout(timeoutId);
        };
        
        return throttledFn;
    }, []);

    const scrollToYear = useCallback((targetYear) => {
        if (!eventDisplayRef.current || !stateRef.current.events.length) return;

        const container = eventDisplayRef.current;
        const headers = container.querySelectorAll('.event-year-header');
        let closestHeader = null;
        let minDifference = Infinity;
        
        headers.forEach((header, index) => {
            const headerText = header.textContent;
            let year;
            if (headerText.includes('BC|AD')) {
                year = 0;
            } else if (headerText.includes('BC')) {
                const match = headerText.match(/(\d+)\s*BC/);
                year = match ? -parseInt(match[1]) : 0;
            } else {
                const match = headerText.match(/(-?\d+)/);
                year = match ? parseInt(match[1]) : 0;
            }
            
            const difference = Math.abs(year - targetYear);
            
            if (difference < minDifference) {
                minDifference = difference;
                closestHeader = header;
            }
        });
        
        if (closestHeader) {
            const containerRect = container.getBoundingClientRect();
            const headerRect = closestHeader.getBoundingClientRect();
            const relativeTop = headerRect.top - containerRect.top + container.scrollTop;
            container.scrollTop = relativeTop;
        }
    }, [processedEvents]);

    // NEW: Calculate maximum scroll position to prevent over-scrolling
    const calculateMaxScrollPosition = useCallback(() => {
        if (!eventDisplayRef.current) return 0;
        
        const container = eventDisplayRef.current;
        const floatingHeader = container.querySelector('.floating-header');
        const firstEvent = container.querySelector('.event-item');
        
        if (!floatingHeader || !firstEvent) return 0;
        
        const floatingHeaderHeight = floatingHeader.getBoundingClientRect().height;
        const firstEventRect = firstEvent.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate position where first event would be right below floating header
        const firstEventTop = firstEventRect.top - containerRect.top + container.scrollTop;
        const maxScrollTop = Math.max(0, firstEventTop - floatingHeaderHeight);
        
        return maxScrollTop;
    }, []);

    // POSITION INDICATOR FIX: Separate floating header from position detection
    const findTopVisibleYear = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.groupedEvents.length) return null;

        const container = eventDisplayRef.current;
        const { scrollTop, scrollHeight, clientHeight } = container;
        const maxScroll = scrollHeight - clientHeight;
        const atBottom = maxScroll > 0 && scrollTop >= maxScroll - 5;

        if (atBottom) {
            return stateRef.current.groupedEvents[stateRef.current.groupedEvents.length - 1].year;
        }

        // Use logical position instead of visual position for headers
        const SWITCH_THRESHOLD = 20;
        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top;
        
        // Get all original header positions (ignoring any CSS modifications)
        const yearHeaders = container.querySelectorAll('.event-year-header');
        let activeGroupIndex = 0;
        
        for (let i = 0; i < yearHeaders.length; i++) {
            const header = yearHeaders[i];
            
            // Store original styles for restoration
            const originalStyles = {
                opacity: header.style.opacity,
                pointerEvents: header.style.pointerEvents,
                position: header.style.position,
                top: header.style.top
            };
            
            // Temporarily reset to get true position
            header.style.position = 'static';
            header.style.top = 'auto';
            header.style.opacity = '1';
            header.style.pointerEvents = 'auto';
            
            const headerRect = header.getBoundingClientRect();
            const headerTop = headerRect.top;
            
            // Restore original styling
            header.style.opacity = originalStyles.opacity;
            header.style.pointerEvents = originalStyles.pointerEvents;
            header.style.position = originalStyles.position;
            header.style.top = originalStyles.top;
            
            if (headerTop <= containerTop + SWITCH_THRESHOLD) {
                activeGroupIndex = i;
            } else {
                break;
            }
        }

        return stateRef.current.groupedEvents[activeGroupIndex]?.year || null;
    }, []);

    const updatePositionIndicators = useCallback(() => {
        if (!eventDisplayRef.current || !macroIndicatorRef.current || !microIndicatorRef.current) return;
        if (!selectionState.current.macroScaleInfo || !stateRef.current.events.length || !masterScale.current) return;

        const topVisibleYear = findTopVisibleYear();
        
        if (topVisibleYear !== null) {
            setFloatingHeaderYear(topVisibleYear);
            const macroY = selectionState.current.macroScaleInfo.yearToPixel(topVisibleYear);
            const macroContainer = macroContainerRef.current;
            if (macroContainer) {
                const macroDimensions = calculateDimensions(macroContainer);
                macroIndicatorRef.current.style.top = `${Math.max(0, Math.min(macroDimensions.height - 2, macroY - 1))}px`;
            }

            const microContainer = microContainerRef.current;
            if (microContainer && microSvgRef.current) {
                const microDimensions = calculateDimensions(microContainer);
                const [viewStart, viewEnd] = selectionState.current.yearBounds;
                const masterViewStart = masterScale.current.yearToPixel(viewStart);
                const masterViewEnd = masterScale.current.yearToPixel(viewEnd);
                const masterViewHeight = masterViewEnd - masterViewStart;
                const masterYearPos = masterScale.current.yearToPixel(topVisibleYear);
                const microY = ((masterYearPos - masterViewStart) / masterViewHeight) * microDimensions.height;
                
                microIndicatorRef.current.style.top = `${Math.max(0, Math.min(microDimensions.height - 2, microY - 1))}px`;
            }
        }
    }, [calculateDimensions, findTopVisibleYear]);

    // MODIFIED: handleEventScroll with improved logic - never hide first header, add scroll constraints
    const handleEventScroll = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.groupedEvents.length) return;

        // Apply scroll constraint for user scrolling (not programmatic)
        if (!scrollStateRef.current.isProgrammaticScroll) {
            const container = eventDisplayRef.current;
            const maxScrollTop = calculateMaxScrollPosition();

            if (container.scrollTop < maxScrollTop) {
                container.scrollTop = maxScrollTop;
                return; // Exit early if we corrected the scroll
            }
        }

        const topVisibleYear = findTopVisibleYear();
        
        if (topVisibleYear !== null) {
            const container = eventDisplayRef.current;
            const floatingHeader = container.querySelector('.floating-header');
            
            if (floatingHeader) {
                floatingHeader.textContent = formatYear(topVisibleYear);
                floatingHeader.style.display = 'block';
                setFloatingHeaderYear(topVisibleYear);

                // Modified header hiding logic: never hide first header
                const headers = container.querySelectorAll('.event-year-header');
                headers.forEach((header, index) => {
                    const groupYear = stateRef.current.groupedEvents[index]?.year;
                    const shouldHide = groupYear === topVisibleYear;
                    
                    if (shouldHide && index > 0) { // Never hide first header (index 0)
                        // Non-first headers: use opacity (keep in flow for position detection)
                        header.style.position = 'static';
                        header.style.top = 'auto';
                        header.style.opacity = '0';
                        header.style.pointerEvents = 'none';
                    } else {
                        // Not hidden or first header: restore normal state
                        header.style.position = 'static';
                        header.style.top = 'auto';
                        header.style.opacity = '1';
                        header.style.pointerEvents = 'auto';
                    }
                });
            }
        }

        updatePositionIndicators();
    }, [findTopVisibleYear, updatePositionIndicators, calculateMaxScrollPosition]);

    const scrollToEvent = useCallback(async (eventID, eventData) => {
        if (!eventDisplayRef.current || !eventID) return;

        const container = eventDisplayRef.current;
        
        // Set programmatic scroll flag and clear any existing timeout
        scrollStateRef.current.isProgrammaticScroll = true;
        if (scrollStateRef.current.programmaticScrollTimeout) {
            clearTimeout(scrollStateRef.current.programmaticScrollTimeout);
        }

        // Restore all headers to their normal state before calculating scroll position
        const headers = container.querySelectorAll('.event-year-header');
        headers.forEach(header => {
            header.style.position = 'static';
            header.style.top = 'auto';
            header.style.opacity = '1';
            header.style.pointerEvents = 'auto';
        });

        const eventElement = container.querySelector(`[data-event-id="${eventID}"]`);
        if (!eventElement) {
            // Re-enable header hiding if event not found
            scrollStateRef.current.isProgrammaticScroll = false;
            return;
        }

        const triangle = eventElement.querySelector('.event-triangle');
        const eventDetails = eventElement.querySelector('.event-details');
        const isAlreadyExpanded = triangle?.classList.contains('expanded') || false;

        // Step 1: Handle expansion if needed
        if (triangle && eventDetails && !isAlreadyExpanded) {
            triangle.classList.add('expanded');
            eventDetails.classList.remove('collapsed');
            eventDetails.classList.add('expanded');
            
            // Wait for expansion animation to complete
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Step 2: Ensure all DOM updates are complete
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Step 3: Set up floating header
        const floatingHeader = container.querySelector('.floating-header');
        if (floatingHeader && eventData) {
            floatingHeader.textContent = formatYear(eventData.startDate);
            floatingHeader.style.display = 'block';
            
            // Ensure header layout is complete
            floatingHeader.offsetHeight;
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        // Step 4: Calculate and perform scroll
        const containerRect = container.getBoundingClientRect();
        const elementRect = eventElement.getBoundingClientRect();
        
        if (containerRect.height > 0 && elementRect.height > 0) {
            const floatingHeaderHeight = floatingHeader ? 
                floatingHeader.getBoundingClientRect().height : 0;
            
            const currentElementTop = elementRect.top - containerRect.top + container.scrollTop;
            const targetScrollTop = Math.max(0, currentElementTop - floatingHeaderHeight);
            
            container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });

            // Set timeout to re-enable header hiding after scroll completes
            // Use a longer timeout to account for smooth scrolling duration
            scrollStateRef.current.programmaticScrollTimeout = setTimeout(() => {
                scrollStateRef.current.isProgrammaticScroll = false;
                // Trigger one final scroll handler to restore proper header state
                handleEventScroll();
            }, 1000); // Adjust timing as needed
        } else {
            // Re-enable header hiding if scroll calculation fails
            scrollStateRef.current.isProgrammaticScroll = false;
        }
    }, [handleEventScroll]);

    const applyConnectedHover = useCallback((eventID) => {
        if (!microSvgRef.current || !eventID) return;

        const svg = d3.select(microSvgRef.current);
        svg.selectAll(`[data-event-id="${eventID}"]`)
            .transition()
            .duration(100)
            .style('opacity', 0.5);
    }, []);

    const removeConnectedHover = useCallback((eventID) => {
        if (!microSvgRef.current || !eventID) return;

        const svg = d3.select(microSvgRef.current);
        svg.selectAll(`[data-event-id="${eventID}"]`)
            .transition()
            .duration(100)
            .style('opacity', 1.0);
    }, []);

    const throttledIndicatorUpdate = useCallback(
        createThrottledFunction(updatePositionIndicators, UPDATE_THROTTLE_MS),
        [updatePositionIndicators, createThrottledFunction]
    );

    const throttledScrollHandler = useCallback(
        createThrottledFunction(handleEventScroll, UPDATE_THROTTLE_MS),
        [handleEventScroll, createThrottledFunction]
    );

    const renderMicrochart = useCallback(() => {
        if (!microSvgRef.current || !microContainerRef.current || !processedEvents.length || !masterScale.current) return;

        const layoutDims = calculateLayoutDimensions();
        if (!layoutDims || !layoutDims.showMicrochart) {
            microContainerRef.current.classList.add('hidden');
            return;
        }

        microContainerRef.current.classList.remove('hidden');
        microContainerRef.current.style.width = `${layoutDims.microchartWidth}px`;

        const dimensions = calculateDimensions(microContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;
        
        const dynamicDotDiameter = Math.max(6, Math.min(
            MICROCHART_MAX_DOT_DIAMETER, 
            (dimensions.width / ((2 * MICROCHART_COLUMNS) - 1))
        ));
        const dynamicDotRadius = dynamicDotDiameter / 2;
        console.log(dynamicDotDiameter)
        const dynamicLineWidth = Math.max(1, dynamicDotDiameter / 3);
        const [viewStart, viewEnd] = selectionState.current.yearBounds;
        const masterViewStart = masterScale.current.yearToPixel(viewStart);
        const masterViewEnd = masterScale.current.yearToPixel(viewEnd);
        const masterViewHeight = masterViewEnd - masterViewStart;
        const allEvents = processedEvents;
        const byEra = {};
        
        allEvents.forEach(d => {
            const rangeInfo = getRangeInfo(d.fields.startDate);
            const era = rangeInfo.color;
            
            if (!byEra[era]) {
                byEra[era] = [];
            }
            
            byEra[era].push(d);
        });

       const processedEventsForDisplay = [];

        Object.keys(byEra).forEach(era => {
            const eraEvents = byEra[era].filter(d => 
                d.fields.startDate >= viewStart && d.fields.startDate <= viewEnd);
            
            eraEvents.forEach(d => {
                const rangeInfo = getRangeInfo(d.fields.startDate);
                const column = getEffectiveColumn(d);
                const effectiveColumn = Math.min(column - 1, MICROCHART_COLUMNS - 1); 
                const columnWidth = dimensions.width / MICROCHART_COLUMNS;
                const x = (effectiveColumn * columnWidth) + (columnWidth / 2);
                const masterY = masterScale.current.yearToPixel(d.fields.startDate);
                const viewportY = ((masterY - masterViewStart) / masterViewHeight) * dimensions.height;

                processedEventsForDisplay.push({
                    ...d.fields,
                    color: rangeInfo.color,
                    columnX: x,
                    y: viewportY
                });
            });
        });

        const lines = [];

        allEvents.forEach(d => {
            const duration = parseDuration(d.fields.duration);
            if (duration >= 1) {
                const lineStart = parseFloat(d.fields.startDate);
                const lineEnd = lineStart + duration;
                const intersects = (
                    (lineStart >= viewStart && lineStart <= viewEnd) ||
                    (lineEnd >= viewStart && lineEnd <= viewEnd) ||
                    (lineStart <= viewStart && lineEnd >= viewEnd)
                );

                if (intersects) {
                    const rangeInfo = getRangeInfo(d.fields.startDate);
                    const column = getEffectiveColumn(d);
                    const effectiveColumn = Math.min(column - 1, MICROCHART_COLUMNS - 1); 
                    const columnWidth = dimensions.width / MICROCHART_COLUMNS;
                    const x = (effectiveColumn * columnWidth) + (columnWidth / 2);
                    const masterStartY = masterScale.current.yearToPixel(lineStart);
                    const masterEndY = masterScale.current.yearToPixel(lineEnd);
                    const startY = ((masterStartY - masterViewStart) / masterViewHeight) * dimensions.height;
                    const endY = ((masterEndY - masterViewStart) / masterViewHeight) * dimensions.height;
                    const y1 = Math.max(0, Math.min(dimensions.height, startY));
                    const y2 = Math.max(0, Math.min(dimensions.height, endY));
                    
                    lines.push({
                        x1: x,
                        y1: y1,
                        x2: x,
                        y2: y2,
                        color: rangeInfo.color,
                        eventData: d.fields,
                        eventID: d.fields.eventID
                    });
                }
            }
        });

        const oldTooltip = microContainerRef.current.querySelector('.microchart-tooltip');
        if (oldTooltip) {
            oldTooltip.remove();
        }

        const svg = d3.select(microSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        svg.selectAll('*').remove();
        const g = svg.append('g')
            .attr('class', 'microchart-group')
            .attr('transform', `translate(0,0)`);

        const lineGroups = g.selectAll('.microchart-line-group')
            .data(lines)
            .enter()
            .append('g')
            .attr('class', 'microchart-line-group');

        lineGroups
            .append('line')
            .attr('class', 'microchart-line-main')
            .attr('data-event-id', d => d.eventID)
            .attr('x1', d => d.x1)
            .attr('y1', d => d.y1)
            .attr('x2', d => d.x2)
            .attr('y2', d => d.y2)
            .attr('stroke', d => d.color)
            .style('stroke-width', `${dynamicLineWidth}px`)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.eventData?.title || '')
                    .style('left', (event.layerX - TOOLTIP_OFFSET_X) + 'px')
                    .style('top', (event.layerY - TOOLTIP_OFFSET_Y) + 'px');

                applyConnectedHover(d.eventID);
            })
            .on('mouseout', function(event, d) {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);

                removeConnectedHover(d.eventID);
            })
            .on('click', function(event, d) {
                scrollToEvent(d.eventID, d.eventData);
            });

        let tooltip = d3.select(microContainerRef.current).select('.microchart-tooltip');
        if (tooltip.empty()) {
            tooltip = d3.select(microContainerRef.current)
                .append('div')
                .attr('class', 'microchart-tooltip')
                .style('opacity', 0);
        }

        g.selectAll('.microchart-dot')
            .data(processedEventsForDisplay)
            .enter()
            .append('circle')
            .attr('class', 'microchart-dot')
            .attr('data-event-id', d => d.eventID)
            .attr('cx', d => d.columnX)
            .attr('cy', d => d.y)
            .attr('r', dynamicDotRadius) 
            .attr('fill', d => d.color)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .9);
                tooltip.html(d.title)
                    .style('left', (event.layerX - TOOLTIP_OFFSET_X) + 'px')
                    .style('top', (event.layerY - TOOLTIP_OFFSET_Y) + 'px');

                applyConnectedHover(d.eventID);
            })
            .on('mouseout', function(event, d) {
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);

                removeConnectedHover(d.eventID);
            })
            .on('click', function(event, d) {
                scrollToEvent(d.eventID, d);
            });

        throttledIndicatorUpdate();
    }, [calculateLayoutDimensions, calculateDimensions, processedEvents, throttledIndicatorUpdate, applyConnectedHover, removeConnectedHover, scrollToEvent]);

    const updateLayout = useCallback(() => {
        const layoutDims = calculateLayoutDimensions();
        if (!layoutDims) return;

        if (microContainerRef.current) {
            if (layoutDims.showMicrochart) {
                microContainerRef.current.classList.remove('hidden');
                microContainerRef.current.style.width = `${layoutDims.microchartWidth}px`;
            } else {
                microContainerRef.current.classList.add('hidden');
            }
        }

        if (eventDisplayRef.current) {
            eventDisplayRef.current.style.width = `${layoutDims.contentWidth}px`;
        }

        if (layoutDims.showMicrochart) {
            renderMicrochart();
        }
    }, [calculateLayoutDimensions, renderMicrochart]);

    const handleSelectionChange = useCallback((startYear, endYear) => {
        selectionState.current.yearBounds = [startYear, endYear];
        const matchingPeriod = Object.keys(TIME_PERIODS).find(key => {
            const [pStart, pEnd] = TIME_PERIODS[key];
            return Math.abs(pStart - startYear) < 10 && Math.abs(pEnd - endYear) < 10;
        });

        if (matchingPeriod) {
            setSelectedPeriod(matchingPeriod);
            setIsCustomRange(false);
        } else {
            setSelectedPeriod('all');
            setIsCustomRange(true);
        }

        renderMicrochart();
        scrollToYear(startYear);
    }, [renderMicrochart, scrollToYear]);

    const throttledSelectionChange = useCallback(
        createThrottledFunction(handleSelectionChange, UPDATE_THROTTLE_MS),
        [handleSelectionChange, createThrottledFunction]
    );

    const setupMacroOverlay = useCallback((dimensions) => {
        const container = macroContainerRef.current;
        if (!container) return () => {};

        cleanupOverlayElements();

        const handleWidth = dimensions.width * HANDLE_WIDTH_RATIO;
        const handleLeft = (dimensions.width - handleWidth) / 2;
        const overlay = document.createElement('div');
        overlay.className = 'selection-overlay';
        container.appendChild(overlay);

        const topHandle = document.createElement('div');
        topHandle.className = 'top-handle';
        container.appendChild(topHandle);

        const bottomHandle = document.createElement('div');
        bottomHandle.className = 'bottom-handle';
        container.appendChild(bottomHandle);
        
        const topHandleText = document.createElement('div');
        topHandleText.className = 'top-handle-text';
        container.appendChild(topHandleText);

        const bottomHandleText = document.createElement('div');
        bottomHandleText.className = 'bottom-handle-text';
        container.appendChild(bottomHandleText);

        overlayElementsRef.current = {
            overlay,
            topHandle,
            bottomHandle,
            topHandleText,
            bottomHandleText,
            cleanup: null
        };

        const updateOverlayPosition = (y0, y1) => {
            if (!selectionState.current.macroScaleInfo) return;

            const height = y1 - y0;
            if (height < MIN_SELECTION_HEIGHT) return;

            const elements = overlayElementsRef.current;
            if (!elements.overlay) return;

            overlay.style.left = '0px';
            overlay.style.top = y0 + 'px';
            overlay.style.width = dimensions.width + 'px';
            overlay.style.height = height + 'px';

            topHandle.style.left = handleLeft + 'px';
            topHandle.style.top = (y0 - HANDLE_HEIGHT / 2) + 'px';
            topHandle.style.width = handleWidth + 'px';
            topHandle.style.height = HANDLE_HEIGHT + 'px';

            bottomHandle.style.left = handleLeft + 'px';
            bottomHandle.style.top = (y1 - HANDLE_HEIGHT / 2) + 'px';
            bottomHandle.style.width = handleWidth + 'px';
            bottomHandle.style.height = HANDLE_HEIGHT + 'px';

            const { pixelToYear } = selectionState.current.macroScaleInfo;
            const commonTextStyle = `line-height: ${HANDLE_HEIGHT}px; width: ${handleWidth}px; left: ${handleLeft}px;`;

            topHandleText.style.cssText += commonTextStyle + `top: ${y0 - HANDLE_HEIGHT / 2}px;`;
            topHandleText.textContent = formatYear(Math.round(pixelToYear(y0)));

            bottomHandleText.style.cssText += commonTextStyle + `top: ${y1 - HANDLE_HEIGHT / 2}px;`;
            bottomHandleText.textContent = formatYear(Math.round(pixelToYear(y1)));

            selectionState.current.pixelBounds = [y0, y1];
            const startYear = pixelToYear(y0);
            const endYear = pixelToYear(y1);
            throttledSelectionChange(startYear, endYear);
        };

        const createDragHandler = (mode) => (startEvent) => {
            startEvent.preventDefault();
            selectionState.current.isDragging = true;
            
            const startMouseY = startEvent.clientY;
            const [startY0, startY1] = selectionState.current.pixelBounds;
            
            const handleMove = (moveEvent) => {
                const deltaY = moveEvent.clientY - startMouseY;
                let newY0 = startY0;
                let newY1 = startY1;
                const startHeight = startY1 - startY0;

                if (mode === 'drag') {
                    newY0 = Math.max(0, Math.min(dimensions.height - startHeight, startY0 + deltaY));
                    newY1 = newY0 + startHeight;
                } else if (mode === 'resize-top') {
                    newY0 = Math.max(0, Math.min(startY1 - MIN_SELECTION_HEIGHT, startY0 + deltaY));
                } else if (mode === 'resize-bottom') {
                    newY1 = Math.min(dimensions.height, Math.max(startY0 + MIN_SELECTION_HEIGHT, startY1 + deltaY));
                }

                updateOverlayPosition(newY0, newY1);
            };

            const handleUp = () => {
                selectionState.current.isDragging = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
        };

        const dragHandler = createDragHandler('drag');
        const resizeTopHandler = createDragHandler('resize-top');
        const resizeBottomHandler = createDragHandler('resize-bottom');

        overlay.addEventListener('mousedown', dragHandler);
        topHandle.addEventListener('mousedown', resizeTopHandler);
        bottomHandle.addEventListener('mousedown', resizeBottomHandler);

        selectionState.current.overlayElements = { updateOverlayPosition };
        const initialY0 = selectionState.current.macroScaleInfo.yearToPixel(FULL_RANGE[0]);
        const initialY1 = selectionState.current.macroScaleInfo.yearToPixel(FULL_RANGE[1]);
        updateOverlayPosition(initialY0, initialY1);

        const cleanup = () => {
            overlay.removeEventListener('mousedown', dragHandler);
            topHandle.removeEventListener('mousedown', resizeTopHandler);
            bottomHandle.removeEventListener('mousedown', resizeBottomHandler);
            
            [overlay, topHandle, bottomHandle, topHandleText, bottomHandleText].forEach(element => {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });
        };

        overlayElementsRef.current.cleanup = cleanup;
        return cleanup;
    }, [cleanupOverlayElements, throttledSelectionChange]);

    const renderMacrochart = useCallback(() => {
        if (!macroSvgRef.current || !macroContainerRef.current) return;

        cleanupOverlayElements();

        const dimensions = calculateDimensions(macroContainerRef.current);
        if (dimensions.width === 0 || dimensions.height === 0) return;

        const layout = calculateMacroLayout(dimensions);
        const converters = createMacroConverters(dimensions, layout);
        selectionState.current.macroScaleInfo = converters;

        const svg = d3.select(macroSvgRef.current)
            .attr('width', dimensions.width)
            .attr('height', dimensions.height)
            .style('overflow', 'visible');

        svg.selectAll('*').remove();
        const width = dimensions.width * COLOR_BAR_WIDTH_RATIO;
        const x = dimensions.width - width;
        
        svg.selectAll('.era-rect')
            .data(TIME_RANGES)
            .enter()
            .append('rect')
            .attr('class', 'era-rect')
            .attr('x', x)
            .attr('y', (d, i) => layout.positions[i])
            .attr('width', width)
            .attr('height', (d, i) => layout.heights[i])
            .attr('fill', d => d.color);

        const lineStart = x - LABEL_LINE_LENGTH;
        const years = [];
        for (let year = YEAR_LABEL_RANGE_START; year <= YEAR_LABEL_RANGE_END; year += YEAR_LABEL_INTERVAL) {
            years.push(year);
        }
        if (!years.includes(YEAR_LABEL_RANGE_END)) {
            years.push(YEAR_LABEL_RANGE_END);
        }

        svg.selectAll('.year-line')
            .data(years)
            .enter()
            .append('line')
            .attr('class', 'year-line')
            .attr('x1', lineStart)
            .attr('y1', converters.yearToPixel)
            .attr('x2', x)
            .attr('y2', converters.yearToPixel);

        svg.selectAll('.year-label')
            .data(years)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', x - LABEL_MARGIN)
            .attr('y', d => converters.yearToPixel(d) + 5)
            .text(d => d === 0 ? 'BC|AD' : `${Math.abs(d)} BC`);

        setupMacroOverlay(dimensions);
        throttledIndicatorUpdate();

    }, [calculateDimensions, calculateMacroLayout, createMacroConverters, setupMacroOverlay, cleanupOverlayElements, throttledIndicatorUpdate]);

    // PERFORMANCE FIX: Modified createEventItem with batched state preservation
    const createEventItem = useCallback((event, expandedStatesMap) => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';
        eventItem.setAttribute('data-event-id', event.fields.eventID);

        const triangle = document.createElement('button');
        triangle.className = 'event-triangle';
        triangle.textContent = '▶';
        triangle.setAttribute('aria-label', 'Expand event details');

        const eventContent = document.createElement('div');
        eventContent.className = 'event-content';

        const eventTitle = document.createElement('div');
        eventTitle.className = 'event-title';
        eventTitle.textContent = event.fields.title;
        eventContent.appendChild(eventTitle);

        const eventDetails = document.createElement('div');
        eventDetails.className = 'event-details';
        
        const detailFields = [
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

        detailFields.forEach(field => {
            if (event.fields[field.key]) {
                const detail = document.createElement('div');
                detail.className = 'event-detail';
                
                if (field.formatter) {
                    const formattedValue = field.formatter(event.fields[field.key]);
                    detail.innerHTML = `${field.label}: ${formattedValue}`;
                } else {
                    detail.textContent = `${field.label}: ${event.fields[field.key]}`;
                }
                
                eventDetails.appendChild(detail);
            }
        });

        // Use batched state map instead of individual DOM query
        const isCurrentlyExpanded = expandedStatesMap.get(event.fields.eventID) || false;

        if (isCurrentlyExpanded) {
            triangle.classList.add('expanded');
            triangle.setAttribute('aria-label', 'Collapse event details');
            eventDetails.classList.add('expanded');
        } else {
            triangle.setAttribute('aria-label', 'Expand event details');
            eventDetails.classList.add('collapsed');
        }

        eventContent.appendChild(eventDetails);

        triangle.addEventListener('click', () => {
            const container = eventDisplayRef.current;
            const eventRect = eventItem.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const originalViewportPosition = eventRect.top - containerRect.top;
            
            const isCurrentlyExpanded = triangle.classList.contains('expanded');
            
            if (isCurrentlyExpanded) {
                triangle.classList.remove('expanded');
                triangle.setAttribute('aria-label', 'Expand event details');
                eventDetails.classList.remove('expanded');
                eventDetails.classList.add('collapsed');
            } else {
                triangle.classList.add('expanded');
                triangle.setAttribute('aria-label', 'Collapse event details');
                eventDetails.classList.remove('collapsed');
                eventDetails.classList.add('expanded');
            }
            
            setTimeout(() => {
                const newEventRect = eventItem.getBoundingClientRect();
                const newContainerRect = container.getBoundingClientRect();
                const newViewportPosition = newEventRect.top - newContainerRect.top;
                
                const drift = newViewportPosition - originalViewportPosition;
                container.scrollTop += drift;
            }, 300);
        });

        eventItem.appendChild(triangle);
        eventItem.appendChild(eventContent);
        return eventItem;
    }, [formatDuration, formatParticipants, formatLocations, formatVerses]);

    // MODIFIED: updateEventDisplay with initial scroll position setting
    const updateEventDisplay = useCallback(() => {
        if (!eventDisplayRef.current || !stateRef.current.events.length) return;

        // Batch preserve states before rebuilding
        const expandedStatesMap = preserveExpandedStates();

        const [startYear, endYear] = selectionState.current.currentViewRange;
        const filteredEvents = stateRef.current.events.filter(event => 
            event.fields.startDate >= startYear && event.fields.startDate <= endYear);
        const groupedEvents = groupEventsByYear(filteredEvents);
        stateRef.current.groupedEvents = groupedEvents;

        const container = eventDisplayRef.current;
        const fragment = document.createDocumentFragment();
        
        const floatingHeader = document.createElement('div');
        floatingHeader.className = 'floating-header';
        floatingHeader.style.display = 'none';
        fragment.appendChild(floatingHeader);

        if (groupedEvents.length === 0) {
            const noEvents = document.createElement('p');
            noEvents.textContent = 'No events to display.';
            fragment.appendChild(noEvents);
        } else {
            groupedEvents.forEach(group => {
                const yearHeader = document.createElement('h3');
                yearHeader.className = 'event-year-header';
                yearHeader.textContent = formatYear(group.year);
                fragment.appendChild(yearHeader);

                group.events.forEach(event => {
                    // Pass the batched state map to avoid individual queries
                    fragment.appendChild(createEventItem(event, expandedStatesMap));
                });
            });
        }

        container.innerHTML = '';
        container.appendChild(fragment);
    }, [preserveExpandedStates, groupEventsByYear, createEventItem, calculateMaxScrollPosition, throttledIndicatorUpdate]);

    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        const newRange = TIME_PERIODS[period];
        
        stateRef.current.selection = newRange;
        stateRef.current.currentViewRange = newRange;
        
        selectionState.current.yearBounds = newRange;
        selectionState.current.currentViewRange = newRange;
        
        updateEventDisplay();
        renderMicrochart();

        if (selectionState.current.macroScaleInfo && selectionState.current.overlayElements) {
            const { yearToPixel } = selectionState.current.macroScaleInfo;
            const y0 = yearToPixel(newRange[0]);
            const y1 = yearToPixel(newRange[1]);
            selectionState.current.pixelBounds = [y0, y1];
            selectionState.current.overlayElements.updateOverlayPosition(y0, y1);
        }

        if (period !== 'all' && newRange) {
            scrollToYear(newRange[0]);
        }
    }, [updateEventDisplay, renderMicrochart, scrollToYear]);

    const setupChart = useCallback((containerRef, svgRef, renderFunction, chartName) => {
        if (!containerRef.current) return null;

                if (!svgRef.current) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            containerRef.current.appendChild(svg);
            svgRef.current = svg;
        }

        renderFunction();

        const resizeObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(() => {
                if (containerRef.current) {
                    if (chartName === 'micro') {
                        updateLayout();
                    } else {
                        renderFunction();
                    }
                }
            });
        });

        resizeObserver.observe(containerRef.current.closest('.timeline-container') || containerRef.current);

        return resizeObserver;
    }, [updateLayout]);
    useEffect(() => {
        if (!processedEvents.length || !masterScale.current) return;

        const macroObserver = setupChart(macroContainerRef, macroSvgRef, renderMacrochart, 'macro');
        const microObserver = setupChart(microContainerRef, microSvgRef, renderMicrochart, 'micro');

        return () => {
            if (macroObserver) macroObserver.disconnect();
            if (microObserver) microObserver.disconnect();

            if (throttledSelectionChange?.cancel) {
                throttledSelectionChange.cancel();
            }
            
            if (throttledIndicatorUpdate?.cancel) {
                throttledIndicatorUpdate.cancel();
            }
            
            if (throttledScrollHandler?.cancel) {
                throttledScrollHandler.cancel();
            }

            // Clear programmatic scroll timeout
            if (scrollStateRef.current.programmaticScrollTimeout) {
                clearTimeout(scrollStateRef.current.programmaticScrollTimeout);
            }

            cleanupOverlayElements();
            eventListenersRef.current.forEach(cleanup => cleanup());
            eventListenersRef.current.clear();
        };
    }, [setupChart, renderMacrochart, renderMicrochart, processedEvents, throttledSelectionChange, throttledIndicatorUpdate, throttledScrollHandler, cleanupOverlayElements]);
        
useEffect(() => {
    if (!eventDisplayRef.current) return;

    const container = eventDisplayRef.current;

    // Original scroll listener (keep if needed for other logic)
    container.addEventListener('scroll', handleEventScroll);

    // New preventive listeners
    const preventUnwantedScroll = (e) => {
        const maxScrollTop = calculateMaxScrollPosition();  // Your existing function
        const atTop = container.scrollTop <= maxScrollTop;

        // For wheel: Prevent if trying to scroll up (negative deltaY) at the top
        if (e.type === 'wheel' && atTop && e.deltaY < 0) {
            e.preventDefault();
            return;
        }

        // For touch: Prevent if moving downward (which scrolls up) at the top
        if (e.type === 'touchmove' && atTop) {
            // Simple check: if touch is moving down (positive dy), prevent if at top
            // You may need to track touch start position for precision
            e.preventDefault();
        }
    };

    container.addEventListener('wheel', preventUnwantedScroll, { passive: false });
    container.addEventListener('touchmove', preventUnwantedScroll, { passive: false });

    return () => {
        // Clean up original listener
        container.removeEventListener('scroll', handleEventScroll);
        // Clean up new listeners
        container.removeEventListener('wheel', preventUnwantedScroll);
        container.removeEventListener('touchmove', preventUnwantedScroll);
    };
}, [calculateMaxScrollPosition, handleEventScroll]);  // Include dependencies to avoid stale values


    useEffect(() => {
        updateEventDisplay();
    }, [updateEventDisplay]);

    return (
        <>
        <style>{getStyleOf('style.css')}</style>
        <style>{`
            .event-details {
                transition: max-height 0.3s ease, opacity 0.3s ease;
                overflow: hidden;
            }
            
            .event-details.collapsed {
                max-height: 0;
                opacity: 0;
            }
            
            .event-details.expanded {
                max-height: 500px; /* Adjust as needed for content */
                opacity: 1;
            }
            
            .event-link {
                color: #007acc;
                text-decoration: none;
            }
            
            .event-link:hover {
                text-decoration: underline;
            }
        `}</style>
        <div className="page-container">
            <div className="content-wrapper">
                <header className="header">
                    <h1><i>Timeline of the Bible</i></h1>
                    <div className="header-controls">
                        <div className="order-1">
                            <form>
                                <ul id="people-legend">
                                    {PERIODS.map(period => (
                                        <li key={period.value}>
                                            <input 
                                                id={`people-legend-${period.value}`}
                                                type="radio" 
                                                name="people-legend" 
                                                value={period.value}
                                                checked={!isCustomRange && selectedPeriod === period.value}
                                                onChange={handlePeriodChange} 
                                            />
                                            <label htmlFor={`people-legend-${period.value}`}>
                                                {period.label}
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </form>
                        </div>
                    </div>
                </header>
                <div className="timeline-container">
                    <div className="sidebar">
                        <div className="macrochart-container" ref={macroContainerRef}>
                            <div ref={macroIndicatorRef} className="position-indicator"></div>
                        </div>
                        <div className="microchart-container" ref={microContainerRef}>
                            <div ref={microIndicatorRef} className="microchart-position-indicator"></div>
                        </div>
                    </div>
                    <div className="event-display-container" ref={eventDisplayRef}></div>
                </div>
            </div>
        </div>
        </>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EventsTimeline />
  </React.StrictMode>
);