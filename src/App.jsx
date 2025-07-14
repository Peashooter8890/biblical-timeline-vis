import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MacroChart from './components/MacroChart/MacroChart.jsx';
import Microchart from './components/MicroChart/MicroChart.jsx';
import EventDisplay from './components/EventDisplay/EventDisplay.jsx';
import { calculateColumns } from './utils/utils.js';
import { EVENTS_BOUND } from './utils/constants.js';
import './app.css'

// Move TIME_PERIODS outside component to prevent recreation
const TIME_PERIODS = {
    'all': [-4100, 150],
    'period1': [-4100, -3000],
    'period2': [-2999, -2000], 
    'period3': [-1999, -1000],
    'period4': [-999, 0],
    'period5': [1, 150]
};

// Move periods array outside component to prevent recreation
const PERIODS = [
    { value: 'all', label: 'ALL' },
    { value: 'period1', label: '4101 BC - 3001 BC' },
    { value: 'period2', label: '3000 BC - 2001 BC' },
    { value: 'period3', label: '2000 BC - 1001 BC' },
    { value: 'period4', label: '1000 BC - 1 BC' },
    { value: 'period5', label: '1 AD - 150 AD' }
];

const App = () => {
    const [events, setEvents] = useState([]);
    const [selection, setSelection] = useState([-4100, 150]);
    const [indicatorY, setIndicatorY] = useState(0);
    const [microchartIndicatorY, setMicrochartIndicatorY] = useState(null);
    const [scrollInfo, setScrollInfo] = useState({ 
        topVisibleYear: EVENTS_BOUND[0], 
        selectionRange: EVENTS_BOUND
    });
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const eventDisplayRef = useRef(null);

    // Memoize URL parameter functions
    const getUrlParams = useCallback(() => {
        const params = new URLSearchParams(window.location.search);
        return {
            startYear: params.get('startYear'),
            endYear: params.get('endYear')
        };
    }, []);
    
    const updateUrl = useCallback((range) => {
        const url = new URL(window.location.href);
        
        url.searchParams.set('startYear', range[0].toString());
        url.searchParams.set('endYear', range[1].toString());

        window.history.replaceState({}, '', url);
    }, []);

    // Memoize the initial range calculation
    const getInitialRangeFromUrl = useCallback(() => {
        const { startYear, endYear } = getUrlParams();
        
        if (startYear && endYear) {
            let start = Math.round(parseFloat(startYear));
            let end = Math.round(parseFloat(endYear));
            
            if (!isNaN(start) && !isNaN(end) && start < end) {
                const minYear = TIME_PERIODS.all[0]; 
                const maxYear = TIME_PERIODS.all[1]; 
                
                start = Math.max(minYear, Math.min(maxYear, start));
                end = Math.max(minYear, Math.min(maxYear, end));
                
                if (start >= end) {
                    end = Math.min(maxYear, start + 1);
                }
                
                const exactMatch = Object.entries(TIME_PERIODS).find(([key, range]) => {
                    return range[0] === start && range[1] === end;
                });
                
                return {
                    period: exactMatch ? exactMatch[0] : null,
                    range: [start, end],
                    isCustom: !exactMatch
                };
            }
        }
        
        return {
            period: 'all',
            range: TIME_PERIODS.all,
            isCustom: false
        };
    }, [getUrlParams]);

    // Initialize from URL parameters
    useEffect(() => {
        const { period, range, isCustom } = getInitialRangeFromUrl();
        
        setSelectedPeriod(period);
        setSelection(range);
        setIsCustomRange(isCustom);
        setScrollInfo(prev => ({ ...prev, selectionRange: range }));
        setIsInitialized(true);
        
        // Use setTimeout to avoid race conditions with URL updates
        const timeoutId = setTimeout(() => {
            updateUrl(range);
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [getInitialRangeFromUrl, updateUrl]);

    // Load events data
    useEffect(() => {
        let isMounted = true;

        fetch('/data/events.json')
            .then(res => res.json())
            .then(data => {
                if (isMounted) {
                    const dataWithColumns = calculateColumns(data);
                    const sortedData = dataWithColumns.sort((a, b) => a.fields.startDate - b.fields.startDate);
                    setEvents(sortedData);
                }
            })
            .catch(err => {
                if (isMounted) {
                    console.error("Failed to load event data:", err);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    // Memoize brush handler to prevent recreation
    const handleBrush = useCallback((domain) => {
        const roundedDomain = [Math.round(domain[0]), Math.round(domain[1])];
        
        const minYear = TIME_PERIODS.all[0]; 
        const maxYear = TIME_PERIODS.all[1]; 
        
        const boundedDomain = [
            Math.max(minYear, Math.min(maxYear, roundedDomain[0])),
            Math.max(minYear, Math.min(maxYear, roundedDomain[1]))
        ];
        
        if (boundedDomain[0] >= boundedDomain[1]) {
            boundedDomain[1] = Math.min(maxYear, boundedDomain[0] + 1);
        }
        
        setSelection(boundedDomain);
        setScrollInfo(prev => ({ ...prev, selectionRange: boundedDomain }));
        
        const exactMatch = Object.entries(TIME_PERIODS).find(([key, range]) => {
            return range[0] === boundedDomain[0] && range[1] === boundedDomain[1];
        });
        
        if (exactMatch) {
            setSelectedPeriod(exactMatch[0]);
            setIsCustomRange(false);
        } else {
            setSelectedPeriod(null); 
            setIsCustomRange(true);
        }
        
        updateUrl(boundedDomain);
    }, [updateUrl]);

    // Memoize period change handler
    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        
        if (!TIME_PERIODS[period]) {
            return;
        }
        
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        const newRange = TIME_PERIODS[period];
        setSelection(newRange);
        setScrollInfo(prev => ({ ...prev, selectionRange: newRange }));
        
        updateUrl(newRange);
    }, [updateUrl]);

    // Memoize indicator change handlers
    const handleIndicatorChange = useCallback((y) => {
        setIndicatorY(y);
    }, []);

    const handleMicrochartIndicatorChange = useCallback((y) => {
        setMicrochartIndicatorY(y);
    }, []);

    // Handle browser back/forward navigation
    useEffect(() => {
        const handlePopState = () => {
            const { period, range, isCustom } = getInitialRangeFromUrl();
            setSelectedPeriod(period);
            setSelection(range);
            setIsCustomRange(isCustom);
            setScrollInfo(prev => ({ ...prev, selectionRange: range }));
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [getInitialRangeFromUrl]);

    // Memoize indicator styles to prevent object recreation
    const microchartIndicatorStyle = useMemo(() => ({
        top: `${microchartIndicatorY}px`,
        opacity: microchartIndicatorY !== null ? 1 : 0,
        transition: 'opacity 0.3s ease'
    }), [microchartIndicatorY]);

    const macroIndicatorStyle = useMemo(() => ({
        top: `${indicatorY}px`
    }), [indicatorY]);

    // Show loading state
    if (!isInitialized) {
        return <div className="page-container">Loading...</div>;
    }

    return (
        <div className="page-container">
            <div className="content-wrapper">
                <header className="header">
                    <h1 style={{ color: "black" }}><i>Timeline of the Bible</i></h1>
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
                        <div className="macrochart-container">
                           <MacroChart
                                data={events}
                                onBrush={handleBrush}
                                onIndicatorChange={handleIndicatorChange}
                                scrollInfo={scrollInfo}
                                externalSelection={selection} />
                           <div className="position-indicator" style={macroIndicatorStyle}></div>
                        </div>
                        <div className="microchart-container">
                            <Microchart 
                                data={events} 
                                selection={selection}
                                onIndicatorChange={handleMicrochartIndicatorChange}
                                scrollInfo={scrollInfo} />
                            {microchartIndicatorY !== null && (
                                <div 
                                    className="microchart-position-indicator" 
                                    style={microchartIndicatorStyle}
                                ></div>
                            )}
                        </div>
                    </div>
                    <EventDisplay 
                        data={events}
                        selection={selection}
                        onScrollInfoChange={setScrollInfo}
                        containerRef={eventDisplayRef} />
                </div>
            </div>
        </div>
    );
};

export default App;