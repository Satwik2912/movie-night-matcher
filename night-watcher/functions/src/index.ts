import {randomInt} from "node:crypto";
import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {setGlobalOptions} from "firebase-functions";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

setGlobalOptions({maxInstances: 10, region: "asia-south1"});
const firebaseApp = initializeApp();

const db = getFirestore(firebaseApp, "night-watcher");
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codeLength = 6;
const maxCodeAttempts = 10;
const countryCodePattern = /^[A-Z]{2}$/;
const tmdbApiKey = defineSecret("TMDB_API_KEY");
const tmdbGenreIds: Record<string, number> = {
  "Action": 28,
  "Comedy": 35,
  "Drama": 18,
  "Horror": 27,
  "Romance": 10749,
  "Sci-Fi": 878,
};

type RoomPreferences = {
  genres: string[];
  maxRuntime: number | null;
  releaseYearFrom: number | null;
  releaseYearTo: number | null;
  includeAdult: boolean;
};

type CallableAuth = {
  uid: string;
  token: {name?: unknown; email?: unknown; picture?: unknown};
};

function requireUser(auth: unknown): CallableAuth {
  if (!auth || typeof auth !== "object" || !("uid" in auth) || typeof auth.uid !== "string" || !("token" in auth)) {
    throw new HttpsError("unauthenticated", "You must be signed in to use rooms.");
  }
  return auth as CallableAuth;
}

function createCode() {
  return Array.from({length: codeLength}, () =>
    codeAlphabet[randomInt(codeAlphabet.length)],
  ).join("");
}

function cleanPreferences(value: unknown): RoomPreferences {
  const source = (value ?? {}) as Partial<RoomPreferences>;
  const genres = Array.isArray(source.genres) ?
    source.genres.filter((genre): genre is string => typeof genre === "string").slice(0, 8) : [];
  const maxRuntime = typeof source.maxRuntime === "number" && source.maxRuntime >= 45 && source.maxRuntime <= 360 ? source.maxRuntime : null;
  const releaseYearFrom = typeof source.releaseYearFrom === "number" && source.releaseYearFrom >= 1888 && source.releaseYearFrom <= 2100 ? source.releaseYearFrom : null;
  const releaseYearTo = typeof source.releaseYearTo === "number" && source.releaseYearTo >= 1888 && source.releaseYearTo <= 2100 ? source.releaseYearTo : null;
  if (releaseYearFrom && releaseYearTo && releaseYearFrom > releaseYearTo) {
    throw new HttpsError("invalid-argument", "The start year must be before the end year.");
  }
  return {genres, maxRuntime, releaseYearFrom, releaseYearTo, includeAdult: source.includeAdult === true};
}

function memberData(auth: CallableAuth) {
  return {
    name: typeof auth.token.name === "string" ? auth.token.name : "Night Watcher",
    email: typeof auth.token.email === "string" ? auth.token.email : null,
    photoURL: typeof auth.token.picture === "string" ? auth.token.picture : null,
    lastSeenAt: FieldValue.serverTimestamp(),
    isOnline: true,
  };
}

type TmdbMovie = {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  genre_ids?: number[];
};

type TmdbDetails = TmdbMovie & {
  runtime: number | null;
  genres: Array<{id: number; name: string}>;
  videos?: {results: Array<{key: string; site: string; type: string}>};
  "watch/providers"?: {results?: Record<string, {flatrate?: Array<{provider_name: string}>}>};
};

function tmdbRequest(path: string, parameters: URLSearchParams) {
  const credential = tmdbApiKey.value().trim();
  const headers: Record<string, string> = {};
  if (credential.length > 50) headers.Authorization = `Bearer ${credential}`;
  else parameters.set("api_key", credential);
  return fetch(`https://api.themoviedb.org/3${path}?${parameters}`, {headers});
}

function handleTmdbFailure(response: Response) {
  if (response.status === 401) {
    throw new HttpsError("failed-precondition", "TMDB rejected the configured API credential. Replace the TMDB_API_KEY Firebase secret with a valid TMDB v3 API Key or v4 API Read Access Token.");
  }
  throw new HttpsError("internal", "TMDB could not provide films right now.");
}

