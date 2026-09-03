import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { ArrowLeft, Check, ChevronDown, Clapperboard, Copy, Film, Heart, ListFilter, LogOut, MoreHorizontal, Play, RotateCcw, Search, Settings2, Sparkles, X } from 'lucide-react'
import { AuthGate } from './components/AuthGate'
import { MatchHistory } from './components/MatchHistory'
import { MatchingControl } from './components/MatchingControl'
import { MovieAvailability } from './components/MovieAvailability'
import { RoomLobby } from './components/RoomLobby'
import { signOutUser } from './services/auth'
import { castVote, endRoom, heartbeatRoom, leaveRoom, listenToMembers, listenToQueue, listenToRoom } from './services/rooms'
import type { QueueMovie } from './types/movie'
import type { Room, RoomMember } from './types/room'
import './App.css'

type DisplayMovie = { tmdbId: number; title: string; year: string; rating: string; runtime: string; genre: string; description: string; poster: string; trailerUrl?: string; providers: string[] }
const avatarColors = ['coral', 'blue', 'yellow', 'green']

function toDisplayMovie(movie: QueueMovie): DisplayMovie {
  return {
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.releaseYear?.toString() ?? 'New release',
    rating: movie.rating.toFixed(1),
    runtime: movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : 'Runtime unavailable',
    genre: movie.genres.join(' / ') || 'Selected for your room',
    description: movie.overview,
    poster: movie.posterPath ? `https://image.tmdb.org/t/p/w780${movie.posterPath}` : '',
    trailerUrl: movie.trailerKey ? `https://www.youtube.com/watch?v=${movie.trailerKey}` : undefined,
    providers: movie.providerNames,
  }
}

