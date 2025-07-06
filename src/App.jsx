import React, { useState, useEffect, useCallback, useRef } from 'react';
import EraScrollbar from './components/EraScrollbar/EraScrollbar.jsx';
import Microchart from './components/MicroChart/Microchart.jsx';
import EventDisplay from './components/EventDisplay/EventDisplay.jsx';
import { calculateColumns } from './utils/utils.js';
import './app.css'

const App = () => {
    const [events, setEvents] = useState([]);
    const [selection, setSelection] = useState([-4004, 57]);
    const [indicatorY, setIndicatorY] = useState(0);
    const [microchartIndicatorY, setMicrochartIndicatorY] = useState(0);
    const [scrollInfo, setScrollInfo] = useState({ 
        topVisibleYear: -4003, 
        selectionRange: [-4003, 57] 
    });
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const eventDisplayRef = useRef(null);

    // Define the time periods
    const timePeriods = {
        'all': [-4003, 57],
        'period1': [-4003, -3001],
        'period2': [-3000, -2001], 
        'period3': [-2000, -1001],
        'period4': [-1000, 0],
        'period5': [0, 57]
    };

    useEffect(() => {
        fetch('/data/events.json')
            .then(res => res.json())
            .then(data => {
                // Calculate custom columns for events with empty column values
                const dataWithColumns = calculateColumns(data);
                const sortedData = dataWithColumns.sort((a, b) => a.fields.startDate - b.fields.startDate);
                setEvents(sortedData);
            })
            .catch(err => console.error("Failed to load event data:", err));
    }, []);

    const handleBrush = useCallback((domain) => {
        setSelection(domain);
        // Update scrollInfo with new selection range
        setScrollInfo(prev => ({
            ...prev,
            selectionRange: domain
        }));
    }, []);

    const handleIndicatorChange = useCallback((yPosition) => {
        setIndicatorY(yPosition);
    }, []);

    const handleMicrochartIndicatorChange = useCallback((yPosition) => {
        setMicrochartIndicatorY(yPosition);
    }, []);

    const handleScrollInfoChange = useCallback((newScrollInfo) => {
        setScrollInfo(newScrollInfo);
    }, []);

    // Replace handleExternalScroll with a direct wheel handler
    const handleTimelineScroll = useCallback((event) => {
        if (eventDisplayRef.current) {
            event.preventDefault();
            const container = eventDisplayRef.current;
            const scrollAmount = event.deltaY;
            container.scrollTop += scrollAmount;
        }
    }, []);

    // Handle period selection changes
    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        setSelectedPeriod(period);
        
        const newRange = timePeriods[period];
        setSelection(newRange);
        setScrollInfo(prev => ({
            ...prev,
            selectionRange: newRange
        }));
    }, [timePeriods]);

    return (
        <div className="page-container">
            <div className="content-wrapper">
                <header className="header">
                    <h1><i>Timeline of the Bible</i></h1>
                    <div className="header-controls">
                        <div className="order-1">
                            <form>
                                <ul id="people-legend">
                                    <li><input id="people-legend-all" type="radio" name="people-legend" value="all" checked={selectedPeriod === 'all'} onChange={handlePeriodChange} /><label htmlFor="people-legend-all">ALL</label></li>
                                    <li><input id="people-legend-period1" type="radio" name="people-legend" value="period1" checked={selectedPeriod === 'period1'} onChange={handlePeriodChange} /><label htmlFor="people-legend-period1">4003 BC - 3001 BC</label></li>
                                    <li><input id="people-legend-period2" type="radio" name="people-legend" value="period2" checked={selectedPeriod === 'period2'} onChange={handlePeriodChange} /><label htmlFor="people-legend-period2">3000 BC - 2001 BC</label></li>
                                    <li><input id="people-legend-period3" type="radio" name="people-legend" value="period3" checked={selectedPeriod === 'period3'} onChange={handlePeriodChange} /><label htmlFor="people-legend-period3">2000 BC - 1001 BC</label></li>
                                    <li><input id="people-legend-period4" type="radio" name="people-legend" value="period4" checked={selectedPeriod === 'period4'} onChange={handlePeriodChange} /><label htmlFor="people-legend-period4">1000 BC - 0</label></li>
                                    <li><input id="people-legend-period5" type="radio" name="people-legend" value="period5" checked={selectedPeriod === 'period5'} onChange={handlePeriodChange} /><label htmlFor="people-legend-period5">0 - 57 AD</label></li>
                                </ul>
                            </form>
                        </div>
                    </div>
                </header>
                <div className="timeline-container" onWheel={handleTimelineScroll}>
                    <div className="sidebar">
                        <div className="era-scrollbar-container">
                           <EraScrollbar
                                onBrush={handleBrush}
                                onIndicatorChange={handleIndicatorChange}
                                scrollInfo={scrollInfo}
                                externalSelection={selection} />
                           <div className="position-indicator" style={{top: `${indicatorY}px`}}></div>
                        </div>
                        <div className="microchart-container">
                            <Microchart 
                                data={events} 
                                selection={selection}
                                onIndicatorChange={handleMicrochartIndicatorChange}
                                scrollInfo={scrollInfo} />
                            <div className="microchart-position-indicator" style={{top: `${microchartIndicatorY}px`}}></div>
                        </div>
                    </div>
                    <EventDisplay 
                        data={events}
                        selection={selection}
                        onScrollInfoChange={handleScrollInfoChange}
                        containerRef={eventDisplayRef} />
                </div>
            </div>
        </div>
    );
};

export default App;
