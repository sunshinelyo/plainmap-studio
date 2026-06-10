import csv
import io
import json
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


def feature_collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def parse_upload(filename: str, content: bytes) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix in {".geojson", ".json"}:
        return parse_geojson(content)
    if suffix == ".csv":
        return parse_csv(content)
    if suffix == ".gpx":
        return parse_gpx(content)
    if suffix == ".kml":
        return parse_kml(content)
    if suffix == ".kmz":
        return parse_kmz(content)
    raise ValueError("Supported formats: GeoJSON, CSV, GPX, KML, and KMZ.")


def parse_geojson(content: bytes) -> dict[str, Any]:
    data = json.loads(content.decode("utf-8-sig"))
    if data.get("type") == "FeatureCollection":
        return data
    if data.get("type") == "Feature":
        return feature_collection([data])
    if "type" in data and "coordinates" in data:
        return feature_collection(
            [{"type": "Feature", "properties": {}, "geometry": data}]
        )
    raise ValueError("The file is not valid GeoJSON.")


def parse_csv(content: bytes) -> dict[str, Any]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV must include a header row.")
    lookup = {name.lower().strip(): name for name in reader.fieldnames}
    lat_key = next((lookup[k] for k in ("lat", "latitude", "y") if k in lookup), None)
    lon_key = next(
        (lookup[k] for k in ("lon", "lng", "longitude", "x") if k in lookup), None
    )
    if not lat_key or not lon_key:
        raise ValueError("CSV needs lat/latitude and lon/lng/longitude columns.")

    features = []
    for index, row in enumerate(reader, start=1):
        try:
            lat, lon = float(row[lat_key]), float(row[lon_key])
        except (TypeError, ValueError):
            continue
        properties = {
            key: value
            for key, value in row.items()
            if key not in {lat_key, lon_key} and value not in (None, "")
        }
        properties.setdefault("label", f"Point {index}")
        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
            }
        )
    return feature_collection(features)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_gpx(content: bytes) -> dict[str, Any]:
    root = ET.fromstring(content)
    features: list[dict[str, Any]] = []
    for element in root.iter():
        kind = _local_name(element.tag)
        if kind == "wpt":
            name = next(
                (child.text for child in element if _local_name(child.tag) == "name"),
                "Waypoint",
            )
            features.append(
                {
                    "type": "Feature",
                    "properties": {"label": name},
                    "geometry": {
                        "type": "Point",
                        "coordinates": [
                            float(element.attrib["lon"]),
                            float(element.attrib["lat"]),
                        ],
                    },
                }
            )
        if kind in {"trkseg", "rte"}:
            point_names = {"trkseg": "trkpt", "rte": "rtept"}
            coordinates = [
                [float(point.attrib["lon"]), float(point.attrib["lat"])]
                for point in element
                if _local_name(point.tag) == point_names[kind]
            ]
            if coordinates:
                features.append(
                    {
                        "type": "Feature",
                        "properties": {"label": "Imported route"},
                        "geometry": {"type": "LineString", "coordinates": coordinates},
                    }
                )
    return feature_collection(features)


def _kml_coordinates(text: str | None) -> list[list[float]]:
    coordinates = []
    for token in (text or "").replace("\n", " ").split():
        parts = token.split(",")
        if len(parts) >= 2:
            coordinates.append([float(parts[0]), float(parts[1])])
    return coordinates


def parse_kml(content: bytes) -> dict[str, Any]:
    root = ET.fromstring(content)
    features: list[dict[str, Any]] = []
    for placemark in (el for el in root.iter() if _local_name(el.tag) == "Placemark"):
        name = next(
            (child.text for child in placemark.iter() if _local_name(child.tag) == "name"),
            "Imported feature",
        )
        for geometry in placemark.iter():
            kind = _local_name(geometry.tag)
            if kind not in {"Point", "LineString", "Polygon"}:
                continue
            coord_node = next(
                (
                    child
                    for child in geometry.iter()
                    if _local_name(child.tag) == "coordinates"
                ),
                None,
            )
            coordinates = _kml_coordinates(coord_node.text if coord_node is not None else "")
            if not coordinates:
                continue
            if kind == "Point":
                geo = {"type": "Point", "coordinates": coordinates[0]}
            elif kind == "LineString":
                geo = {"type": "LineString", "coordinates": coordinates}
            else:
                geo = {"type": "Polygon", "coordinates": [coordinates]}
            features.append(
                {
                    "type": "Feature",
                    "properties": {"label": name},
                    "geometry": geo,
                }
            )
            break
    return feature_collection(features)


def parse_kmz(content: bytes) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names = [name for name in archive.namelist() if name.lower().endswith(".kml")]
        if not names:
            raise ValueError("KMZ archive does not contain a KML file.")
        return parse_kml(archive.read(names[0]))

