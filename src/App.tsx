import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Classifica from './pages/Classifica'
import Formazione from './pages/Formazione'
import Giocatori from './pages/Giocatori'
import Home from './pages/Home'
import Rosa from './pages/Rosa'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="giocatori" element={<Giocatori />} />
        <Route path="rosa" element={<Rosa />} />
        <Route path="formazione" element={<Formazione />} />
        <Route path="classifica" element={<Classifica />} />
      </Route>
    </Routes>
  )
}
