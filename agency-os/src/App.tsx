import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'

export default function App() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#161a23' }}>
      <Scene />
      <HUD />
    </div>
  )
}
