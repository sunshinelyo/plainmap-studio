import io
import zipfile

import pytest

from backend.file_import import parse_kml, parse_upload


KML = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Coffee</name>
      <Point><coordinates>-97.7431,30.2672,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Morning walk</name>
      <LineString>
        <coordinates>-97.7431,30.2672,0 -97.7400,30.2700,0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
"""


def test_parse_kml_returns_points_and_one_line():
    result = parse_kml(KML)
    assert [feature["geometry"]["type"] for feature in result["features"]] == [
        "Point",
        "LineString",
    ]
    assert result["features"][0]["properties"]["label"] == "Coffee"
    assert result["features"][1]["geometry"]["coordinates"][1] == [-97.74, 30.27]


def test_parse_kmz_prefers_doc_kml():
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("other.kml", "<kml />")
        archive.writestr("doc.kml", KML)

    result = parse_upload("walk.kmz", archive_bytes.getvalue())
    assert len(result["features"]) == 2


def test_rejects_unsupported_uploads():
    with pytest.raises(ValueError, match="KML or KMZ"):
        parse_upload("places.csv", b"")


def test_parse_multi_geometry_and_gx_track():
    result = parse_kml(
        b"""<kml xmlns="http://www.opengis.net/kml/2.2"
        xmlns:gx="http://www.google.com/kml/ext/2.2">
          <Placemark><name>Stops</name><MultiGeometry>
            <Point><coordinates>-97.1,30.1</coordinates></Point>
            <Point><coordinates>-97.2,30.2</coordinates></Point>
          </MultiGeometry></Placemark>
          <Placemark><name>Recorded walk</name><gx:Track>
            <gx:coord>-97.1 30.1 0</gx:coord>
            <gx:coord>-97.2 30.2 0</gx:coord>
          </gx:Track></Placemark>
        </kml>"""
    )
    assert [item["geometry"]["type"] for item in result["features"]] == [
        "Point",
        "Point",
        "LineString",
    ]


def test_parse_parking_polygon_with_inner_ring():
    result = parse_kml(
        b"""<kml><Document><Placemark><name>Visitor parking</name><Polygon>
          <outerBoundaryIs><LinearRing><coordinates>
            -97.3,30.1 -97.2,30.1 -97.2,30.2 -97.3,30.2
          </coordinates></LinearRing></outerBoundaryIs>
          <innerBoundaryIs><LinearRing><coordinates>
            -97.28,30.12 -97.24,30.12 -97.24,30.16 -97.28,30.16
          </coordinates></LinearRing></innerBoundaryIs>
        </Polygon></Placemark></Document></kml>"""
    )

    polygon = result["features"][0]
    assert polygon["geometry"]["type"] == "Polygon"
    assert polygon["properties"]["label"] == "Visitor parking"
    assert len(polygon["geometry"]["coordinates"]) == 2
    assert polygon["geometry"]["coordinates"][0][0] == polygon["geometry"]["coordinates"][0][-1]


def test_kml_without_supported_features_is_rejected():
    with pytest.raises(ValueError, match="parking polygons"):
        parse_kml(b"<kml><Document><Placemark><Polygon /></Placemark></Document></kml>")
