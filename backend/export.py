import io
import json
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from .models import Project


def project_geojson(project: Project) -> dict:
    features = list(project.imported_features.get("features", []))
    for poi in project.pois:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "plainmapType": "poi",
                    "id": poi.id,
                    "label": poi.label,
                    "description": poi.description,
                    "marker": poi.marker,
                    "category": poi.category,
                    "icon": poi.icon,
                    "color": poi.color,
                    "showLabel": poi.show_label,
                    "displayMode": poi.display_mode,
                    "shortText": poi.short_text,
                    "useCategoryDefaults": poi.use_category_defaults,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [poi.position.lng, poi.position.lat],
                },
            }
        )
    if project.route:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "plainmapType": "route",
                    "color": project.palette.route,
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[point.lng, point.lat] for point in project.route],
                },
            }
        )
    for area in project.parking:
        ring = [[point.lng, point.lat] for point in area.coordinates]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "plainmapType": "parking",
                    "id": area.id,
                    "label": area.label,
                    "kind": area.kind,
                    "color": area.color,
                    "opacity": area.opacity,
                    "borderColor": area.border_color,
                    "showIcon": area.show_icon,
                },
                "geometry": {"type": "Polygon", "coordinates": [ring]},
            }
        )
    return {
        "type": "FeatureCollection",
        "properties": {
            "plainmapProject": project.model_dump(mode="json"),
        },
        "features": features,
    }


def _project_bounds(project: Project) -> tuple[float, float, float, float]:
    boundary = project.export_boundary
    if boundary.enabled and {"west", "south", "east", "north"} <= boundary.bounds.keys():
        return (
            boundary.bounds["west"],
            boundary.bounds["south"],
            boundary.bounds["east"],
            boundary.bounds["north"],
        )
    points = list(project.route) or [poi.position for poi in project.pois]
    points += [point for area in project.parking for point in area.coordinates]
    if not points:
        points = [project.center]
    lats = [point.lat for point in points]
    lngs = [point.lng for point in points]
    padding_lat = max((max(lats) - min(lats)) * 0.12, 0.001)
    padding_lng = max((max(lngs) - min(lngs)) * 0.12, 0.001)
    return (
        min(lngs) - padding_lng,
        min(lats) - padding_lat,
        max(lngs) + padding_lng,
        max(lats) + padding_lat,
    )


def _material_symbol_svg(name: str, x: float, y: float) -> str:
    """Small inline SVG fallbacks keep icon exports independent of webfonts."""
    legacy = {
        "camera": "photo_camera",
        "pin": "location_on",
        "star": "landscape",
        "food": "restaurant",
        "restroom": "wc",
        "meeting": "groups",
    }
    name = legacy.get(name, name)
    symbols = {
        "photo_camera": '<path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
        "location_on": '<path d="M12 22s7-6.1 7-13a7 7 0 10-14 0c0 6.9 7 13 7 13z"/><circle cx="12" cy="9" r="2.5" fill="white"/>',
        "local_parking": '<path d="M7 3h7a6 6 0 010 12h-3v6H7zm4 4v4h3a2 2 0 000-4z"/>',
        "directions_walk": '<circle cx="13" cy="4" r="2"/><path d="M11 7l-3 5 3 2-2 7h3l2-6 2 2v4h3v-6l-4-4 1-2 2 2 2-1-3-4z"/>',
        "restaurant": '<path d="M7 2v8H5V2H3v8c0 2 1 3 3 3v9h3v-9c2 0 3-1 3-3V2H10v6H9V2zm10 0c-2 4-2 8 1 11v9h3V2z"/>',
        "wc": '<circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/><path d="M4 9h6v6H9v7H5v-7H4zm10 0h6l2 7h-3v6h-4v-6h-3z"/>',
        "water_drop": '<path d="M12 2S5 10 5 15a7 7 0 0014 0c0-5-7-13-7-13z"/>',
        "park": '<path d="M12 2l-5 7h3l-5 7h5v6h4v-6h5l-5-7h3z"/>',
        "train": '<path d="M7 2h10a4 4 0 014 4v10a4 4 0 01-4 4l2 2h-3l-2-2h-4l-2 2H5l2-2a4 4 0 01-4-4V6a4 4 0 014-4zm0 4v5h10V6zm1 8a2 2 0 100 4 2 2 0 000-4zm8 0a2 2 0 100 4 2 2 0 000-4z"/>',
        "bridge": '<path d="M2 18h20v3H2zm2-2V8h3v3c3-4 7-4 10 0V8h3v8h-3c0-4-2-6-5-6s-5 2-5 6z"/>',
        "landscape": '<path d="M2 20l6-9 4 5 3-4 7 8z"/>',
        "groups": '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-5 3-8 6-8s6 3 6 8zm10 0c0-4 2-7 5-7s5 3 5 7z"/>',
        "event": '<path d="M5 3h2v2h10V3h2v2h3v17H2V5h3zm0 7v9h14v-9z"/>',
        "schedule": '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 6h2v6l4 2-1 2-5-3z"/>',
    }
    shape = symbols.get(name, symbols["photo_camera"])
    return (
        f'<g transform="translate({x - 12:.1f} {y - 12:.1f})" '
        f'fill="currentColor" color="#111111">{shape}</g>'
    )


