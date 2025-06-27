import App from './js/App.js';

const { render } = preact;
const html = htm.bind(preact.h);

render(html`<${App} />`, document.getElementById('app'));
