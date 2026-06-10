import math
import os
from typing import Iterable

import httpx
from dotenv import load_dotenv

from .models import Coordinate


load_dotenv()
NOMINATIM_URL = os.getenv("GEOCODING_URL", "https://nominatim.openstreetmap.org/search")
ROUTING_PROVIDER = os.getenv("ROUTING_PROVIDER", "osrm").lower()
WALKING_ROUTING_URL = os.getenv(
    "WALKING_ROUTING_URL",
    "https://router.project-osrm.org/route/v1/foot",
).rstrip("/")
ROUTING_API_KEY = os.getenv("ROUTING_API_KEY", "")
USER_AGENT = "PlainMap-Studio/1.0 (local event map editor)"
OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")


async def geocode(query: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": USER_AGENT}) as client:
        response = await client.get(
            NOMINATIM_URL,
            params={"q": query, "format": "jsonv2", "limit": 5},
        )
        response.raise_for_status()
    return [
        {
            "label": item["display_name"],
            "lat": float(item["lat"]),
            "lng": float(item["lon"]),
            "type": item.get("type", ""),
        }
        for item in response.json()
    ]


async def walking_route(coordinates: Iterable[Coordinate]) -> list[Coordinate]:
    points = list(coordinates)
    if len(points) < 2:
        return points

    if ROUTING_PROVIDER == "openrouteservice":
        return await _openrouteservice_walking_route(points)
    if ROUTING_PROVIDER != "osrm":
        raise ValueError(f"Unsupported routing provider: {ROUTING_PROVIDER}")
    return await _osrm_walking_route(points)


async def _osrm_walking_route(points: list[Coordinate]) -> list[Coordinate]:
    """Call an OSRM-compatible endpoint configured with a pedestrian profile."""
    coordinate_string = ";".join(f"{point.lng},{point.lat}" for point in points)
    async with httpx.AsyncClient(timeout=25, headers={"User-Agent": USER_AGENT}) as client:
        response = await client.get(
            f"{WALKING_ROUTING_URL}/{coordinate_string}",
            params={"overview": "full", "geometries": "geojson", "steps": "false"},
        )
        response.raise_for_status()
    payload = response.json()
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise ValueError("No walking route was found.")
    return [
        Coordinate(lat=lat, lng=lng)
        for lng, lat in payload["routes"][0]["geometry"]["coordinates"]
    ]


async def _openrouteservice_walking_route(points: list[Coordinate]) -> list[Coordinate]:
    if not ROUTING_API_KEY:
        raise ValueError("ROUTING_API_KEY is required for OpenRouteService.")
    url = WALKING_ROUTING_URL
    if url.endswith("/directions"):
        url = f"{url}/foot-walking/geojson"
    headers = {
        "User-Agent": USER_AGENT,
        "Authorization": ROUTING_API_KEY,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=25, headers=headers) as client:
        response = await client.post(
            url,
            json={"coordinates": [[point.lng, point.lat] for point in points]},
        )
        response.raise_for_status()
    payload = response.json()
    features = payload.get("features", [])
    if not features:
        raise ValueError("No walking route was found.")
    return [
        Coordinate(lat=lat, lng=lng)
        for lng, lat in features[0]["geometry"]["coordinates"]
    ]


async def nearby_places(lat: float, lng: float, radius: int = 180) -> list[dict]:
    """Return named nearby OSM features without making the browser call Overpass directly."""
    query = f"""
    [out:json][timeout:12];
    (
      nwr(around:{radius},{lat},{lng})["name"]["amenity"];
      nwr(around:{radius},{lat},{lng})["name"]["tourism"];
      nwr(around:{radius},{lat},{lng})["name"]["historic"];
      nwr(around:{radius},{lat},{lng})["name"]["leisure"];
      nwr(around:{radius},{lat},{lng})["name"]["highway"="path"];
      nwr(around:{radius},{lat},{lng})["name"]["highway"="footway"];
    );
    out center 30;
    """
    async with httpx.AsyncClient(timeout=18, headers={"User-Agent": USER_AGENT}) as client:
        response = await client.post(OVERPASS_URL, content=query)
        response.raise_for_status()

    results = []
    seen = set()
    for item in response.json().get("elements", []):
        tags = item.get("tags", {})
        name = tags.get("name")
        point = item.get("center", item)
        if not name or "lat" not in point or "lon" not in point or name in seen:
            continue
        seen.add(name)
        category = next(
            (tags[key] for key in ("amenity", "tourism", "historic", "leisure", "highway") if key in tags),
            "place",
        )
        results.append(
            {
                "name": name,
                "lat": float(point["lat"]),
                "lng": float(point["lon"]),
                "category": category.replace("_", " "),
            }
        )
    return results[:20]


def bearing(start: Coordinate, end: Coordinate) -> float:
    lat1, lat2 = math.radians(start.lat), math.radians(end.lat)
    delta_lon = math.radians(end.lng - start.lng)
    y = math.sin(delta_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(
        delta_lon
    )
    return (math.degrees(math.atan2(y, x)) + 360) % 360