def project_svg(project: Project) -> str:
    width, height = project.export.width, project.export.height
    min_lng, min_lat, max_lng, max_lat = _project_bounds(project)

    def point_xy(point) -> tuple[float, float]:
        x = (point.lng - min_lng) / (max_lng - min_lng) * width
        y = height - (point.lat - min_lat) / (max_lat - min_lat) * height
        return x, y

    route_points = " ".join(
        f"{x:.1f},{y:.1f}" for x, y in (point_xy(point) for point in project.route)
    )
    export_rotation = project.rotation + (
        project.export_boundary.rotation if project.export_boundary.enabled else 0
    )
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="100%" height="100%" fill="{project.palette.background}"/>',
        f'<g data-detail-level="{project.detail_level}" font-family="Arial, sans-serif" '
        f'transform="rotate({-export_rotation} {width / 2} {height / 2})">',
    ]
    for area in project.parking:
        points = " ".join(
            f"{x:.1f},{y:.1f}" for x, y in (point_xy(point) for point in area.coordinates)
        )
        parts.append(
            f'<polygon points="{points}" fill="{area.color}" fill-opacity="{area.opacity}" '
            f'stroke="{area.border_color}" stroke-width="4"/>'
        )
    if route_points:
        parts.append(
            f'<polyline points="{route_points}" fill="none" stroke="{project.palette.route}" '
            'stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>'
        )
    for index, poi in enumerate(project.pois):
        x, y = point_xy(poi.position)
        display_mode = poi.display_mode
        icon_mode = display_mode == "icon" or (
            display_mode == "auto" and project.poi_marker_mode == "icons"
        )
        if display_mode == "text":
            marker = (poi.short_text or poi.label or "POI")[:10]
        elif display_mode == "reference":
            marker = str(index + 1) if project.poi_marker_mode == "numbers" else chr(65 + index % 26)
        else:
            marker = (
                chr(65 + index % 26)
                if project.poi_marker_mode == "letters"
                else str(index + 1)
                if project.poi_marker_mode == "numbers"
                else ""
            )
        parts.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="25" fill="{poi.color}" stroke="#111111" stroke-width="4"/>'
        )
        if icon_mode:
            parts.append(_material_symbol_svg(poi.icon, x, y))
        else:
            font_size = 13 if display_mode == "text" else 26
            parts.append(
                f'<text x="{x:.1f}" y="{y + font_size / 3:.1f}" text-anchor="middle" font-size="{font_size}" '
                f'font-weight="700" fill="#111111">{escape(marker)}</text>'
            )
        if poi.show_label:
            parts.append(
                f'<text x="{x:.1f}" y="{y + 52:.1f}" text-anchor="middle" font-size="22" '
                f'font-weight="700" fill="{project.palette.text}">{escape(poi.label)}</text>'
            )
    parts.append("</g>")
    if project.legend.visible:
        legend_x = max(12, min(width - project.legend.width - 12, project.legend.position.get("x", 20)))
        legend_y = max(12, min(height - 80, project.legend.position.get("y", 20)))
        legend_height = max(70, 38 + len(project.pois) * 24)
        parts.append(
            f'<g transform="translate({legend_x:.1f} {legend_y:.1f})" font-family="Arial, sans-serif">'
            f'<rect width="{project.legend.width}" height="{legend_height}" rx="9" fill="#F7F5EF" '
            'fill-opacity=".94" stroke="#111111" stroke-opacity=".35"/>'
            '<text x="12" y="22" font-size="14" font-weight="700">Map key</text>'
        )
        for index, poi in enumerate(project.pois):
            y = 44 + index * 24
            legend_label = poi.label if poi.show_label else f"Point {index + 1}"
            parts.append(
                f'<circle cx="20" cy="{y - 4}" r="8" fill="{poi.color}" stroke="#111111" stroke-width="2"/>'
                f'<text x="36" y="{y}" font-size="12">{escape(legend_label)}</text>'
            )
        parts.append("</g>")
    if project.compass.visible:
        custom = project.compass.custom_position
        compass_x = custom.get("x", width - 75 if "right" in project.compass.position else 75)
        compass_y = custom.get("y", 75 if "top" in project.compass.position else height - 75)
        parts.append(
            f'<g transform="translate({compass_x} {compass_y}) rotate({-export_rotation})" '
            f'fill="{project.compass.color}" stroke="{project.compass.color}">'
            '<text x="0" y="-38" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">N</text>'
            '<path d="M0,-32 L10,5 L0,0 L-10,5 Z"/>'
            '<path d="M0,32 L-10,-5 L0,0 L10,-5 Z" fill="none" stroke-width="2"/>'
            '<circle cx="0" cy="0" r="4"/>'
            '</g>'
        )
    parts.append("</svg>")
    return "".join(parts)


def project_pdf(project: Project) -> bytes:
    width, height = project.export.width, project.export.height
    buffer = io.BytesIO()
    document = canvas.Canvas(buffer, pagesize=(width, height))
    document.setFillColor(HexColor(project.palette.background))
    document.rect(0, 0, width, height, stroke=0, fill=1)
    document.setFillColor(HexColor(project.palette.text))
    document.setFont("Helvetica-Bold", 28)
    document.drawString(40, height - 55, project.name)
    document.setFont("Helvetica", 16)
    document.drawString(
        40,
        height - 82,
        "Vector project export. Use the in-app PNG/PDF capture to include the basemap.",
    )
    document.setFont("Helvetica", 13)
    project_text = json.dumps(project_geojson(project), indent=2)
    text = document.beginText(40, height - 120)
    for line in project_text.splitlines()[:100]:
        text.textLine(line[:120])
    document.drawText(text)
    document.showPage()
    document.save()
    return buffer.getvalue()
