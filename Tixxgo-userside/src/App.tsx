import { BrowserRouter } from 'react-router-dom';
import { BookingFlowProvider } from './context/BookingFlowContext';
import { AppRoutes } from './routes';
import './App.css';

export default function App() { return <BrowserRouter><BookingFlowProvider><div className="app-shell"><header className="topbar"><span className="brand">Tixxgo<span>/</span></span><span className="topbar-note">Flight desk · India</span></header><AppRoutes /></div></BookingFlowProvider></BrowserRouter>; }
