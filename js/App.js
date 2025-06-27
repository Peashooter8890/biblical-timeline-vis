import EraScrollbar from './EraScrollbar.js';
import Microchart from './Microchart.js';
import EventDisplay from './EventDisplay.js';

const { useState, useEffect, useCallback } = preactHooks;
const html = htm.bind(preact.h);

const App = () => {
    const [events, setEvents] = useState([]);
    const [selection, setSelection] = useState([-4004, 30]);
    const [indicatorY, setIndicatorY] = useState(0);
    const [microchartIndicatorY, setMicrochartIndicatorY] = useState(0);
    const [scrollInfo, setScrollInfo] = useState({ 
        topVisibleYear: -4004, 
        selectionRange: [-4004, 30] 
    });

    useEffect(() => {
        fetch('data/events.json')
            .then(res => res.json())
            .then(data => {
                const sortedData = data.sort((a, b) => a.fields.startDate - b.fields.startDate);
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

    return html`
        <div class="timeline-container">
            <div class="sidebar">
                <div class="era-scrollbar-container">
                   <${EraScrollbar}
                        onBrush=${handleBrush}
                        onIndicatorChange=${handleIndicatorChange}
                        scrollInfo=${scrollInfo} />
                   <div class="position-indicator" style=${{top: `${indicatorY}px`}}></div>
                </div>
                <div class="microchart-container">
                    <${Microchart} 
                        data=${events} 
                        selection=${selection}
                        onIndicatorChange=${handleMicrochartIndicatorChange}
                        scrollInfo=${scrollInfo} />
                    <div class="microchart-position-indicator" style=${{top: `${microchartIndicatorY}px`}}></div>
                </div>
            </div>
            <${EventDisplay} 
                 data=${events}
                 selection=${selection}
                 onScrollInfoChange=${handleScrollInfoChange} />
        </div>
    `;
};

export default App;