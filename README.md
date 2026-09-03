# Movie Night Matcher

Movie Night Matcher is a collaborative movie discovery application that helps friends decide what to watch together.

Users can create or join a room, browse movies, vote on what they want to watch, and discover movies that everyone in the room likes.

## Features

* Create movie rooms
* Join rooms with friends
* Browse and discover movies
* Swipe/vote on movies
* Find movies that everyone matches on
* View movie details
* See where movies are available to stream
* Real-time room interaction
* Firebase-based data management

## Tech Stack

* React
* JavaScript
* TMDB API
* Firebase
* CSS / Tailwind CSS

## How It Works

1. Create a movie room.
2. Share the room with friends.
3. Everyone browses available movies.
4. Users vote on movies they want to watch.
5. The application compares everyone's choices.
6. Matching movies are displayed.
7. Users can check where the selected movie is available to watch.

## Getting Started

### Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/movie-night-matcher.git
cd movie-night-matcher
```

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env.local` file in the project root and add the required API credentials.

Example:

```env
TMDB_API_KEY=your_tmdb_api_key
```

Add your Firebase configuration according to your project setup.

### Start the development server

```bash
npm run dev
```

Open the local development URL shown in the terminal.

## Environment Variables

API keys and private configuration are stored locally and are not committed to the repository.

Make sure your environment file is included in `.gitignore`.

## Future Improvements

* Group chat inside movie rooms
* More advanced movie recommendations
* Genre and language filters
* Watchlist
* User profiles
* Movie ratings
* Personalized recommendations
* Better streaming-provider detection
* Mobile application
* Social sharing

## License

This project is intended for educational and portfolio purposes.
