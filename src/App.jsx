import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MacroChart from './components/MacroChart/MacroChart.jsx';
import Microchart from './components/MicroChart/MicroChart.jsx';
import EventDisplay from './components/EventDisplay/EventDisplay.jsx';
import { calculateColumns } from './utils/utils.js';
import { EVENTS_BOUND } from './utils/constants.js';
import './app.css'

const TIME_PERIODS = {
    'all': [-4100, 150],
    'period1': [-4100, -3000],
    'period2': [-2999, -2000], 
    'period3': [-1999, -1000],
    'period4': [-999, 0],
    'period5': [1, 150]
};

const PERIODS = [
    { value: 'all', label: 'ALL' },
    { value: 'period1', label: '4101 BC - 3001 BC' },
    { value: 'period2', label: '3000 BC - 2001 BC' },
    { value: 'period3', label: '2000 BC - 1001 BC' },
    { value: 'period4', label: '1000 BC - 1 BC' },
    { value: 'period5', label: '1 AD - 150 AD' }
];

const parseUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const startYear = params.get('startYear');
    const endYear = params.get('endYear');
    
    if (!startYear || !endYear) {
        return null;
    }
    
    const start = Math.round(parseFloat(startYear));
    const end = Math.round(parseFloat(endYear));
    
    if (isNaN(start) || isNaN(end) || start >= end) {
        return null;
    }
    
    const minYear = TIME_PERIODS.all[0];
    const maxYear = TIME_PERIODS.all[1];
    
    const clampedStart = Math.max(minYear, Math.min(maxYear, start));
    const clampedEnd = Math.max(minYear, Math.min(maxYear, end));
    
    if (clampedStart >= clampedEnd) {
        return null;
    }
    
    return [clampedStart, clampedEnd];
};

const findMatchingPeriod = (range) => {
    const entry = Object.entries(TIME_PERIODS).find(([key, periodRange]) => {
        return periodRange[0] === range[0] && periodRange[1] === range[1];
    });
    return entry ? entry[0] : null;
};

const updateUrl = (range) => {
    const url = new URL(window.location.href);
    url.searchParams.set('startYear', range[0].toString());
    url.searchParams.set('endYear', range[1].toString());
    window.history.replaceState({}, '', url);
};

const App = () => {
    const [events, setEvents] = useState([]);
    const [selection, setSelection] = useState(TIME_PERIODS.all);
    const [indicatorY, setIndicatorY] = useState(0);
    const [microchartIndicatorY, setMicrochartIndicatorY] = useState(null);
    const [scrollInfo, setScrollInfo] = useState({ 
        topVisibleYear: EVENTS_BOUND[0], 
        selectionRange: TIME_PERIODS.all
    });
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const [isCustomRange, setIsCustomRange] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const eventDisplayRef = useRef(null);
    const isInitialLoad = useRef(true);

    useEffect(() => {
        const urlRange = parseUrlParams();
        
        if (urlRange) {
            const matchingPeriod = findMatchingPeriod(urlRange);
            
            setSelection(urlRange);
            setScrollInfo(prev => ({ ...prev, selectionRange: urlRange }));
            
            if (matchingPeriod) {
                setSelectedPeriod(matchingPeriod);
                setIsCustomRange(false);
            } else {
                setSelectedPeriod(null);
                setIsCustomRange(true);
            }
        } else {
            const defaultRange = TIME_PERIODS.all;
            
            setSelection(defaultRange);
            setScrollInfo(prev => ({ ...prev, selectionRange: defaultRange }));
            setSelectedPeriod('all');
            setIsCustomRange(false);
            updateUrl(defaultRange);
        }
        
        setIsInitialized(true);
        
        setTimeout(() => {
            isInitialLoad.current = false;
        }, 100);
    }, []);

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

    const handleBrush = useCallback((domain) => {
        if (isInitialLoad.current) {
            return;
        }
        
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
        
        const matchingPeriod = findMatchingPeriod(boundedDomain);
        
        if (matchingPeriod) {
            setSelectedPeriod(matchingPeriod);
            setIsCustomRange(false);
        } else {
            setSelectedPeriod(null); 
            setIsCustomRange(true);
        }
        
        updateUrl(boundedDomain);
    }, []);

    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        
        if (isInitialLoad.current) {
            return;
        }
        
        if (!TIME_PERIODS[period]) {
            return;
        }
        
        setSelectedPeriod(period);
        setIsCustomRange(false);
        
        const newRange = TIME_PERIODS[period];
        
        setSelection(newRange);
        setScrollInfo(prev => ({ ...prev, selectionRange: newRange }));
        
        updateUrl(newRange);
    }, []);

    const handleIndicatorChange = useCallback((y) => {
        setIndicatorY(y);
    }, []);

    const handleMicrochartIndicatorChange = useCallback((y) => {
        setMicrochartIndicatorY(y);
    }, []);

    useEffect(() => {
        const handlePopState = () => {
            const urlRange = parseUrlParams();
            
            if (urlRange) {
                const matchingPeriod = findMatchingPeriod(urlRange);
                
                setSelection(urlRange);
                setScrollInfo(prev => ({ ...prev, selectionRange: urlRange }));
                
                if (matchingPeriod) {
                    setSelectedPeriod(matchingPeriod);
                    setIsCustomRange(false);
                } else {
                    setSelectedPeriod(null);
                    setIsCustomRange(true);
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);

    const microchartIndicatorStyle = useMemo(() => ({
        top: `${microchartIndicatorY}px`,
        opacity: microchartIndicatorY !== null ? 1 : 0,
        transition: 'opacity 0.3s ease'
    }), [microchartIndicatorY]);

    const macroIndicatorStyle = useMemo(() => ({
        top: `${indicatorY}px`
    }), [indicatorY]);

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