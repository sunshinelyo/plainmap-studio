import asyncio
import json
from pathlib import Path

from pydantic import ValidationError

from backend.export import project_svg
from backend.file_import import parse_csv, parse_geojson, parse_kml
from backend.models import Project
from backend import map_processing


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_poi_markers_keep_maplibre_absolute_positioning():
    styles = (PROJECT_ROOT / "frontend" / "styles.css").read_text(encoding="utf-8")
    app = (PROJECT_ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
    index = (PROJECT_ROOT / "frontend" / "index.html").read_text(encoding="utf-8")

    assert ".maplibregl-marker.plain-poi-marker" in styles
    marker_rule = styles.split(".maplibregl-marker.plain-poi-marker", 1)[1].split("}", 1)[0]
    assert "position: absolute" in marker_rule
    assert ".poi-card-details[hidden] { display: none; }" in styles
    assert 'anchor: project.poi_simple_markers ? "center" : "bottom"' in app
    assert "poiMarkers.set(poi.id, marker)" in app
    assert 'id="poi-simple-markers"' in index
    assert 'id="collapse-all-pois"' in index
    assert 'id="expand-all-pois"' in index


def test_simple_poi_marker_setting_round_trips():
    project = Project(poi_simple_markers=True)
    assert project.model_dump(mode="json")["poi_simple_markers"] is True


def test_usability_settings_round_trip():
    project = Project(
        workflow_stage=5,
        quick_edit_mode=True,
        imported_layers=[{"id": "layer-1", "name": "Trail", "visible": True, "locked": True, "data": {"type": "FeatureCollection", "features": []}}],
        pois=[{
            "id": "bridge",
            "position": {"lat": 30.1, "lng": -97.2},
            "label": "Bridge",
            "display_mode": "text",
            "short_text": "Bridge",
            "use_category_defaults": False,
        }],
    )
    data = project.model_dump(mode="json")
    assert data["workflow_stage"] == 5
    assert data["quick_edit_mode"] is True
    assert data["imported_layers"][0]["locked"] is True
    assert data["pois"][0]["display_mode"] == "text"


def test_svg_uses_per_poi_short_text_and_layout_elements():
    project = Project.model_validate({
        "export": {"width": 800, "height": 600, "preset": "custom"},
        "legend": {"visible": True, "position": {"x": 42, "y": 36}},
        "compass": {"visible": True, "custom_position": {"x": 120, "y": 90}},
        "pois": [{
            "id": "bridge",
            "position": {"lat": 30.1, "lng": -97.2},
            "label": "Pedestrian bridge",
            "display_mode": "text",
            "short_text": "Bridge",
        }],
    })
    svg = project_svg(project)
    assert ">Bridge</text>" in svg
    assert "Map key" in svg
    assert 'translate(120.0 90.0)' in svg


def test_parse_csv_coordinates():
    result = parse_csv(b"name,latitude,longitude\nStart,30.1,-97.2\n")
    assert result["features"][0]["geometry"]["coordinates"] == [-97.2, 30.1]


def test_parse_single_geojson_feature():
    payload = {
        "type": "Feature",
        "properties": {"name": "A"},
        "geometry": {"type": "Point", "coordinates": [-97, 30]},
    }
    result = parse_geojson(json.dumps(payload).encode())
    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) == 1


def test_parse_kml_linestring():
    result = parse_kml(
        b"""<kml><Document><Placemark><name>Walk</name><LineString>
        <coordinates>-97.1,30.1 -97.2,30.2</coordinates>
        </LineString></Placemark></Document></kml>"""
    )
    assert result["features"][0]["geometry"]["type"] == "LineString"


def test_project_rejects_invalid_coordinates():
    try:
        Project.model_validate({"center": {"lat": 91, "lng": 0}})
    except ValidationError:
        return
    raise AssertionError("Invalid latitude should fail validation")


def test_svg_respects_marker_mode_labels_and_bearing():
    project = Project.model_validate(
        {
            "rotation": 30,
            "poi_marker_mode": "numbers",
            "pois": [
                {
                    "id": "one",
                    "position": {"lat": 30, "lng": -97},
                    "label": "Hidden label",
                    "show_label": False,
                }
            ],
        }
    )
    svg = project_svg(project)
    assert "rotate(-30" in svg
    assert ">1</text>" in svg
    assert "Hidden label" not in svg


def test_svg_uses_boundary_and_material_icon_fallback():
    project = Project.model_validate(
        {
            "poi_marker_mode": "icons",
            "pois": [
                {
                    "id": "camera",
                    "position": {"lat": 30, "lng": -97},
                    "label": "Camera",
                    "icon": "photo_camera",
                }
            ],
            "export_boundary": {
                "enabled": True,
                "center": {"lat": 30, "lng": -97},
                "width": 320,
                "height": 400,
                "rotation": 15,
                "aspect_ratio": 0.8,
                "bounds": {
                    "west": -97.01,
                    "south": 29.99,
                    "east": -96.99,
                    "north": 30.01,
                },
            },
        }
    )
    svg = project_svg(project)
    assert "rotate(-15" in svg
    assert '<path d="M4 7h4l2-2h4l2 2h4v12H4z"' in svg


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, response):
        self.response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, *_args, **_kwargs):
        return self.response

    async def post(self, *_args, **_kwargs):
        return self.response


def test_osrm_walking_route_parses_geojson(monkeypatch):
    response = FakeResponse(
        {
            "code": "Ok",
            "routes": [{"geometry": {"coordinates": [[-97.1, 30.1], [-97.2, 30.2]]}}],
        }
    )
    monkeypatch.setattr(map_processing.httpx, "AsyncClient", lambda **_kwargs: FakeClient(response))
    points = asyncio.run(
        map_processing._osrm_walking_route(
            [
                map_processing.Coordinate(lat=30.1, lng=-97.1),
                map_processing.Coordinate(lat=30.2, lng=-97.2),
            ]
        )
    )
    assert points[-1].lat == 30.2


def test_openrouteservice_walking_route_parses_geojson(monkeypatch):
    response = FakeResponse(
        {
            "features": [
                {"geometry": {"coordinates": [[-97.1, 30.1], [-97.15, 30.15], [-97.2, 30.2]]}}
            ]
        }
    )
    monkeypatch.setattr(map_processing, "ROUTING_API_KEY", "test-key")
    monkeypatch.setattr(map_processing.httpx, "AsyncClient", lambda **_kwargs: FakeClient(response))
    points = asyncio.run(
        map_processing._openrouteservice_walking_route(
            [
                map_processing.Coordinate(lat=30.1, lng=-97.1),
                map_processing.Coordinate(lat=30.2, lng=-97.2),
            ]
        )
    )
    assert len(points) == 3
