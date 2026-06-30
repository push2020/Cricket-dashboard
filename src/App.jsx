import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import CreateTournament from './pages/CreateTournament';
import TournamentDetail from './pages/TournamentDetail';
import MatchEntry from './pages/MatchEntry';
import FinalMatch from './pages/FinalMatch';
import Celebration from './pages/Celebration';
import HallOfFame from './pages/HallOfFame';

/** Root application component — sets up routing and persistent nav */
export default function App() {
  return (
    <div className="app">
      <ScrollToTop />
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateTournament />} />
          <Route path="/tournament/:id" element={<TournamentDetail />} />
          <Route path="/match/:id" element={<MatchEntry />} />
          <Route path="/final/:id" element={<FinalMatch />} />
          <Route path="/celebration/:tournamentId" element={<Celebration />} />
          <Route path="/hall-of-fame" element={<HallOfFame />} />
        </Routes>
      </main>
    </div>
  );
}