async function fetchTmdbDetails(movieId: number, country: string) {
  const parameters = new URLSearchParams();
  parameters.set("language", "en-US");
  parameters.set("append_to_response", "videos,watch/providers");
  const response = await tmdbRequest(`/movie/${movieId}`, parameters);
  if (!response.ok) handleTmdbFailure(response);
  const details = await response.json() as TmdbDetails;
  const providers = details["watch/providers"]?.results?.[country]?.flatrate ?? [];
  const trailer = details.videos?.results.find((video) => video.site === "YouTube" && video.type === "Trailer");
  return {...details, providerNames: providers.map((provider) => provider.provider_name), trailerKey: trailer?.key ?? null};
}

async function fetchTmdbQueue(preferences: RoomPreferences, country: string) {
  const parameters = new URLSearchParams();
  parameters.set("language", "en-US");
  parameters.set("include_adult", String(preferences.includeAdult));
  parameters.set("include_video", "false");
  parameters.set("sort_by", "popularity.desc");
  parameters.set("vote_count.gte", "50");
  parameters.set("page", "1");
  const genreIds = preferences.genres
    .map((genre) => tmdbGenreIds[genre])
    .filter((genreId): genreId is number => typeof genreId === "number");
  if (genreIds.length) parameters.set("with_genres", genreIds.join("|"));
  if (preferences.releaseYearFrom) parameters.set("primary_release_date.gte", `${preferences.releaseYearFrom}-01-01`);
  if (preferences.releaseYearTo) parameters.set("primary_release_date.lte", `${preferences.releaseYearTo}-12-31`);
  const response = await tmdbRequest("/discover/movie", parameters);
  if (!response.ok) handleTmdbFailure(response);
  const body = await response.json() as {results: TmdbMovie[]};
  const candidates = body.results.filter((movie) => movie.poster_path && movie.overview).slice(0, 20);
  const detailedMovies = await Promise.all(candidates.map((movie) => fetchTmdbDetails(movie.id, country)));
  return detailedMovies.filter((movie) => !preferences.maxRuntime || !movie.runtime || movie.runtime <= preferences.maxRuntime).slice(0, 15);
}

export const createRoom = onCall(async (request) => {
  const auth = requireUser(request.auth);
  const country = typeof request.data?.country === "string" ? request.data.country.trim().toUpperCase() : "";
  if (!countryCodePattern.test(country)) {
    throw new HttpsError("invalid-argument", "Choose a valid two-letter country code.");
  }
  const preferences = cleanPreferences(request.data?.preferences);
  const uid = auth.uid;

  for (let attempt = 0; attempt < maxCodeAttempts; attempt += 1) {
    const code = createCode();
    const codeRef = db.collection("roomCodes").doc(code);
    const roomRef = db.collection("rooms").doc();
    const created = await db.runTransaction(async (transaction) => {
      const existingCode = await transaction.get(codeRef);
      if (existingCode.exists) return false;
      transaction.create(codeRef, {roomId: roomRef.id, createdAt: FieldValue.serverTimestamp()});
      transaction.create(roomRef, {code, hostId: uid, status: "lobby", country, preferences, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), endedAt: null});
      transaction.create(roomRef.collection("members").doc(uid), {...memberData(auth), role: "host", joinedAt: FieldValue.serverTimestamp()});
      return true;
    });
    if (created) return {roomId: roomRef.id, code};
  }
  throw new HttpsError("aborted", "Could not reserve a room code. Please try again.");
});

export const joinRoom = onCall(async (request) => {
  const auth = requireUser(request.auth);
  const code = typeof request.data?.code === "string" ? request.data.code.trim().toUpperCase() : "";
  if (!new RegExp(`^[${codeAlphabet}]{${codeLength}}$`).test(code)) {
    throw new HttpsError("invalid-argument", "Enter a valid six-character room code.");
  }
  const uid = auth.uid;
  const codeRef = db.collection("roomCodes").doc(code);
  return db.runTransaction(async (transaction) => {
    const codeSnapshot = await transaction.get(codeRef);
    if (!codeSnapshot.exists) throw new HttpsError("not-found", "This room code was not found.");
    const roomRef = db.collection("rooms").doc(codeSnapshot.data()!.roomId as string);
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists || roomSnapshot.data()!.status === "ended") {
      throw new HttpsError("failed-precondition", "This room is no longer available.");
    }
    const memberRef = roomRef.collection("members").doc(uid);
    transaction.set(memberRef, {...memberData(auth), role: roomSnapshot.data()!.hostId === uid ? "host" : "member", joinedAt: FieldValue.serverTimestamp()}, {merge: true});
    transaction.update(roomRef, {updatedAt: FieldValue.serverTimestamp()});
    return {roomId: roomRef.id, code};
  });
});

