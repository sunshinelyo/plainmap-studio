import io
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


def parse_upload(filename: str, content: bytes) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".kml":
        return parse_kml(content)
    if suffix == ".kmz":
        return parse_kmz(content)
    raise ValueError("Upload a KML or KMZ file.")


def parse_kmz(content: bytes) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            kml_files = [
                name for name in archive.namelist()
                if name.lower().endswith(".kml") and not name.endswith("/")
            ]
            if not kml_files:
                raise ValueError("This KMZ does not contain a KML file.")
            preferred = next(
                (name for name in kml_files if Path(name).name.lower() == "doc.kml"),
                kml_files[0],
            )
            return parse_kml(archive.read(preferred))
    except zipfile.BadZipFile as exc:
        raise ValueError("This KMZ file is not a valid archive.") from exc


def parse_kml(content: bytes) -> dict[str, Any]:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError("This KML file is not valid XML.") from exc

    features: list[dict[str, Any]] = []
    for placemark in elements_named(root, "Placemark"):
        label = element_text(placemark, "name") or "Untitled place"
        for point in elements_named(placemark, "Point"):
            coordinates = geometry_coordinates(point)
            if coordinates:
                features.append(feature("Point", coordinates[0], label))

        for line in elements_named(placemark, "LineString"):
            coordinates = geometry_coordinates(line)
            if len(coordinates) >= 2:
                features.append(feature("LineString", coordinates, label))

        for track in elements_named(placemark, "Track"):
            coordinates = track_coordinates(track)
            if len(coordinates) >= 2:
                features.append(feature("LineString", coordinates, label))

        for polygon in elements_named(placemark, "Polygon"):
            coordinates = polygon_coordinates(polygon)
            if coordinates:
                features.append(feature("Polygon", coordinates, label))

    if not features:
        raise ValueError(
            "No point placemarks, walking paths, or parking polygons were found "
            "in this file."
        )
    return {"type": "FeatureCollection", "features": features}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def elements_named(root: ET.Element, name: str):
    return (element for element in root.iter() if local_name(element.tag) == name)


def first_descendant(root: ET.Element, name: str) -> ET.Element | None:
    return next(elements_named(root, name), None)


def element_text(root: ET.Element, name: str) -> str:
    element = first_descendant(root, name)
    return (element.text or "").strip() if element is not None else ""


def geometry_coordinates(geometry: ET.Element) -> list[list[float]]:
    text = element_text(geometry, "coordinates")
    coordinates: list[list[float]] = []
    for token in text.replace("\n", " ").replace("\t", " ").split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        try:
            coordinates.append([float(parts[0]), float(parts[1])])
        except ValueError:
            continue
    return coordinates


def track_coordinates(track: ET.Element) -> list[list[float]]:
    coordinates: list[list[float]] = []
    for node in elements_named(track, "coord"):
        parts = (node.text or "").split()
        if len(parts) < 2:
            continue
        try:
            coordinates.append([float(parts[0]), float(parts[1])])
        except ValueError:
            continue
    return coordinates


def polygon_coordinates(polygon: ET.Element) -> list[list[list[float]]]:
    rings: list[list[list[float]]] = []
    outer = first_descendant(polygon, "outerBoundaryIs")
    if outer is not None:
        ring = geometry_coordinates(outer)
        if valid_polygon_ring(ring):
            rings.append(close_polygon_ring(ring))

    for inner in elements_named(polygon, "innerBoundaryIs"):
        ring = geometry_coordinates(inner)
        if valid_polygon_ring(ring):
            rings.append(close_polygon_ring(ring))
    return rings


def valid_polygon_ring(coordinates: list[list[float]]) -> bool:
    return len({tuple(point) for point in coordinates}) >= 3


def close_polygon_ring(coordinates: list[list[float]]) -> list[list[float]]:
    if coordinates[0] == coordinates[-1]:
        return coordinates
    return [*coordinates, coordinates[0]]


def feature(kind: str, coordinates: Any, label: str) -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": {"label": label},
        "geometry": {"type": kind, "coordinates": coordinates},
    }
