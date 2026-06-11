# Graph Report - .  (2026-06-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 78 nodes · 151 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4c241511`
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

## God Nodes (most connected - your core abstractions)
1. `parse_kml()` - 13 edges
2. `parse_upload()` - 9 edges
3. `setMessage()` - 9 edges
4. `renderPois()` - 8 edges
5. `exportPng()` - 8 edges
6. `elements_named()` - 6 edges
7. `fitContent()` - 6 edges
8. `drawLegend()` - 6 edges
9. `Element` - 5 edges
10. `element_text()` - 5 edges

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

## Communities (10 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.26
Nodes (17): Any, element_text(), elements_named(), feature(), first_descendant(), geometry_coordinates(), local_name(), parse_kml() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (8): bestFrameCamera(), elements, exportFramePadding(), fitContent(), FRAME_INSET, map, state, visiblePoiCoordinates()

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (9): addPoiAt(), deletePoi(), endPoiDrag(), pointFeature(), renderPoiList(), renderPoiOverlay(), renderPois(), selectPoi() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (4): import_file(), index(), HTMLResponse, UploadFile

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (7): finishDrawing(), importFile(), loadFeatures(), renderAll(), renderRoute(), renderRouteMarkers(), setMode()

### Community 5 - "Community 5"
Cohesion: 0.40
Nodes (6): createLegendCanvas(), drawExportPin(), drawLegend(), drawLegendText(), legendItems(), roundedRect()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (6): downloadCanvas(), drawCompass(), drawExportDecorations(), drawExportFeatures(), exportPng(), waitForMap()

### Community 7 - "Community 7"
Cohesion: 0.40
Nodes (5): movePoiDrag(), positionPoiOverlay(), updateOverlays(), updatePoiMapData(), updateRouteOverlay()

### Community 8 - "Community 8"
Cohesion: 0.50
Nodes (3): First version, PlainMap Studio, Run locally

## Knowledge Gaps
- **8 isolated node(s):** `UploadFile`, `HTMLResponse`, `state`, `FRAME_INSET`, `elements` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parse_upload()` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `import_file()` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `PlainMap Studio backend package.`, `UploadFile`, `HTMLResponse` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._