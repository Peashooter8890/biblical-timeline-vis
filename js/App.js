import EraScrollbar from './EraScrollbar.js';
import Microchart from './Microchart.js';
import EventDisplay from './EventDisplay.js';

const { useState, useEffect, useCallback } = preactHooks;
const html = htm.bind(preact.h);

const App = () => {
    const [events, setEvents] = useState([]);
    const [selection, setSelection] = useState([-4004, 30]);
    const [indicatorY, setIndicatorY] = useState(0);
    const [topVisibleYear, setTopVisibleYear] = useState(null);

    useEffect(() => {
        fetch('data/events.json')
            .then(res => res.json())
            .then(data => {
                const sortedData = data.sort((a, b) => a.fields.startDate - b.fields.startDate);
                setEvents(sortedData);
            })
            .catch(err => console.error("Failed to load event data:", err));
    }, []);

    const handleBrush = useCallback((domain) => setSelection(domain), []);
    const handleIndicatorChange = useCallback((yPosition) => setIndicatorY(yPosition), []);
    const handleTopEventChange = useCallback((year) => setTopVisibleYear(year), []);

    return html`
        <div class="timeline-container">
            <div class="sidebar">
                <div class="era-scrollbar-container">
                   <${EraScrollbar} 
                       onBrush=${handleBrush} 
                       onIndicatorChange=${handleIndicatorChange}
                       topVisibleYear=${topVisibleYear} />
                   <div class="position-indicator" style=${{top: `${indicatorY}px`}}></div>
                </div>
                <div class="microchart-container">
                    <${Microchart} data=${events} selection=${selection} />
                </div>
            </div>
            <${EventDisplay} 
                data=${events} 
                selection=${selection} 
                onTopEventChange=${handleTopEventChange} />
        </div>
    `;
};

export default App;