function Matcher({ user, signOut, roomId, roomCode, onLeaveRoom }: { user: User; signOut: () => Promise<void>; roomId: string; roomCode: string; onLeaveRoom: () => void }) {
  const [tab, setTab] = useState<'browse' | 'history'>('browse')
  const [movieIndex, setMovieIndex] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showMatch, setShowMatch] = useState(false)
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [queue, setQueue] = useState<QueueMovie[]>([])
  const [votePending, setVotePending] = useState(false)
  const [roomActionPending, setRoomActionPending] = useState(false)
  const [error, setError] = useState('')
  const movie = queue.length ? toDisplayMovie(queue[movieIndex % queue.length]) : null
  const isHost = room?.hostId === user.uid

  useEffect(() => {
    const stopRoom = listenToRoom(roomId, setRoom)
    const stopMembers = listenToMembers(roomId, setMembers)
    const stopQueue = listenToQueue(roomId, setQueue)
    return () => { stopRoom(); stopMembers(); stopQueue() }
  }, [roomId])

  useEffect(() => {
    const sendHeartbeat = () => { void heartbeatRoom(roomId).catch(() => undefined) }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') sendHeartbeat() }
    sendHeartbeat()
    const interval = window.setInterval(sendHeartbeat, 45_000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [roomId])

  useEffect(() => { if (room?.status === 'matched') setShowMatch(true) }, [room?.status])
  useEffect(() => { setMovieIndex(0) }, [queue])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!movie || votePending || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowLeft') void vote(false)
      if (event.key === 'ArrowRight') void vote(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function vote(liked: boolean) {
    if (!movie || votePending || room?.status !== 'matching') return
    setVotePending(true); setError('')
    try {
      const result = await castVote(roomId, movie.tmdbId, liked)
      if (result.matched) setShowMatch(true)
      else setMovieIndex((current) => (current + 1) % queue.length)
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : 'Unable to save your vote.')
    } finally { setVotePending(false) }
  }

  async function leaveCurrentRoom() {
    setRoomActionPending(true); setError('')
    try {
      if (isHost) await endRoom(roomId)
      else await leaveRoom(roomId)
      onLeaveRoom()
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : 'Unable to leave the room.')
    } finally { setRoomActionPending(false) }
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return <div className="app-shell"><header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Clapperboard size={17} /></span><span>night<span>watcher</span></span></a><nav className="main-nav" aria-label="Room navigation"><button className={tab === 'browse' ? 'nav-active' : ''} onClick={() => setTab('browse')}>Browse</button><button className={tab === 'history' ? 'nav-active' : ''} onClick={() => setTab('history')}>History</button></nav><div className="top-actions"><button className="icon-button" title="Search"><Search size={18} /></button><button className="profile" title={user.displayName ?? user.email ?? 'Your profile'} onClick={() => void signOut()}>{user.photoURL ? <img src={user.photoURL} alt="" /> : (user.displayName ?? user.email ?? 'U').slice(0, 2).toUpperCase()}</button><button className="sign-out" title="Sign out" onClick={() => void signOut()}><LogOut size={16} /></button></div></header><main id="top"><div className="eyebrow"><span className="live-dot" /> {room?.status === 'ended' ? 'ROOM ENDED' : 'LIVE ROOM'} <span className="eyebrow-line" /> <span className="eyebrow-muted">{room?.country ?? 'IN'} STREAMING REGION</span></div><section className="room-heading"><div><p className="kicker">PRIVATE ROOM <span>·</span> {members.length} WATCHERS</p><h1>Pick something<br /><em>you'll all love.</em></h1></div><div className="room-actions"><div className="room-code"><small>ROOM CODE</small><strong>{roomCode}</strong><button onClick={copyCode} title="Copy room code">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><MatchingControl roomId={roomId} isHost={isHost} status={room?.status} /><button className="leave-room" onClick={leaveCurrentRoom} disabled={roomActionPending}>{roomActionPending ? 'Working...' : isHost ? 'End room' : 'Leave room'}</button></div></section>{tab === 'history' ? <MatchHistory roomId={roomId} /> : <><div className="workspace-tabs"><button className="selected">Tonight's picks <span>{queue.length}</span></button><button className="filter-button" onClick={() => setShowFilters(!showFilters)}><ListFilter size={16} /> Filters <ChevronDown size={15} /></button></div>{showFilters && <div className="filter-bar"><span>ROOM SETTINGS</span><button className="chip active">{room?.preferences.maxRuntime ? `Up to ${room.preferences.maxRuntime} min` : 'Any runtime'}</button><button className="chip">{room?.preferences.genres.length ? room.preferences.genres.join(', ') : 'All genres'}</button></div>}<section className="matcher-layout"><div className="card-stage">{room?.status === 'lobby' ? <div className="queue-state">The host can start matching when everyone is ready.</div> : !movie ? <div className="queue-state">Finding films for tonight...</div> : <><article className="movie-card"><div className="movie-image" style={{ '--poster': `url(${movie.poster})` } as React.CSSProperties}><div className="image-top"><span className="match-label"><Sparkles size={13} /> Room queue</span><button className="card-more" title="Movie details"><MoreHorizontal size={19} /></button></div><div className="image-bottom">{movie.trailerUrl && <a className="play-trailer" href={movie.trailerUrl} target="_blank" rel="noreferrer"><Play size={12} fill="currentColor" /> Trailer</a>}</div></div><div className="movie-info"><div className="movie-title"><div><h2>{movie.title}</h2><p>{movie.year} <span>•</span> {movie.runtime} <span>•</span> {movie.genre}</p></div><strong className="rating"><span>★</span> {movie.rating}</strong></div><p className="description">{movie.description}</p><MovieAvailability trailerUrl={movie.trailerUrl} providers={movie.providers} /></div></article><div className="vote-controls"><button className="pass" disabled={votePending} onClick={() => void vote(false)} title="Pass (left arrow)"><X size={27} /></button><button className="undo" disabled={votePending} onClick={() => setMovieIndex((current) => (current + queue.length - 1) % queue.length)} title="Previous movie"><RotateCcw size={16} /></button><button className="like" disabled={votePending} onClick={() => void vote(true)} title="Like (right arrow)"><Heart size={28} fill="currentColor" /></button></div><div className="swipe-hint"><ArrowLeft size={14} /> {votePending ? 'Saving your vote...' : 'use left/right arrows or buttons'} <span /> <Heart size={13} fill="currentColor" /> to vote</div></>}</div><aside className="room-sidebar"><div className="side-section"><div className="section-label"><span>IN THE ROOM</span><span className="online-count"><i /> {members.filter((member) => member.isOnline).length} online</span></div><div className="member-list">{members.map((member, index) => <div className="member" key={member.id}><span className={`avatar ${avatarColors[index % avatarColors.length]}`}>{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}{member.id === user.uid ? ' (You)' : ''}</strong><small>{member.role === 'host' ? 'Host' : member.isOnline ? 'Ready' : 'Away'}</small></div>{member.isOnline && <span className="ready-dot"><Check size={11} /></span>}</div>)}</div></div><div className="side-section preferences"><div className="section-label"><span>ROOM VIBE</span><Settings2 size={16} /></div><div className="vibe-pill"><span>🍿</span><div><strong>{room?.preferences.genres.length ? room.preferences.genres.join(', ') : 'Open to anything'}</strong><small>{room?.preferences.maxRuntime ? `Up to ${room.preferences.maxRuntime} minutes` : 'Any runtime'}</small></div></div></div>{error && <p className="room-error" role="alert">{error}</p>}</aside></section></>}</main><footer><span><Film size={14} /> Made for choosing together</span><span>Synced just now <i className="sync-dot" /></span></footer>{showMatch && movie && <div className="modal-backdrop" onClick={() => setShowMatch(false)}><div className="match-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowMatch(false)}><X size={17} /></button><div className="match-spark"><Sparkles size={22} /></div><p className="kicker">EVERYONE SAID YES</p><h2>It's a match.</h2><img src={movie.poster} alt={`${movie.title} poster`} /><p>{movie.title} is waiting for you tonight.</p><MovieAvailability trailerUrl={movie.trailerUrl} providers={movie.providers} /><button className="primary-button" onClick={() => setShowMatch(false)}><Play size={15} fill="currentColor" /> Keep exploring</button></div></div>}</div>
}

function App() {
  const [room, setRoom] = useState<{ roomId: string; code: string } | null>(null)
  return <AuthGate signOut={signOutUser}>{(user, signOut) => room ? <Matcher user={user} signOut={signOut} roomId={room.roomId} roomCode={room.code} onLeaveRoom={() => setRoom(null)} /> : <RoomLobby onEnterRoom={setRoom} />}</AuthGate>
}

export default App
