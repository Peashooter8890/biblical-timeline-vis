import React, { useState, useEffect, useCallback, useRef } from 'react';
import MacroChart from './components/MacroChart/MacroChart.jsx';
import Microchart from './components/MicroChart/MicroChart.jsx';
import EventDisplay from './components/EventDisplay/EventDisplay.jsx';
import { calculateColumns } from './utils/utils.js';
import './app.css'

const TIME_PERIODS = {
    'all': [-4100, 150],
    'period1': [-4003, -3001],
    'period2': [-3000, -2001], 
    'period3': [-2000, -1001],
    'period4': [-1000, 0],
    'period5': [0, 57]
};

const App = () => {
    const [events, setEvents] = useState([]);
    const [selection, setSelection] = useState([-4100, 150]);
    const [indicatorY, setIndicatorY] = useState(0);
    const [microchartIndicatorY, setMicrochartIndicatorY] = useState(0);
    const [scrollInfo, setScrollInfo] = useState({ 
        topVisibleYear: -4003, 
        selectionRange: [-4003, 57] 
    });
    const [selectedPeriod, setSelectedPeriod] = useState('all');
    const eventDisplayRef = useRef(null);

    useEffect(() => {
        fetch('/data/events.json')
            .then(res => res.json())
            .then(data => {
                const dataWithColumns = calculateColumns(data);
                const sortedData = dataWithColumns.sort((a, b) => a.fields.startDate - b.fields.startDate);
                setEvents(sortedData);
            })
            .catch(err => console.error("Failed to load event data:", err));
    }, []);

    const handleBrush = useCallback((domain) => {
        setSelection(domain);
        setScrollInfo(prev => ({ ...prev, selectionRange: domain }));
    }, []);

    const handlePeriodChange = (event) => {
        const period = event.target.value;
        setSelectedPeriod(period);
        
        const newRange = TIME_PERIODS[period];
        setSelection(newRange);
        setScrollInfo(prev => ({ ...prev, selectionRange: newRange }));
    };

    const periods = [
        { value: 'all', label: 'ALL' },
        { value: 'period1', label: '4003 BC - 3001 BC' },
        { value: 'period2', label: '3000 BC - 2001 BC' },
        { value: 'period3', label: '2000 BC - 1001 BC' },
        { value: 'period4', label: '1000 BC - 0' },
        { value: 'period5', label: '0 - 57 AD' }
    ];

    return (
        <div className="page-container">
            <div className="content-wrapper">
                <header className="header">
                    <h1><i>Timeline of the Bible</i></h1>
                    <div className="header-controls">
                        <div className="order-1">
                            <form>
                                <ul id="people-legend">
                                    {periods.map(period => (
                                        <li key={period.value}>
                                            <input 
                                                id={`people-legend-${period.value}`}
                                                type="radio" 
                                                name="people-legend" 
                                                value={period.value}
                                                checked={selectedPeriod === period.value}
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
                                onBrush={handleBrush}
                                onIndicatorChange={setIndicatorY}
                                scrollInfo={scrollInfo}
                                externalSelection={selection} />
                           <div className="position-indicator" style={{top: `${indicatorY}px`}}></div>
                        </div>
                        <div className="microchart-container">
                            <Microchart 
                                data={events} 
                                selection={selection}
                                onIndicatorChange={setMicrochartIndicatorY}
                                scrollInfo={scrollInfo} />
                            <div className="microchart-position-indicator" style={{top: `${microchartIndicatorY}px`}}></div>
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