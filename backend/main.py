import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .export import project_geojson, project_pdf, project_svg
from .file_import import parse_upload
from .map_processing import geocode, nearby_places, walking_route
from .models import Project, RouteRequest


BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
load_dotenv(BASE_DIR / ".env")

app = FastAPI(
    title="PlainMap Studio",
    description="A simple event walking-map designer.",
    version="1.0.0",
)

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/geocode")
async def geocode_location(q: str = Query(min_length=2)) -> list[dict]:
    try:
        return await geocode(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Geocoding failed: {exc}") from exc


@app.post("/api/import")
async def import_file(file: UploadFile = File(...)) -> dict:
    try:
        return parse_upload(file.filename or "upload", await file.read())
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/route/walking")
async def create_walking_route(request: RouteRequest) -> dict:
    try:
        coordinates = await walking_route(request.coordinates)
        return {"coordinates": [point.model_dump() for point in coordinates]}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Routing failed: {exc}") from exc


@app.get("/api/nearby")
async def get_nearby_places(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
) -> list[dict]:
    try:
        return await nearby_places(lat, lng)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Nearby POIs unavailable: {exc}") from exc


@app.post("/api/export/geojson")
async def export_geojson(project: Project) -> dict:
    return project_geojson(project)


@app.post("/api/export/svg")
async def export_svg(project: Project) -> Response:
    return Response(
        project_svg(project),
        media_type="image/svg+xml",
        headers={"Content-Disposition": 'attachment; filename="plainmap.svg"'},
    )


@app.post("/api/export/pdf")
async def export_pdf(project: Project) -> Response:
    return Response(
        project_pdf(project),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="plainmap.pdf"'},
    )


app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    return HTMLResponse((FRONTEND_DIR / "index.html").read_text(encoding="utf-8"))
