"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.continueMatching = exports.castVote = exports.startMatching = exports.heartbeatRoom = exports.endRoom = exports.leaveRoom = exports.joinRoom = exports.createRoom = void 0;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const params_1 = require("firebase-functions/params");
const https_1 = require("firebase-functions/v2/https");
(0, firebase_functions_1.setGlobalOptions)({ maxInstances: 10, region: "asia-south1" });
const firebaseApp = (0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)(firebaseApp, "night-watcher");
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codeLength = 6;
const maxCodeAttempts = 10;
const countryCodePattern = /^[A-Z]{2}$/;
const tmdbApiKey = (0, params_1.defineSecret)("TMDB_API_KEY");
const tmdbGenreIds = {
    "Action": 28,
    "Comedy": 35,
    "Drama": 18,
    "Horror": 27,
    "Romance": 10749,
    "Sci-Fi": 878,
};
function requireUser(auth) {
    if (!auth || typeof auth !== "object" || !("uid" in auth) || typeof auth.uid !== "string" || !("token" in auth)) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to use rooms.");
    }
    return auth;
}
function createCode() {
    return Array.from({ length: codeLength }, () => codeAlphabet[(0, node_crypto_1.randomInt)(codeAlphabet.length)]).join("");
}
function cleanPreferences(value) {
    const source = (value !== null && value !== void 0 ? value : {});
    const genres = Array.isArray(source.genres) ?
        source.genres.filter((genre) => typeof genre === "string").slice(0, 8) : [];
    const maxRuntime = typeof source.maxRuntime === "number" && source.maxRuntime >= 45 && source.maxRuntime <= 360 ? source.maxRuntime : null;
    const releaseYearFrom = typeof source.releaseYearFrom === "number" && source.releaseYearFrom >= 1888 && source.releaseYearFrom <= 2100 ? source.releaseYearFrom : null;
    const releaseYearTo = typeof source.releaseYearTo === "number" && source.releaseYearTo >= 1888 && source.releaseYearTo <= 2100 ? source.releaseYearTo : null;
    if (releaseYearFrom && releaseYearTo && releaseYearFrom > releaseYearTo) {
        throw new https_1.HttpsError("invalid-argument", "The start year must be before the end year.");
    }
    return { genres, maxRuntime, releaseYearFrom, releaseYearTo, includeAdult: source.includeAdult === true };
}
function memberData(auth) {
    return {
        name: typeof auth.token.name === "string" ? auth.token.name : "Night Watcher",
        email: typeof auth.token.email === "string" ? auth.token.email : null,
        photoURL: typeof auth.token.picture === "string" ? auth.token.picture : null,
        lastSeenAt: firestore_1.FieldValue.serverTimestamp(),
        isOnline: true,
    };
}
function tmdbRequest(path, parameters) {
    const credential = tmdbApiKey.value().trim();
    const headers = {};
    if (credential.length > 50)
        headers.Authorization = `Bearer ${credential}`;
    else
        parameters.set("api_key", credential);
    return fetch(`https://api.themoviedb.org/3${path}?${parameters}`, { headers });
}
function handleTmdbFailure(response) {
    if (response.status === 401) {
        throw new https_1.HttpsError("failed-precondition", "TMDB rejected the configured API credential. Replace the TMDB_API_KEY Firebase secret with a valid TMDB v3 API Key or v4 API Read Access Token.");
    }
    throw new https_1.HttpsError("internal", "TMDB could not provide films right now.");
}
async function fetchTmdbDetails(movieId, country) {
    var _a, _b, _c, _d, _e, _f;
    const parameters = new URLSearchParams();
    parameters.set("language", "en-US");
    parameters.set("append_to_response", "videos,watch/providers");
    const response = await tmdbRequest(`/movie/${movieId}`, parameters);
    if (!response.ok)
        handleTmdbFailure(response);
    const details = await response.json();
    const providers = (_d = (_c = (_b = (_a = details["watch/providers"]) === null || _a === void 0 ? void 0 : _a.results) === null || _b === void 0 ? void 0 : _b[country]) === null || _c === void 0 ? void 0 : _c.flatrate) !== null && _d !== void 0 ? _d : [];
    const trailer = (_e = details.videos) === null || _e === void 0 ? void 0 : _e.results.find((video) => video.site === "YouTube" && video.type === "Trailer");
    return Object.assign(Object.assign({}, details), { providerNames: providers.map((provider) => provider.provider_name), trailerKey: (_f = trailer === null || trailer === void 0 ? void 0 : trailer.key) !== null && _f !== void 0 ? _f : null });
}
async function fetchTmdbQueue(preferences, country) {
    const parameters = new URLSearchParams();
    parameters.set("language", "en-US");
    parameters.set("include_adult", String(preferences.includeAdult));
    parameters.set("include_video", "false");
    parameters.set("sort_by", "popularity.desc");
    parameters.set("vote_count.gte", "50");
    parameters.set("page", "1");
    const genreIds = preferences.genres
        .map((genre) => tmdbGenreIds[genre])
        .filter((genreId) => typeof genreId === "number");
    if (genreIds.length)
        parameters.set("with_genres", genreIds.join("|"));
    if (preferences.releaseYearFrom)
        parameters.set("primary_release_date.gte", `${preferences.releaseYearFrom}-01-01`);
    if (preferences.releaseYearTo)
        parameters.set("primary_release_date.lte", `${preferences.releaseYearTo}-12-31`);
    const response = await tmdbRequest("/discover/movie", parameters);
    if (!response.ok)
        handleTmdbFailure(response);
    const body = await response.json();
    const candidates = body.results.filter((movie) => movie.poster_path && movie.overview).slice(0, 20);
    const detailedMovies = await Promise.all(candidates.map((movie) => fetchTmdbDetails(movie.id, country)));
    return detailedMovies.filter((movie) => !preferences.maxRuntime || !movie.runtime || movie.runtime <= preferences.maxRuntime).slice(0, 15);
}
exports.createRoom = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    const auth = requireUser(request.auth);
    const country = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.country) === "string" ? request.data.country.trim().toUpperCase() : "";
    if (!countryCodePattern.test(country)) {
        throw new https_1.HttpsError("invalid-argument", "Choose a valid two-letter country code.");
    }
    const preferences = cleanPreferences((_b = request.data) === null || _b === void 0 ? void 0 : _b.preferences);
    const uid = auth.uid;
    for (let attempt = 0; attempt < maxCodeAttempts; attempt += 1) {
        const code = createCode();
        const codeRef = db.collection("roomCodes").doc(code);
        const roomRef = db.collection("rooms").doc();
        const created = await db.runTransaction(async (transaction) => {
            const existingCode = await transaction.get(codeRef);
            if (existingCode.exists)
                return false;
            transaction.create(codeRef, { roomId: roomRef.id, createdAt: firestore_1.FieldValue.serverTimestamp() });
            transaction.create(roomRef, { code, hostId: uid, status: "lobby", country, preferences, createdAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp(), endedAt: null });
            transaction.create(roomRef.collection("members").doc(uid), Object.assign(Object.assign({}, memberData(auth)), { role: "host", joinedAt: firestore_1.FieldValue.serverTimestamp() }));
            return true;
        });
        if (created)
            return { roomId: roomRef.id, code };
    }
    throw new https_1.HttpsError("aborted", "Could not reserve a room code. Please try again.");
});
exports.joinRoom = (0, https_1.onCall)(async (request) => {
    var _a;
    const auth = requireUser(request.auth);
    const code = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.code) === "string" ? request.data.code.trim().toUpperCase() : "";
    if (!new RegExp(`^[${codeAlphabet}]{${codeLength}}$`).test(code)) {
        throw new https_1.HttpsError("invalid-argument", "Enter a valid six-character room code.");
    }
    const uid = auth.uid;
    const codeRef = db.collection("roomCodes").doc(code);
    return db.runTransaction(async (transaction) => {
        const codeSnapshot = await transaction.get(codeRef);
        if (!codeSnapshot.exists)
            throw new https_1.HttpsError("not-found", "This room code was not found.");
        const roomRef = db.collection("rooms").doc(codeSnapshot.data().roomId);
        const roomSnapshot = await transaction.get(roomRef);
        if (!roomSnapshot.exists || roomSnapshot.data().status === "ended") {
            throw new https_1.HttpsError("failed-precondition", "This room is no longer available.");
        }
        const memberRef = roomRef.collection("members").doc(uid);
        transaction.set(memberRef, Object.assign(Object.assign({}, memberData(auth)), { role: roomSnapshot.data().hostId === uid ? "host" : "member", joinedAt: firestore_1.FieldValue.serverTimestamp() }), { merge: true });
        transaction.update(roomRef, { updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return { roomId: roomRef.id, code };
    });
});
exports.leaveRoom = (0, https_1.onCall)(async (request) => {
    var _a;
    const auth = requireUser(request.auth);
    const roomId = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.roomId) === "string" ? request.data.roomId : "";
    if (!roomId)
        throw new https_1.HttpsError("invalid-argument", "A room is required.");
    const roomRef = db.collection("rooms").doc(roomId);
    const memberRef = roomRef.collection("members").doc(auth.uid);
    await db.runTransaction(async (transaction) => {
        const roomSnapshot = await transaction.get(roomRef);
        const memberSnapshot = await transaction.get(memberRef);
        if (!roomSnapshot.exists || !memberSnapshot.exists)
            throw new https_1.HttpsError("not-found", "You are not a member of this room.");
        if (roomSnapshot.data().hostId === auth.uid)
            throw new https_1.HttpsError("failed-precondition", "Hosts must end the room or transfer host duties before leaving.");
        transaction.delete(memberRef);
        transaction.update(roomRef, { updatedAt: firestore_1.FieldValue.serverTimestamp() });
    });
    return { success: true };
});
exports.endRoom = (0, https_1.onCall)(async (request) => {
    var _a;
    const auth = requireUser(request.auth);
    const roomId = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.roomId) === "string" ? request.data.roomId : "";
    if (!roomId)
        throw new https_1.HttpsError("invalid-argument", "A room is required.");
    const roomRef = db.collection("rooms").doc(roomId);
    await db.runTransaction(async (transaction) => {
        const roomSnapshot = await transaction.get(roomRef);
        if (!roomSnapshot.exists)
            throw new https_1.HttpsError("not-found", "This room was not found.");
        if (roomSnapshot.data().hostId !== auth.uid)
            throw new https_1.HttpsError("permission-denied", "Only the host can end this room.");
        transaction.update(roomRef, { status: "ended", endedAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() });
    });
    return { success: true };
});
exports.heartbeatRoom = (0, https_1.onCall)(async (request) => {
    var _a;
    const auth = requireUser(request.auth);
    const roomId = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.roomId) === "string" ? request.data.roomId : "";
    if (!roomId)
        throw new https_1.HttpsError("invalid-argument", "A room is required.");
    const memberRef = db.collection("rooms").doc(roomId).collection("members").doc(auth.uid);
    const memberSnapshot = await memberRef.get();
    if (!memberSnapshot.exists)
        throw new https_1.HttpsError("permission-denied", "You are not a member of this room.");
    await memberRef.update({ lastSeenAt: firestore_1.FieldValue.serverTimestamp(), isOnline: true });
    return { success: true };
});
exports.startMatching = (0, https_1.onCall)({ secrets: [tmdbApiKey] }, async (request) => {
    var _a;
    const auth = requireUser(request.auth);
    const roomId = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.roomId) === "string" ? request.data.roomId : "";
    if (!roomId)
        throw new https_1.HttpsError("invalid-argument", "A room is required.");
    const roomRef = db.collection("rooms").doc(roomId);
    const roomSnapshot = await roomRef.get();
    if (!roomSnapshot.exists)
        throw new https_1.HttpsError("not-found", "This room was not found.");
    const room = roomSnapshot.data();
    if (room.hostId !== auth.uid)
        throw new https_1.HttpsError("permission-denied", "Only the host can start matching.");
    if (room.status !== "lobby")
        throw new https_1.HttpsError("failed-precondition", "Matching has already started for this room.");
    const queue = await fetchTmdbQueue(cleanPreferences(room.preferences), room.country);
    if (!queue.length)
        throw new https_1.HttpsError("not-found", "No films match these room settings.");
    const batch = db.batch();
    queue.forEach((movie, order) => {
        var _a;
        batch.set(roomRef.collection("queue").doc(String(movie.id)), {
            tmdbId: movie.id,
            title: movie.title,
            overview: movie.overview,
            posterPath: movie.poster_path,
            releaseYear: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
            rating: movie.vote_average,
            runtime: movie.runtime,
            genres: movie.genres.map((genre) => genre.name),
            genreIds: (_a = movie.genre_ids) !== null && _a !== void 0 ? _a : [],
            trailerKey: movie.trailerKey,
            providerNames: movie.providerNames,
            order,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    batch.update(roomRef, { status: "matching", queueSize: queue.length, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    await batch.commit();
    return { queueSize: queue.length };
});
exports.castVote = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    const auth = requireUser(request.auth);
    const roomId = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.roomId) === "string" ? request.data.roomId : "";
    const movieId = typeof ((_b = request.data) === null || _b === void 0 ? void 0 : _b.movieId) === "number" ? request.data.movieId : 0;
    const liked = typeof ((_c = request.data) === null || _c === void 0 ? void 0 : _c.liked) === "boolean" ? request.data.liked : null;
    if (!roomId || !movieId || liked === null)
        throw new https_1.HttpsError("invalid-argument", "A room, movie, and vote are required.");
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
        if (!roomSnapshot.exists || roomSnapshot.data().status !== "matching")
            throw new https_1.HttpsError("failed-precondition", "This room is not accepting votes.");
        if (!memberSnapshot.exists)
            throw new https_1.HttpsError("permission-denied", "You are not a member of this room.");
        if (!queueSnapshot.exists)
            throw new https_1.HttpsError("not-found", "This film is not in the room queue.");
        transaction.set(voteRef, { movieId, userId: auth.uid, liked, votedAt: firestore_1.FieldValue.serverTimestamp() });
        if (!liked)
            return { matched: false };
        const voterIds = new Set(likes.docs.map((vote) => vote.data().userId));
        voterIds.add(auth.uid);
        if (voterIds.size !== members.size)
            return { matched: false };
        if (!matchSnapshot.exists) {
            transaction.create(matchRef, { movieId, movie: queueSnapshot.data(), members: [...voterIds], matchedAt: firestore_1.FieldValue.serverTimestamp() });
            transaction.update(roomRef, { status: "matched", matchedMovieId: movieId, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        return { matched: true };
    });
});
exports.continueMatching = (0, https_1.onCall)({ secrets: [tmdbApiKey] }, async (request) => {
    var _a, _b;
    const auth = requireUser(request.auth);
    const roomId = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.roomId) === "string" ? request.data.roomId : "";
    if (!roomId)
        throw new https_1.HttpsError("invalid-argument", "A room is required.");
    const roomRef = db.collection("rooms").doc(roomId);
    const roomSnapshot = await roomRef.get();
    if (!roomSnapshot.exists)
        throw new https_1.HttpsError("not-found", "This room was not found.");
    const room = roomSnapshot.data();
    if (room.hostId !== auth.uid)
        throw new https_1.HttpsError("permission-denied", "Only the host can start another round.");
    if (room.status !== "matched")
        throw new https_1.HttpsError("failed-precondition", "Finish the current round before starting another.");
    const queue = await fetchTmdbQueue(cleanPreferences(room.preferences), room.country);
    if (!queue.length)
        throw new https_1.HttpsError("not-found", "No films match these room settings.");
    const [oldQueue, oldVotes] = await Promise.all([roomRef.collection("queue").get(), roomRef.collection("votes").get()]);
    const batch = db.batch();
    oldQueue.docs.forEach((movie) => batch.delete(movie.ref));
    oldVotes.docs.forEach((vote) => batch.delete(vote.ref));
    queue.forEach((movie, order) => {
        var _a;
        batch.set(roomRef.collection("queue").doc(String(movie.id)), {
            tmdbId: movie.id,
            title: movie.title,
            overview: movie.overview,
            posterPath: movie.poster_path,
            releaseYear: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
            rating: movie.vote_average,
            runtime: movie.runtime,
            genres: movie.genres.map((genre) => genre.name),
            genreIds: (_a = movie.genre_ids) !== null && _a !== void 0 ? _a : [],
            trailerKey: movie.trailerKey,
            providerNames: movie.providerNames,
            order,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    batch.update(roomRef, { status: "matching", matchedMovieId: null, queueSize: queue.length, round: ((_b = room.round) !== null && _b !== void 0 ? _b : 1) + 1, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    await batch.commit();
    return { queueSize: queue.length };
});
//# sourceMappingURL=index.js.map