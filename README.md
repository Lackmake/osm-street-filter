# OSM Street Inclusion Filter Map

A zero-backend, standalone web application that allows users to inspect OpenStreetMap street data on an interactive map, evaluate every street against inclusion/exclusion rules, and view step-by-step filter reason traces.

## Features

- **100% Client-Side Static Site**: Zero backend server required. Runs anywhere (GitHub Pages, Netlify, Vercel, or locally).
- **On-Demand Overpass API Queries**: Fetch OpenStreetMap vector data in the current map view on demand with a click of a button or `Enter` shortcut.
- **Real-Time Street Evaluation Engine**: Evaluates every street against 13+ rule stages (foot tags, access restrictions, highway types, sidewalk rules, unpaved surfaces, pedestrian areas, nature areas, named service roads, bicycle tags, tunnels/indoor/covered exclusions).
- **Interactive Street Popups**: Click any line on the map to view the street name, highway type, tag key-value pairs, status badge (Included ✓ / Excluded ✗), step-by-step rule trace, and direct link to OpenStreetMap.
- **View Display Modes**: Toggle between `Included` streets, `Excluded` streets, or `Both`.
- **Highway Breakdown Panel**: Inspect street counts by highway type with color indicators and interactive toggles to show/hide specific highway types.
- **Location Search Bar**: Instantly jump to any city, address, or coordinate using Nominatim search.

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation & Local Development

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone https://github.com/Lackmake/osm-street-filter.git
   cd osm-street-filter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:3000`.

### Building for Production / Static Hosting

To build the static HTML/CSS/JS bundle:
```bash
npm run build
```
The production bundle will be generated in `dist/`. You can upload the contents of `dist/` to any web host (GitHub Pages, Netlify, Vercel, S3, etc.).
