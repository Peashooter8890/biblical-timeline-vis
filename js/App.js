import EraScrollbar from './EraScrollbar.js';
import Microchart from './Microchart.js';
import EventDisplay from './EventDisplay.js';
import { calculateColumns } from './utils.js';

const { useState, useEffect, useCallback, useRef } = preactHooks;
const html = htm.bind(preact.h);

const App = () => {
    const [events, setEvents] = useState([]);
    const [selection, setSelection] = useState([-4004, 30]);
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
        fetch('data/events.json')
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

    // Handle scroll events from microchart and era scrollbar
    const handleExternalScroll = useCallback((deltaY) => {
        if (eventDisplayRef.current) {
            const container = eventDisplayRef.current;
            const scrollAmount = deltaY * 2; // Adjust scroll sensitivity
            container.scrollTop += scrollAmount;
        }
    }, []);

    // Handle period selection changes
    const handlePeriodChange = useCallback((event) => {
        const period = event.target.value;
        setSelectedPeriod(period);
        
        const newRange = timePeriods[period];
        if (newRange) {
            setSelection(newRange);
            setScrollInfo(prev => ({
                ...prev,
                selectionRange: newRange
            }));
        }
    }, []);

    return html`
        <div class="page-container">
            <div class="content-wrapper">
                <header class="header">
                    <h1><i>Timeline of the Bible</i></h1>
                    <div class="header-controls">
                        <div class="order-1">
                            <form>
                                <ul id="people-legend">
                                    <li><input id="people-legend-all" type="radio" name="people-legend" value="all" checked=${selectedPeriod === 'all'} onChange=${handlePeriodChange} /><label for="people-legend-all">ALL</label></li>
                                    <li><input id="people-legend-period1" type="radio" name="people-legend" value="period1" checked=${selectedPeriod === 'period1'} onChange=${handlePeriodChange} /><label for="people-legend-period1">4003 BC - 3001 BC</label></li>
                                    <li><input id="people-legend-period2" type="radio" name="people-legend" value="period2" checked=${selectedPeriod === 'period2'} onChange=${handlePeriodChange} /><label for="people-legend-period2">3000 BC - 2001 BC</label></li>
                                    <li><input id="people-legend-period3" type="radio" name="people-legend" value="period3" checked=${selectedPeriod === 'period3'} onChange=${handlePeriodChange} /><label for="people-legend-period3">2000 BC - 1001 BC</label></li>
                                    <li><input id="people-legend-period4" type="radio" name="people-legend" value="period4" checked=${selectedPeriod === 'period4'} onChange=${handlePeriodChange} /><label for="people-legend-period4">1000 BC - 0</label></li>
                                    <li><input id="people-legend-period5" type="radio" name="people-legend" value="period5" checked=${selectedPeriod === 'period5'} onChange=${handlePeriodChange} /><label for="people-legend-period5">0 - 57 AD</label></li>
                                </ul>
                            </form>
                        </div>
                    </div>
                </header>
                <div class="timeline-container">
                    <div class="sidebar">
                        <div class="era-scrollbar-container">
                           <${EraScrollbar}
                                onBrush=${handleBrush}
                                onIndicatorChange=${handleIndicatorChange}
                                scrollInfo=${scrollInfo}
                                onScroll=${handleExternalScroll}
                                externalSelection=${selection} />
                           <div class="position-indicator" style=${{top: `${indicatorY}px`}}></div>
                        </div>
                        <div class="microchart-container">
                            <${Microchart} 
                                data=${events} 
                                selection=${selection}
                                onIndicatorChange=${handleMicrochartIndicatorChange}
                                scrollInfo=${scrollInfo}
                                onScroll=${handleExternalScroll} />
                            <div class="microchart-position-indicator" style=${{top: `${microchartIndicatorY}px`}}></div>
                        </div>
                    </div>
                    <${EventDisplay} 
                        data=${events}
                        selection=${selection}
                        onScrollInfoChange=${handleScrollInfoChange}
                        containerRef=${eventDisplayRef} />
                    </div>
            </div>
        </div>
    `;
};

export default App;