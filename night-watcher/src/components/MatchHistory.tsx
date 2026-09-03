import { useEffect, useState } from 'react'
import { Clock3, Ticket } from 'lucide-react'
import { listenToMatches } from '../services/rooms'
import type { QueueMovie } from '../types/movie'
import './RoomPresentation.css'

type MatchHistoryProps = { roomId: string }

export function MatchHistory({ roomId }: MatchHistoryProps) {
  const [matches, setMatches] = useState<QueueMovie[]>([])

  useEffect(() => listenToMatches(roomId, setMatches), [roomId])

  return <section className="history-view"><div className="history-heading"><div><p className="kicker">YOUR ROOM'S PICKS</p><h2>Match history</h2></div><span><Ticket size={16} /> {matches.length} shared {matches.length === 1 ? 'pick' : 'picks'}</span></div>{matches.length ? <div className="history-grid">{matches.map((movie) => <article className="history-card" key={movie.id}><img src={movie.posterPath ? `https://image.tmdb.org/t/p/w342${movie.posterPath}` : ''} alt={`${movie.title} poster`} /><div><strong>{movie.title}</strong><small>{movie.releaseYear ?? 'New release'} <span>•</span> ★ {movie.rating.toFixed(1)}</small><p>{movie.genres.join(' / ')}</p></div></article>)}</div> : <div className="history-empty"><Clock3 size={22} /><p>Your shared picks will appear here after everyone likes the same film.</p></div>}</section>
}
