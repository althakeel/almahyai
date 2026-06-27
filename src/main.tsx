import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

const savedTheme = localStorage.getItem('orion-theme');
document.documentElement.setAttribute('data-theme', savedTheme === 'light' ? 'light' : 'dark');

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
