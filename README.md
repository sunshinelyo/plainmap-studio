# PlainMap Studio

A small browser editor for turning KML/KMZ files into a styled walking map.

## First version

- Upload KML or KMZ
- Show imported point placemarks as POIs
- Keep one editable walking path
- Change route and POI colors
- Export the visible crop frame as PNG

## Run locally

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open <http://127.0.0.1:8000>.
