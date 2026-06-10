# PlainMap Studio

PlainMap Studio is a Python-first event map designer for making clean, phone-friendly walking maps. It uses FastAPI on the backend and MapLibre GL JS with OpenFreeMap/OpenStreetMap vector data in the browser.

## Features

- Search for an address or place with OpenStreetMap Nominatim
- Import GeoJSON, CSV, GPX, KML, and KMZ
- Add, drag, edit, delete, and reorder labeled POIs
- Build straight-line or routed paths, or manually draw and edit a route
- Draw parking areas and convert imported polygons to parking
- Minimal, Standard, and Detailed modes toggle real vector-map label layers
- Rotate the complete vector map north-up, route-vertical, or to a custom bearing
- Rotation-aware, configurable compass
- Google Material Symbols for POI, parking, and route icons
- Linked zoom buttons, number input, and slider with project persistence
- Movable, resizable, rotatable export boundary with route fitting
- Editable palette and Austin Photo Walkers preset
- Draggable, resizable, configurable legend
- Save/load complete project JSON
- Export PNG, PDF, SVG, or GeoJSON
- 1:1, 4:5, 9:16, 16:9, 4:3, 3:4, 2:3, and custom output sizes

## Quick start

Python 3.11 or newer is recommended.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn backend.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

The interface and map libraries load from public CDNs, and the basemap uses OpenStreetMap tiles, so normal use requires an internet connection. Geocoding uses Nominatim. Walking routes use an environment-configured OSRM-compatible foot profile or OpenRouteService; failures fall back to straight lines with an editor warning.

## Configuration

Copy `.env.example` to `.env` for local configuration. The application reads:

- `CORS_ORIGINS`: comma-separated deployed frontend origins
- `GEOCODING_URL`: Nominatim-compatible search endpoint
- `OVERPASS_URL`: Overpass endpoint for nearby POI suggestions
- `ROUTING_PROVIDER`: `osrm` or `openrouteservice`
- `WALKING_ROUTING_URL`: pedestrian routing endpoint
- `ROUTING_API_KEY`: required only for providers such as OpenRouteService

For OSRM, `WALKING_ROUTING_URL` must point to a server that actually has a pedestrian profile installed. The public OSRM demo service is useful for development but is not a production SLA.

## Demo

Use **Load project** and choose:

`sample_data/austin_photo_walk.plainmap.json`

It includes the requested nine A-I stops, yellow walking route, yellow meeting point, orange markers, purple parking, rotated vertical presentation, and matching compass orientation.

The `sample_data` folder also contains:

- `sample_pois.csv` for testing point import
- `sample_route.geojson` for testing route and polygon import

## How editing works

- Double-click the map or use **Add POI at map center**.
- Drag POI markers directly on the map.
- Enter POI coordinates manually or drag markers; nearby OpenStreetMap suggestions are optional.
- Reorder POI cards with the `::` handle; letter/number markers update automatically.
- Choose global letter, number, or custom icon marker modes and toggle labels per POI.
- Use the export boundary to select the exact map area; shaded content outside it is not exported.
- Select which POIs participate in the route, choose a route method, then click **Build route**.
- Toggle **Edit mode** to drag vertices, click the route to add one, or right-click/select + Delete to remove one.
- Click **Draw parking polygon**, then click points on the map and close the shape.
- Click an imported polygon to convert it into an editable parking area.
- Use **Route vertical** or **Fit route to canvas** for a poster-like composition.

## Exports

- **PNG** crops the rendered map to the export boundary without stretching it.
- **PDF** embeds the same boundary crop at the selected output size.
- **SVG** uses the saved boundary bounds and inline vector icon fallbacks. It intentionally omits vector basemap tiles, making it useful for finishing in Canva or a vector editor.
- **GeoJSON** includes all map features and stores the complete PlainMap project in `properties.plainmapProject`.

Browser security and vector-tile CORS policies can affect raster PNG/PDF capture. A production deployment should use a vector-tile provider whose terms fit the expected traffic.

## Deploying the App

PlainMap currently serves the frontend and API from the same FastAPI process, which is the simplest production deployment:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

The included `Dockerfile` can be deployed to Render, Railway, Fly.io, DigitalOcean, or another container host. Set the environment variables from `.env.example`, especially `CORS_ORIGINS` and routing credentials. Do not commit `.env` or API keys.

The frontend is plain static HTML/CSS/JavaScript and can also be hosted separately on Vercel, Netlify, or GitHub Pages. In that arrangement, define `window.PLAINMAP_API_BASE_URL` before loading `app.js` and add the frontend origin to `CORS_ORIGINS`.

### PythonAnywhere

The included `pythonanywhere_wsgi.py` uses a2wsgi's `ASGIMiddleware` to adapt the FastAPI application to PythonAnywhere's standard WSGI web hosting:

```bash
git clone https://github.com/sunshinelyo/plainmap-studio.git
mkvirtualenv --python=/usr/bin/python3.12 plainmap
cd ~/plainmap-studio
pip install -r requirements.txt
```

Configure the web app source and working directory as `/home/YOURUSERNAME/plainmap-studio`, set its virtualenv to `/home/YOURUSERNAME/.virtualenvs/plainmap`, and use this WSGI configuration:

```python
import sys

path = "/home/YOURUSERNAME/plainmap-studio"
if path not in sys.path:
    sys.path.insert(0, path)

from pythonanywhere_wsgi import application
```

Free PythonAnywhere accounts restrict outbound API domains. The editor and exports still load, but geocoding, nearby suggestions, and walking routing require allowlisted providers or a paid account.

## Saved Projects And Future Accounts

Projects are currently downloaded and loaded as local JSON files. Each saved project receives a stable `project_id`, while `owner_id` remains empty. A future account-enabled release can store the same project JSON in Supabase/Postgres and associate `owner_id` with authenticated users without replacing the editor format.

## Project structure

```text
backend/
  main.py             FastAPI routes and static app hosting
  models.py           Pydantic project schema
  map_processing.py   Geocoding and walking-route clients
  file_import.py      GeoJSON, CSV, GPX, KML, and KMZ parsing
  export.py           GeoJSON, SVG, and basic PDF helpers
frontend/
  index.html          Editor UI
  styles.css          Responsive visual design and map styling
  app.js              MapLibre editor and project state
sample_data/
tests/
exports/
screenshots/
Dockerfile
.env.example
```

## Tests

```powershell
python -m pytest
```

The backend parsers deliberately use Python's standard library. GeoPandas/Shapely can be added later for heavier GIS cleanup, reprojection, or topology validation without changing the browser project format.
