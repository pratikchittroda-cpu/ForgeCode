import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Get the root element from the DOM
const container = document.getElementById('root');

if (container) {
  // Create the root and render the App component
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("Could not find the element with id 'root'. Please ensure your index.html has <div id=\"root\"></div>.");
}

// Exporting for potential testing or module usage (though usually unnecessary for a main entry point)
export default App;
