import { useState, type FormEvent } from 'react'
import { DoorOpen, Plus, Users } from 'lucide-react'
import { createRoom, defaultRoomPreferences, joinRoom } from '../services/rooms'
import type { RoomPreferences } from '../types/room'
import './RoomLobby.css'

type RoomLobbyProps = { onEnterRoom: (room: { roomId: string; code: string }) => void }

const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Sci-Fi']

function messageFor(error: unknown) {
  if (!(error instanceof Error)) return 'Unable to reach the room service. Please try again.'
  const code = error.message.match(/functions\/[\w-]+/)?.[0]
  return ({ 'functions/not-found': 'That room code was not found.', 'functions/failed-precondition': 'This room is no longer available.', 'functions/unauthenticated': 'Please sign in again before joining a room.' } as Record<string, string>)[code ?? ''] ?? error.message
}

export function RoomLobby({ onEnterRoom }: RoomLobbyProps) {
  const [country, setCountry] = useState('IN')
  const [roomCode, setRoomCode] = useState('')
  const [preferences, setPreferences] = useState<RoomPreferences>(defaultRoomPreferences)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  const toggleGenre = (genre: string) => setPreferences((current) => ({ ...current, genres: current.genres.includes(genre) ? current.genres.filter((item) => item !== genre) : [...current.genres, genre] }))
  const updateNumber = (field: 'maxRuntime' | 'releaseYearFrom' | 'releaseYearTo', value: string) => setPreferences((current) => ({ ...current, [field]: value ? Number(value) : null }))

  async function handleCreate() {
    setCreating(true); setError('')
    try { onEnterRoom(await createRoom(country, preferences)) } catch (roomError) { setError(messageFor(roomError)) } finally { setCreating(false) }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setJoining(true); setError('')
    try { onEnterRoom(await joinRoom(roomCode)) } catch (roomError) { setError(messageFor(roomError)) } finally { setJoining(false) }
  }

  return <main className="lobby-page"><section className="lobby-panel"><p className="kicker">THE LIVING ROOM</p><h1>Choose your<br /><em>next watch.</em></h1><p className="lobby-copy">Start a private room for your group, or join the movie night already in progress.</p><div className="lobby-actions"><div className="lobby-action"><span className="lobby-icon"><Plus size={20} /></span><div><strong>Start a room</strong><p>Set the vibe and invite friends.</p></div><label className="country-label">STREAMING COUNTRY<select value={country} onChange={(event) => setCountry(event.target.value)}><option value="IN">India</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="CA">Canada</option></select></label><div className="genre-picker"><span>MOVIE MOOD</span><div>{genres.map((genre) => <button type="button" className={preferences.genres.includes(genre) ? 'genre-selected' : ''} key={genre} onClick={() => toggleGenre(genre)}>{genre}</button>)}</div></div><div className="preference-grid"><label>MAX MINUTES<select value={preferences.maxRuntime ?? ''} onChange={(event) => updateNumber('maxRuntime', event.target.value)}><option value="">Any</option><option value="90">90</option><option value="120">120</option><option value="150">150</option><option value="180">180</option></select></label><label>FROM YEAR<input type="number" min="1888" max="2100" value={preferences.releaseYearFrom ?? ''} onChange={(event) => updateNumber('releaseYearFrom', event.target.value)} /></label></div><label className="adult-toggle"><input type="checkbox" checked={preferences.includeAdult} onChange={(event) => setPreferences((current) => ({ ...current, includeAdult: event.target.checked }))} /> Include adult titles</label><button className="auth-submit" onClick={handleCreate} disabled={creating}><Users size={16} />{creating ? 'Creating...' : 'Create room'}</button></div><div className="lobby-action"><span className="lobby-icon pale"><DoorOpen size={20} /></span><div><strong>Join a room</strong><p>Enter the six-character invite code.</p></div><form onSubmit={handleJoin}><input className="room-input" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))} placeholder="N8K4Q" aria-label="Room code" required pattern="[A-Z2-9]{6}" /><button className="join-button" disabled={joining} type="submit">{joining ? 'Joining...' : 'Join'}</button></form></div></div>{error && <p className="auth-error" role="alert">{error}</p>}</section></main>
}