export const leaveRoom = onCall(async (request) => {
  const auth = requireUser(request.auth);
  const roomId = typeof request.data?.roomId === "string" ? request.data.roomId : "";
  if (!roomId) throw new HttpsError("invalid-argument", "A room is required.");
  const roomRef = db.collection("rooms").doc(roomId);
  const memberRef = roomRef.collection("members").doc(auth.uid);
  await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    const memberSnapshot = await transaction.get(memberRef);
    if (!roomSnapshot.exists || !memberSnapshot.exists) throw new HttpsError("not-found", "You are not a member of this room.");
    if (roomSnapshot.data()!.hostId === auth.uid) throw new HttpsError("failed-precondition", "Hosts must end the room or transfer host duties before leaving.");
    transaction.delete(memberRef);
    transaction.update(roomRef, {updatedAt: FieldValue.serverTimestamp()});
  });
  return {success: true};
});

export const endRoom = onCall(async (request) => {
  const auth = requireUser(request.auth);
  const roomId = typeof request.data?.roomId === "string" ? request.data.roomId : "";
  if (!roomId) throw new HttpsError("invalid-argument", "A room is required.");
  const roomRef = db.collection("rooms").doc(roomId);
  await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) throw new HttpsError("not-found", "This room was not found.");
    if (roomSnapshot.data()!.hostId !== auth.uid) throw new HttpsError("permission-denied", "Only the host can end this room.");
    transaction.update(roomRef, {status: "ended", endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  });
  return {success: true};
});

export const heartbeatRoom = onCall(async (request) => {
  const auth = requireUser(request.auth);
  const roomId = typeof request.data?.roomId === "string" ? request.data.roomId : "";
  if (!roomId) throw new HttpsError("invalid-argument", "A room is required.");
  const memberRef = db.collection("rooms").doc(roomId).collection("members").doc(auth.uid);
  const memberSnapshot = await memberRef.get();
  if (!memberSnapshot.exists) throw new HttpsError("permission-denied", "You are not a member of this room.");
  await memberRef.update({lastSeenAt: FieldValue.serverTimestamp(), isOnline: true});
  return {success: true};
});

