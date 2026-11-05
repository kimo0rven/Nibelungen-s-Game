import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { AuthProvider } from './context/AuthContext'
import Home from './pages/Home'
import Play from './pages/Play'
import Watch from './pages/Watch'
import Login from './pages/admin/Login'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import QuizList from './pages/admin/QuizList'
import QuizEditor from './pages/admin/QuizEditor'
import CardLibrary from './pages/admin/CardLibrary'
import HostGame from './pages/admin/HostGame'
import ErrorBoundary from './components/ErrorBoundary'
import Embers from './components/Embers'

// Embers drift behind the player-facing and host-game screens only.
function Ambient() {
  const { pathname } = useLocation()
  const game = !pathname.startsWith('/admin') || pathname.endsWith('/host')
  return game ? <Embers /> : null
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Ambient />
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/:code" element={<Play />} />
          <Route path="/watch/:code" element={<Watch />} />
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="quizzes" element={<QuizList />} />
            <Route path="quizzes/new" element={<QuizEditor />} />
            <Route path="quizzes/:id/edit" element={<QuizEditor />} />
            <Route path="cards" element={<CardLibrary />} />
            <Route path="quizzes/:id/host" element={<HostGame />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  )
}
