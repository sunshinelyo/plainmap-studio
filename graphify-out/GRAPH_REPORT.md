# Graph Report - .  (2026-06-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 92 nodes · 190 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e11cfc99`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]

## God Nodes (most connected - your core abstractions)
1. `parse_kml()` - 15 edges
2. `setMessage()` - 13 edges
3. `parse_upload()` - 9 edges
4. `setMode()` - 9 edges
5. `polygon_coordinates()` - 8 edges
6. `renderParking()` - 8 edges
7. `renderPois()` - 8 edges
8. `exportPng()` - 8 edges
9. `elements_named()` - 7 edges
10. `fitContent()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `test_parse_kmz_prefers_doc_kml()` --calls--> `parse_upload()`  [EXTRACTED]
  tests/test_file_import.py → backend/file_import.py
- `test_rejects_unsupported_uploads()` --calls--> `parse_upload()`  [EXTRACTED]
  tests/test_file_import.py → backend/file_import.py
- `test_kml_without_supported_features_is_rejected()` --calls--> `parse_kml()`  [EXTRACTED]
  tests/test_file_import.py → backend/file_import.py
- `test_parse_kml_returns_points_and_one_line()` --calls--> `parse_kml()`  [EXTRACTED]
  tests/test_file_import.py → backend/file_import.py
- `test_parse_multi_geometry_and_gx_track()` --calls--> `parse_kml()`  [EXTRACTED]
  tests/test_file_import.py → backend/file_import.py

## Import Cycles
- None detected.

## Communities (11 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.23
Nodes (21): Any, close_polygon_ring(), element_text(), elements_named(), feature(), first_descendant(), geometry_coordinates(), local_name() (+13 more)

### Community 1 - "Community 1"
Cohesion: 0.16
Nodes (18): addPoiAt(), cancelParkingDrawing(), deleteParking(), deletePoi(), downloadCanvas(), drawExportFeatures(), endPoiDrag(), exportPng() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.20
Nodes (7): elements, FRAME_INSET, map, movePoiDrag(), positionPoiOverlay(), state, updatePoiMapData()

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (8): createLegendCanvas(), drawCompass(), drawExportDecorations(), drawExportPin(), drawLegend(), drawLegendText(), legendItems(), roundedRect()

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (4): import_file(), index(), HTMLResponse, UploadFile

### Community 5 - "Community 5"
Cohesion: 0.40
Nodes (5): bestFrameCamera(), exportFramePadding(), fitContent(), parkingCoordinates(), visiblePoiCoordinates()

### Community 6 - "Community 6"
Cohesion: 0.40
Nodes (5): renderParking(), renderParkingList(), renderParkingMapData(), renderParkingMarkers(), selectParking()

### Community 7 - "Community 7"
Cohesion: 0.40
Nodes (5): renderRoute(), renderRouteMarkers(), updateOverlays(), updateParkingOverlay(), updateRouteOverlay()

### Community 8 - "Community 8"
Cohesion: 0.50
Nodes (3): First version, PlainMap Studio, Run locally

### Community 9 - "Community 9"
Cohesion: 0.67
Nodes (3): importFile(), loadFeatures(), renderAll()

## Knowledge Gaps
- **8 isolated node(s):** `UploadFile`, `HTMLResponse`, `state`, `FRAME_INSET`, `elements` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parse_upload()` connect `Community 0` to `Community 4`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `setMessage()` connect `Community 1` to `Community 9`, `Community 2`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `PlainMap Studio backend package.`, `UploadFile`, `HTMLResponse` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._