export const startMatching = onCall({secrets: [tmdbApiKey]}, async (request) => {
  const auth = requireUser(request.auth);
  const roomId = typeof request.data?.roomId === "string" ? request.data.roomId : "";
  if (!roomId) throw new HttpsError("invalid-argument", "A room is required.");
  const roomRef = db.collection("rooms").doc(roomId);
  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists) throw new HttpsError("not-found", "This room was not found.");
  const room = roomSnapshot.data()!;
  if (room.hostId !== auth.uid) throw new HttpsError("permission-denied", "Only the host can start matching.");
  if (room.status !== "lobby") throw new HttpsError("failed-precondition", "Matching has already started for this room.");
  const queue = await fetchTmdbQueue(cleanPreferences(room.preferences), room.country);
  if (!queue.length) throw new HttpsError("not-found", "No films match these room settings.");
  const batch = db.batch();
  queue.forEach((movie, order) => {
    batch.set(roomRef.collection("queue").doc(String(movie.id)), {
      tmdbId: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path,
      releaseYear: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
      rating: movie.vote_average,
      runtime: movie.runtime,
      genres: movie.genres.map((genre) => genre.name),
      genreIds: movie.genre_ids ?? [],
      trailerKey: movie.trailerKey,
      providerNames: movie.providerNames,
      order,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  batch.update(roomRef, {status: "matching", queueSize: queue.length, updatedAt: FieldValue.serverTimestamp()});
  await batch.commit();
  return {queueSize: queue.length};
});

export const castVote = onCall(async (request) => {
  const auth = requireUser(request.auth);
  const roomId = typeof request.data?.roomId === "string" ? request.data.roomId : "";
  const movieId = typeof request.data?.movieId === "number" ? request.data.movieId : 0;
  const liked = typeof request.data?.liked === "boolean" ? request.data.liked : null;
  if (!roomId || !movieId || liked === null) throw new HttpsError("invalid-argument", "A room, movie, and vote are required.");
  const roomRef = db.collection("rooms").doc(roomId);
  const memberRef = roomRef.collection("members").doc(auth.uid);
  const voteRef = roomRef.collection("votes").doc(`${movieId}_${auth.uid}`);
  const queueRef = roomRef.collection("queue").doc(String(movieId));
  const matchRef = roomRef.collection("matches").doc(String(movieId));
  return db.runTransaction(async (transaction) => {
    const [roomSnapshot, memberSnapshot, queueSnapshot, members, likes, matchSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(memberRef),
      transaction.get(queueRef),
      transaction.get(roomRef.collection("members")),
      liked ? transaction.get(roomRef.collection("votes").where("movieId", "==", movieId).where("liked", "==", true)) : Promise.resolve(null),
      transaction.get(matchRef),
    ]);
    if (!roomSnapshot.exists || roomSnapshot.data()!.status !== "matching") throw new HttpsError("failed-precondition", "This room is not accepting votes.");
    if (!memberSnapshot.exists) throw new HttpsError("permission-denied", "You are not a member of this room.");
    if (!queueSnapshot.exists) throw new HttpsError("not-found", "This film is not in the room queue.");
    transaction.set(voteRef, {movieId, userId: auth.uid, liked, votedAt: FieldValue.serverTimestamp()});
    if (!liked) return {matched: false};
    const voterIds = new Set(likes!.docs.map((vote) => vote.data().userId as string));
    voterIds.add(auth.uid);
    if (voterIds.size !== members.size) return {matched: false};
    if (!matchSnapshot.exists) {
      transaction.create(matchRef, {movieId, movie: queueSnapshot.data(), members: [...voterIds], matchedAt: FieldValue.serverTimestamp()});
      transaction.update(roomRef, {status: "matched", matchedMovieId: movieId, updatedAt: FieldValue.serverTimestamp()});
    }
    return {matched: true};
  });
});

export const continueMatching = onCall({secrets: [tmdbApiKey]}, async (request) => {
  const auth = requireUser(request.auth);
  const roomId = typeof request.data?.roomId === "string" ? request.data.roomId : "";
  if (!roomId) throw new HttpsError("invalid-argument", "A room is required.");
  const roomRef = db.collection("rooms").doc(roomId);
  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists) throw new HttpsError("not-found", "This room was not found.");
  const room = roomSnapshot.data()!;
  if (room.hostId !== auth.uid) throw new HttpsError("permission-denied", "Only the host can start another round.");
  if (room.status !== "matched") throw new HttpsError("failed-precondition", "Finish the current round before starting another.");
  const queue = await fetchTmdbQueue(cleanPreferences(room.preferences), room.country);
  if (!queue.length) throw new HttpsError("not-found", "No films match these room settings.");
  const [oldQueue, oldVotes] = await Promise.all([roomRef.collection("queue").get(), roomRef.collection("votes").get()]);
  const batch = db.batch();
  oldQueue.docs.forEach((movie) => batch.delete(movie.ref));
  oldVotes.docs.forEach((vote) => batch.delete(vote.ref));
  queue.forEach((movie, order) => {
    batch.set(roomRef.collection("queue").doc(String(movie.id)), {
      tmdbId: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.poster_path,
      releaseYear: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
      rating: movie.vote_average,
      runtime: movie.runtime,
      genres: movie.genres.map((genre) => genre.name),
      genreIds: movie.genre_ids ?? [],
      trailerKey: movie.trailerKey,
      providerNames: movie.providerNames,
      order,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  batch.update(roomRef, {status: "matching", matchedMovieId: null, queueSize: queue.length, round: (room.round ?? 1) + 1, updatedAt: FieldValue.serverTimestamp()});
  await batch.commit();
  return {queueSize: queue.length};
});
