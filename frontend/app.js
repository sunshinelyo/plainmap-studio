const AUSTIN_PALETTE = {
  route: "#F5D61E",
  meeting: "#F5D61E",
  poi: "#F97316",
  parking: "#8E5AD7",
  overflow: "#4DA3FF",
  background: "#F7F5EF",
  text: "#111111",
};

const DEFAULT_PROJECT = {
  version: 4,
  project_id: null,
  owner_id: null,
  name: "Untitled map",
  center: { lat: 30.2672, lng: -97.7431 },
  zoom: 15,
  detail_level: "standard",
  poi_marker_mode: "letters",
  poi_simple_markers: false,
  workflow_stage: 0,
  quick_edit_mode: false,
  pois: [],
  route: [],
  route_mode: "straight",
  show_arrows: true,
  parking: [],
  palette: { ...AUSTIN_PALETTE },
  rotation: 0,
  orientation_mode: "north",
  compass: { visible: true, position: "top-right", size: 72, color: "#111111", locked: false, snap: true, custom_position: {} },
  legend: {
    visible: true,
    position: { x: 20, y: 20 },
    width: 190,
    height: 0,
    locked: false,
    snap: true,
    items: { meeting: true, parking: true, route: true, photoStops: true, arrows: true },
  },
  export: { preset: "portrait", width: 1080, height: 1350 },
  export_boundary: {
    enabled: true,
    visible: true,
    center: { lat: 30.2672, lng: -97.7431 },
    width: 320,
    height: 400,
    rotation: 0,
    aspect_ratio: 0.8,
    lock_aspect: true,
    bounds: {},
  },
  imported_features: { type: "FeatureCollection", features: [] },
  imported_layers: [],
};

const paletteLabels = {
  route: "Route",
  meeting: "Meeting point",
  poi: "POI marker",
  parking: "Parking",
  overflow: "Overflow",
  background: "Background tint",
  text: "Text",
};

const categoryOptions = [
  ["photo-stop", "Photo stop"],
  ["meeting-point", "Meeting point"],
  ["restroom", "Restroom"],
  ["landmark", "Landmark"],
  ["parking", "Parking"],
  ["train", "Train"],
  ["food", "Food"],
  ["other", "Other"],
];
const categoryDefaults = {
  "photo-stop": { color: "#F97316", icon: "photo_camera" },
  "meeting-point": { color: "#F5D61E", icon: "groups" },
  parking: { color: "#8E5AD7", icon: "local_parking" },
  train: { color: "#4DA3FF", icon: "train" },
  food: { color: "#E24A3B", icon: "restaurant" },
  restroom: { color: "#2AA198", icon: "wc" },
  landmark: { color: "#6B8E23", icon: "landscape" },
  other: { color: "#F97316", icon: "location_on" },
};
const workflowStages = [
  "Import / Create Map", "Configure Base Map", "Add Points of Interest", "Build / Edit Route",
  "Configure Parking", "Customize Appearance", "Configure Export", "Review & Export",
];

const materialIcons = [
  "photo_camera",
  "location_on",
  "local_parking",
  "directions_walk",
  "restaurant",
  "wc",
  "water_drop",
  "park",
  "train",
  "bridge",
  "landscape",
  "groups",
  "event",
  "schedule",
];
const legacyIconNames = {
  camera: "photo_camera",
  pin: "location_on",
  star: "landscape",
  food: "restaurant",
  restroom: "wc",
  meeting: "groups",
};
const exportPresets = {
  square: { width: 1080, height: 1080, label: "1:1" },
  portrait: { width: 1080, height: 1350, label: "4:5" },
  story: { width: 1080, height: 1920, label: "9:16" },
  widescreen: { width: 1920, height: 1080, label: "16:9" },
  landscape: { width: 1600, height: 1200, label: "4:3" },
  vertical: { width: 1200, height: 1600, label: "3:4" },
  "photo-portrait": { width: 1200, height: 1800, label: "2:3" },
};
const legacyExportPresets = {
  "instagram-square": "square",
  "instagram-portrait": "portrait",
  "instagram-story": "story",
};
const API_BASE_URL = String(window.PLAINMAP_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path) => `${API_BASE_URL}${path}`;

let project = structuredClone(DEFAULT_PROJECT);
let map;
let draw;
let poiMarkers = new Map();
let parkingLabelMarkers = new Map();
let routeEditMarkers = [];
let selectedRouteVertex = null;
let routeEditMode = false;
const expandedPoiIds = new Set();
let drawPurpose = null;
let activeParkingEditId = null;
let baseLayerVisibility = new Map();
let styleReady = false;
let toastTimer;
let boundaryInteraction = null;
let pendingImportFile = null;
let routeUndoStack = [];
let routeRedoStack = [];
let lastSavedRoute = [];

const el = (id) => document.getElementById(id);
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const letters = (index) => {
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
};
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));
const normalizeMaterialIcon = (name) => {
  const normalized = legacyIconNames[name] || name;
  return materialIcons.includes(normalized) ? normalized : "photo_camera";
};
const pointFeature = (coordinates, properties = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates },
});

function renderWorkflow() {
  el("current-stage-label").textContent = `${project.workflow_stage + 1}. ${workflowStages[project.workflow_stage]}`;
  el("workflow-steps").innerHTML = workflowStages.map((label, index) => `
    <button type="button" data-workflow-stage="${index}"
      class="${index === project.workflow_stage ? "active" : ""} ${index < project.workflow_stage ? "complete" : ""}"
      ${index > project.workflow_stage && !project.quick_edit_mode ? "disabled" : ""}
      title="${escapeHtml(label)}">${index + 1}</button>
  `).join("");
  el("quick-edit-mode").checked = project.quick_edit_mode;
  document.body.classList.toggle("quick-edit", project.quick_edit_mode);
  document.querySelectorAll(".sidebar details[data-stage]").forEach((section) => {
    const stages = section.dataset.stage.split(",").map(Number);
    section.hidden = !project.quick_edit_mode && !stages.includes(project.workflow_stage);
    if (!section.hidden && !project.quick_edit_mode) section.open = true;
  });
  el("previous-stage").disabled = project.workflow_stage === 0;
  el("next-stage").disabled = project.workflow_stage === workflowStages.length - 1;
  el("next-stage").textContent = project.workflow_stage === workflowStages.length - 2 ? "Review map" : "Next step";
  const review = el("review-summary");
  review.hidden = project.workflow_stage !== 7 || project.quick_edit_mode;
  review.innerHTML = `
    <strong>Ready to export</strong>
    <span>${project.pois.length} POIs · ${project.route.length} route vertices · ${project.parking.length} parking areas</span>
    ${project.route.length < 2 ? "<span class=\"review-warning\">No complete route yet.</span>" : ""}
  `;
}

function setWorkflowStage(stage) {
  project.workflow_stage = Math.max(0, Math.min(workflowStages.length - 1, Number(stage)));
  renderWorkflow();
}
const featureCollection = (features = []) => ({ type: "FeatureCollection", features });

function showToast(message) {
  el("toast").textContent = message;
  el("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el("toast").classList.remove("visible"), 2800);
}

function setStatus(message) {
  el("map-status").textContent = message;
}

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [project.center.lng, project.center.lat],
    zoom: project.zoom,
    minZoom: 10,
    maxZoom: 20,
    bearing: project.rotation,
    attributionControl: true,
    preserveDrawingBuffer: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  draw = new MapboxDraw({
    displayControlsDefault: false,
    styles: drawStyles(),
  });
  map.addControl(draw);

  map.on("load", () => {
    styleReady = true;
    rememberBaseLayerVisibility();
    addProjectSourcesAndLayers();
    applyDetailLevel(project.detail_level);
    renderAll();
    map.once("idle", () => renderExportBoundary(false));
  });
  map.on("styledata", () => {
    if (styleReady && !map.getSource("plainmap-route")) {
      rememberBaseLayerVisibility();
      addProjectSourcesAndLayers();
      renderAll();
    }
  });
  map.on("moveend", () => {
    syncCameraState();
    syncZoomControls();
    updateBoundaryGeography();
  });
  map.on("zoom", syncZoomControls);
  map.on("resize", () => renderExportBoundary(false));
  map.on("rotate", () => {
    project.rotation = normalizeBearing(map.getBearing());
    el("rotation-slider").value = project.rotation;
    el("rotation-output").value = `${Math.round(project.rotation)}°`;
    renderCompass();
  });
  map.on("dblclick", (event) => {
    event.preventDefault();
    addPoi({ lat: event.lngLat.lat, lng: event.lngLat.lng });
  });
  map.on("draw.create", handleDrawCreate);
  map.on("draw.update", handleDrawUpdate);
  map.on("draw.delete", handleDrawDelete);
  map.on("click", "plainmap-route-line", handleRouteLineClick);
  map.on("mouseenter", "plainmap-route-line", () => {
    if (routeEditMode) map.getCanvas().style.cursor = "crosshair";
  });
  map.on("mouseleave", "plainmap-route-line", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "plainmap-imported-fill", handleImportedPolygonClick);
}

function drawStyles() {
  return [
    {
      id: "gl-draw-polygon-fill",
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"]],
      paint: { "fill-color": project.palette.parking, "fill-opacity": 0.28 },
    },
    {
      id: "gl-draw-lines",
      type: "line",
      filter: ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": project.palette.route, "line-width": 5 },
    },
    {
      id: "gl-draw-points",
      type: "circle",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#111111",
        "circle-stroke-width": 2,
      },
    },
  ];
}

function rememberBaseLayerVisibility() {
  baseLayerVisibility.clear();
  for (const layer of map.getStyle().layers || []) {
    if (layer.id.startsWith("plainmap-") || layer.id.startsWith("gl-draw-")) continue;
    baseLayerVisibility.set(layer.id, layer.layout?.visibility || "visible");
  }
}

function layerDescriptor(layer) {
  return `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
}

function applyDetailLevel(level) {
  if (!styleReady) return;
  project.detail_level = level;

  /*
   * OpenFreeMap is vector-based, so detail modes change real style-layer
   * visibility instead of fading a finished raster image. Layer names differ
   * between styles; these semantic groups intentionally match both layer ids
   * and source-layer names. Detailed restores the style's original visibility.
   */
  const usefulLabels = /(water|park|natural|place|city|town|village|state|country|road|street|motorway|trunk|primary|path|trail)/;
  const majorMinimalLabels = /(water|park|place|city|town|state|country|motorway|trunk|primary|path|trail)/;
  const clutter = /(poi|amenity|shop|restaurant|cafe|bar|business|commercial|transit|station|bus|rail|airport|housenumber|address)/;

  for (const layer of map.getStyle().layers || []) {
    if (!baseLayerVisibility.has(layer.id)) continue;
    let visibility = baseLayerVisibility.get(layer.id);
    if (layer.type === "symbol" && level !== "detailed") {
      const descriptor = layerDescriptor(layer);
      if (level === "standard") {
        visibility = clutter.test(descriptor) && !usefulLabels.test(descriptor) ? "none" : visibility;
      } else {
        visibility = majorMinimalLabels.test(descriptor) && !clutter.test(descriptor) ? visibility : "none";
      }
    }
    map.setLayoutProperty(layer.id, "visibility", visibility);
  }
  const mapFrame = el("map-frame");
  mapFrame.className = `map-frame detail-${level}`;
  mapFrame.dataset.hiddenBaseLayers = String(
    [...baseLayerVisibility.keys()].filter((id) => map.getLayoutProperty(id, "visibility") === "none").length
  );
}

function addProjectSourcesAndLayers() {
  map.addSource("plainmap-route", { type: "geojson", data: routeGeoJSON() });
  map.addLayer({
    id: "plainmap-route-line",
    type: "line",
    source: "plainmap-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": project.palette.route,
      "line-width": 8,
      "line-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "plainmap-route-arrows",
    type: "symbol",
    source: "plainmap-route",
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 80,
      "text-field": "▶",
      "text-size": 15,
      "text-keep-upright": false,
      visibility: project.show_arrows ? "visible" : "none",
    },
    paint: {
      "text-color": project.palette.text,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1,
    },
  });

  map.addSource("plainmap-parking", { type: "geojson", data: parkingGeoJSON() });
  map.addLayer({
    id: "plainmap-parking-fill",
    type: "fill",
    source: "plainmap-parking",
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["get", "opacity"],
    },
  });
  map.addLayer({
    id: "plainmap-parking-line",
    type: "line",
    source: "plainmap-parking",
    paint: { "line-color": ["get", "borderColor"], "line-width": 3 },
  });

  map.addSource("plainmap-imported", { type: "geojson", data: importedLayerGeoJSON() });
  map.addLayer({
    id: "plainmap-imported-fill",
    type: "fill",
    source: "plainmap-imported",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#a8c99b", "fill-opacity": 0.25 },
  });
  map.addLayer({
    id: "plainmap-imported-line",
    type: "line",
    source: "plainmap-imported",
    filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
    paint: { "line-color": project.palette.route, "line-width": 4, "line-opacity": 0.75 },
  });
  map.addLayer({
    id: "plainmap-imported-points",
    type: "circle",
    source: "plainmap-imported",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": project.palette.poi,
      "circle-stroke-color": project.palette.text,
      "circle-stroke-width": 2,
    },
  });
}

function syncCameraState() {
  const center = map.getCenter();
  project.center = { lat: center.lat, lng: center.lng };
  project.zoom = map.getZoom();
  project.rotation = normalizeBearing(map.getBearing());
}

function syncZoomControls() {
  if (!map) return;
  const zoom = Math.max(10, Math.min(20, map.getZoom()));
  project.zoom = zoom;
  el("zoom-number").value = zoom.toFixed(1);
  el("zoom-slider").value = zoom;
}

function setMapZoom(value) {
  const zoom = Math.max(10, Math.min(20, Number(value)));
  if (!Number.isFinite(zoom)) return;
  map.easeTo({ zoom, duration: 180 });
  el("zoom-number").value = zoom.toFixed(1);
  el("zoom-slider").value = zoom;
}

function normalizeBearing(value) {
  let bearing = Number(value);
  while (bearing > 180) bearing -= 360;
  while (bearing < -180) bearing += 360;
  return bearing;
}

function routeGeoJSON() {
  return featureCollection(project.route.length > 1 ? [{
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: project.route.map((point) => [point.lng, point.lat]),
    },
  }] : []);
}

function parkingGeoJSON() {
  return featureCollection(project.parking.map((area) => {
    const ring = area.coordinates.map((point) => [point.lng, point.lat]);
    if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
      ring.push([...ring[0]]);
    }
    return {
      type: "Feature",
      properties: {
        id: area.id,
        color: area.color,
        opacity: area.opacity,
        borderColor: area.border_color,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  }));
}

function markerText(poi, index) {
  const mode = poi.display_mode || "auto";
  if (mode === "text") return String(poi.short_text || poi.label || "POI").slice(0, 10);
  if (mode === "icon") return normalizeMaterialIcon(poi.icon);
  if (mode === "reference") return project.poi_marker_mode === "numbers" ? String(index + 1) : letters(index);
  if (project.poi_marker_mode === "numbers") return String(index + 1);
  if (project.poi_marker_mode === "icons") return normalizeMaterialIcon(poi.icon);
  return letters(index);
}

function markerContent(poi, index) {
  const value = markerText(poi, index);
  const iconMode = poi.display_mode === "icon" || (poi.display_mode === "auto" && project.poi_marker_mode === "icons");
  return iconMode
    ? `<span class="material-symbols-outlined">${escapeHtml(value)}</span>`
    : `<span class="${poi.display_mode === "text" ? "short-text" : ""}">${escapeHtml(value)}</span>`;
}

function markerPreview(poi, index) {
  if (project.poi_simple_markers) {
    return `<span class="marker-preview marker-preview-dot" style="--poi-color:${poi.color}"></span>`;
  }
  return `
    <span class="marker-preview marker-preview-pin ${(poi.display_mode === "icon" || (poi.display_mode === "auto" && project.poi_marker_mode === "icons")) ? "icon-mode" : ""}"
      style="--poi-color:${poi.color}">
      ${markerContent(poi, index)}
    </span>
  `;
}

function markerElement(poi, index) {
  const root = document.createElement("div");
  root.className = project.poi_simple_markers
    ? "plain-poi-marker plain-poi-marker-test"
    : "plain-poi-marker";
  root.dataset.poiId = poi.id;
  /*
   * MapLibre applies its translate transform to this fixed-size, absolutely
   * positioned root. The pin tip is the root's bottom center, so anchor: bottom
   * locks the tip to this POI's own longitude/latitude. Do not make this root
   * relative/static: that overrides MapLibre's marker positioning and causes
   * later markers to accumulate layout offsets from earlier markers.
   */
  if (project.poi_simple_markers) {
    root.innerHTML = `<span class="poi-native-test-dot" style="--poi-color:${poi.color}" aria-hidden="true"></span>`;
    return root;
  }
  root.innerHTML = `
    <div class="poi-pin ${(poi.display_mode === "icon" || (poi.display_mode === "auto" && project.poi_marker_mode === "icons")) ? "icon-mode" : ""}">
      <svg class="poi-pin-svg" viewBox="0 0 40 52" aria-hidden="true">
        <path d="M20 1.5C9.5 1.5 2 9.2 2 19.5C2 33 20 52 20 52S38 33 38 19.5C38 9.2 30.5 1.5 20 1.5Z"
          fill="${poi.color}" stroke="#111111" stroke-width="3"/>
      </svg>
      ${markerContent(poi, index)}
    </div>
    ${poi.show_label ? `<b class="poi-label">${escapeHtml(poi.label)}</b>` : ""}
  `;
  return root;
}

function addPoi(latlng, overrides = {}) {
  const index = project.pois.length;
  project.pois.push({
    id: uuid(),
    position: { lat: Number(latlng.lat), lng: Number(latlng.lng) },
    label: overrides.label || `Stop ${letters(index)}`,
    description: overrides.description || "",
    marker: letters(index),
    category: overrides.category || "photo-stop",
    icon: normalizeMaterialIcon(overrides.icon || "photo_camera"),
    color: overrides.color || project.palette.poi,
    display_mode: overrides.display_mode || "auto",
    short_text: overrides.short_text || "",
    use_category_defaults: overrides.use_category_defaults !== false,
    selected: true,
    show_label: true,
  });
  renderPois();
  renderLegend();
}

function renderPois() {
  if (!map) return;
  poiMarkers.forEach((marker) => marker.remove());
  poiMarkers.clear();
  project.pois.forEach((poi, index) => {
    poi.marker = project.poi_marker_mode === "numbers" ? String(index + 1) : letters(index);
    const marker = new maplibregl.Marker({
      element: markerElement(poi, index),
      draggable: true,
      anchor: project.poi_simple_markers ? "center" : "bottom",
      offset: [0, 0],
    })
      .setLngLat([poi.position.lng, poi.position.lat])
      .setPopup(new maplibregl.Popup({ offset: 28 }).setHTML(
        `<strong>${escapeHtml(poi.label)}</strong><br>${escapeHtml(poi.description)}`
      ))
      .addTo(map);
    marker.on("dragend", () => {
      const position = marker.getLngLat();
      poi.position = { lat: position.lat, lng: position.lng };
      renderPoiList();
      if (project.route_mode !== "manual") buildRoute(false);
      fetchNearbySuggestions(poi.id);
    });
    poiMarkers.set(poi.id, marker);
  });
  renderPoiList();
}

function renderPoiList() {
  el("poi-count").textContent = project.pois.length;
  el("poi-list").innerHTML = project.pois.map((poi, index) => {
    const expanded = expandedPoiIds.has(poi.id);
    const categoryLabel = categoryOptions.find(([value]) => value === poi.category)?.[1] || "Other";
    return `
      <article class="editor-card ${expanded ? "expanded" : "collapsed"}" data-id="${poi.id}">
        <div class="editor-card-header" data-expanded="${expanded}">
          <span class="drag-handle" title="Drag to reorder">::</span>
          ${markerPreview(poi, index)}
          <span class="poi-card-summary">
            <strong>${escapeHtml(poi.label)}</strong>
            <small>${escapeHtml(categoryLabel)} · ${poi.position.lat.toFixed(4)}, ${poi.position.lng.toFixed(4)}</small>
          </span>
          <label class="compact-check" title="Include in route">
            <input data-field="selected" type="checkbox" ${poi.selected ? "checked" : ""}>
            <span>Route</span>
          </label>
          <label class="compact-check" title="Show label">
            <input data-field="show_label" type="checkbox" ${poi.show_label ? "checked" : ""}>
            <span>Label</span>
          </label>
          <button class="icon-button toggle-poi" type="button" title="${expanded ? "Collapse POI" : "Expand POI"}"
            aria-label="${expanded ? "Collapse POI" : "Expand POI"}" aria-expanded="${expanded}">${expanded ? "▴" : "▾"}</button>
          <button class="icon-button delete-poi" type="button" title="Delete POI">x</button>
        </div>
        <div class="poi-card-details" ${expanded ? "" : "hidden"}>
          <label>Label <input data-field="label" value="${escapeHtml(poi.label)}"></label>
          <label>Description <textarea data-field="description">${escapeHtml(poi.description)}</textarea></label>
          <div class="coordinate-grid">
            <label>Latitude <input data-coordinate="lat" type="number" min="-90" max="90" step="any" value="${poi.position.lat.toFixed(6)}"></label>
            <label>Longitude <input data-coordinate="lng" type="number" min="-180" max="180" step="any" value="${poi.position.lng.toFixed(6)}"></label>
          </div>
          <div class="coordinate-error" aria-live="polite"></div>
          <label>Suggest nearby POIs
            <select class="nearby-select" data-nearby="${poi.id}">
              <option value="">Load nearby suggestions...</option>
            </select>
          </label>
          <div class="mini-grid">
            <label>Marker display
              <select data-field="display_mode">
                <option value="auto" ${poi.display_mode === "auto" ? "selected" : ""}>Project default</option>
                <option value="icon" ${poi.display_mode === "icon" ? "selected" : ""}>Icon</option>
                <option value="text" ${poi.display_mode === "text" ? "selected" : ""}>Short Text</option>
                <option value="reference" ${poi.display_mode === "reference" ? "selected" : ""}>Letter / Number</option>
              </select>
            </label>
            <label>Short text
              <input data-field="short_text" maxlength="10" placeholder="Bridge" value="${escapeHtml(poi.short_text || "")}">
            </label>
          </div>
          <div class="mini-grid">
            <label>Category
              <select data-field="category">
                ${categoryOptions.map(([value, label]) => `<option value="${value}" ${poi.category === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label>Icon
              <select data-field="icon">
                ${materialIcons.map((icon) => `<option value="${icon}" ${normalizeMaterialIcon(poi.icon) === icon ? "selected" : ""}>${icon}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="check-row"><input data-field="use_category_defaults" type="checkbox" ${poi.use_category_defaults !== false ? "checked" : ""}> Use category defaults</label>
          <div class="mini-grid">
            <label>Color <input data-field="color" type="color" value="${poi.color}"></label>
            <label class="check-row"><input data-field="selected" type="checkbox" ${poi.selected ? "checked" : ""}> Include in route</label>
          </div>
          <label class="check-row"><input data-field="show_label" type="checkbox" ${poi.show_label ? "checked" : ""}> Show label</label>
        </div>
      </article>
    `;
  }).join("");
}

function bindPoiList() {
  el("poi-list").addEventListener("input", (event) => {
    const coordinate = event.target.dataset.coordinate;
    const card = event.target.closest(".editor-card");
    const poi = card && project.pois.find((item) => item.id === card.dataset.id);
    if (!poi) return;
    if (event.target.dataset.field === "short_text") {
      poi.short_text = event.target.value.slice(0, 10);
      const markerValue = markerText(poi, project.pois.indexOf(poi));
      const mapValue = poiMarkers.get(poi.id)?.getElement().querySelector(".poi-pin > span");
      if (mapValue) mapValue.textContent = markerValue;
      const previewValue = card.querySelector(".marker-preview > span");
      if (previewValue) previewValue.textContent = markerValue;
      renderLegend();
      return;
    }
    if (!coordinate) return;
    applyCoordinateInput(event.target, card, poi, coordinate);
  });
  el("poi-list").addEventListener("change", async (event) => {
    const card = event.target.closest(".editor-card");
    if (!card) return;
    const poi = project.pois.find((item) => item.id === card.dataset.id);
    if (!poi) return;

    const coordinate = event.target.dataset.coordinate;
    if (coordinate) {
      if (applyCoordinateInput(event.target, card, poi, coordinate)) {
        await fetchNearbySuggestions(poi.id);
      }
      return;
    }

    if (event.target.matches(".nearby-select")) {
      if (!event.target.value) {
        await fetchNearbySuggestions(poi.id);
        return;
      }
      const suggestion = JSON.parse(event.target.value);
      poi.label = suggestion.name;
      poi.position = { lat: suggestion.lat, lng: suggestion.lng };
      renderPois();
      if (project.route_mode !== "manual") buildRoute(false);
      return;
    }

    const field = event.target.dataset.field;
    if (!field) return;
    poi[field] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    if (field === "category" && poi.use_category_defaults !== false) {
      const defaults = categoryDefaults[poi.category] || categoryDefaults.other;
      poi.color = defaults.color;
      poi.icon = defaults.icon;
    }
    if (["color", "icon"].includes(field)) poi.use_category_defaults = false;
    if (field === "use_category_defaults" && poi.use_category_defaults) {
      const defaults = categoryDefaults[poi.category] || categoryDefaults.other;
      poi.color = defaults.color;
      poi.icon = defaults.icon;
    }
    renderPois();
    renderLegend();
    if (project.route_mode !== "manual" && field === "selected") buildRoute(false);
  });
  el("poi-list").addEventListener("click", async (event) => {
    const select = event.target.closest(".nearby-select");
    if (select && select.options.length === 1) {
      await fetchNearbySuggestions(select.dataset.nearby);
      return;
    }
    const card = event.target.closest(".editor-card");
    if (!card) return;
    if (event.target.closest(".delete-poi")) {
      expandedPoiIds.delete(card.dataset.id);
      project.pois = project.pois.filter((item) => item.id !== card.dataset.id);
      renderPois();
      if (project.route_mode !== "manual") buildRoute(false);
      return;
    }
    const header = event.target.closest(".editor-card-header");
    if (!header || event.target.closest("input, label, .drag-handle")) return;
    togglePoiCard(card.dataset.id);
  });
  new Sortable(el("poi-list"), {
    handle: ".drag-handle",
    animation: 130,
    onEnd: (event) => {
      const [moved] = project.pois.splice(event.oldIndex, 1);
      project.pois.splice(event.newIndex, 0, moved);
      renderPois();
      if (project.route_mode !== "manual") buildRoute(false);
    },
  });
}

function togglePoiCard(poiId) {
  if (expandedPoiIds.has(poiId)) expandedPoiIds.delete(poiId);
  else expandedPoiIds.add(poiId);
  renderPoiList();
}

function applyCoordinateInput(input, card, poi, coordinate) {
  const value = Number(input.value);
  const valid = Number.isFinite(value) && (
    coordinate === "lat" ? value >= -90 && value <= 90 : value >= -180 && value <= 180
  );
  card.querySelector(".coordinate-error").textContent = valid
    ? ""
    : `${coordinate === "lat" ? "Latitude" : "Longitude"} is outside its valid range.`;
  input.classList.toggle("invalid", !valid);
  if (!valid) return false;
  poi.position[coordinate] = value;
  poiMarkers.get(poi.id)?.setLngLat([poi.position.lng, poi.position.lat]);
  if (project.route_mode !== "manual") buildRoute(false);
  return true;
}

async function fetchNearbySuggestions(poiId) {
  const poi = project.pois.find((item) => item.id === poiId);
  const select = document.querySelector(`[data-nearby="${CSS.escape(poiId)}"]`);
  if (!poi || !select) return;
  select.innerHTML = `<option value="">Loading nearby places...</option>`;
  try {
    const response = await fetch(apiUrl(`/api/nearby?lat=${poi.position.lat}&lng=${poi.position.lng}`));
    if (!response.ok) throw new Error("Nearby service unavailable");
    const suggestions = await response.json();
    select.innerHTML = `<option value="">Choose a nearby place</option>${suggestions.map((item) => (
      `<option value="${escapeHtml(JSON.stringify(item))}">${escapeHtml(item.name)} · ${escapeHtml(item.category)}</option>`
    )).join("")}`;
    if (!suggestions.length) select.innerHTML = `<option value="">No named places found nearby</option>`;
  } catch {
    select.innerHTML = `<option value="">Suggestions unavailable; manual entry still works</option>`;
  }
}

async function buildRoute(notify = true) {
  clearRouteEditHandles();
  recordRouteState();
  const selected = project.pois.filter((poi) => poi.selected).map((poi) => poi.position);
  if (project.route_mode === "manual") {
    drawPurpose = "route";
    draw.changeMode("draw_line_string");
    setStatus("Click map to draw route; double-click to finish");
    return;
  }
  if (selected.length < 2) {
    project.route = selected;
    renderRoute();
    if (notify) showToast("Select at least two POIs for a route");
    return;
  }
  if (project.route_mode === "walking") {
    setStatus("Finding walking route...");
    try {
      const response = await fetch(apiUrl("/api/route/walking"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: selected }),
      });
      if (!response.ok) throw new Error();
      project.route = (await response.json()).coordinates;
    } catch {
      project.route = selected;
      showToast("Walking route unavailable; using straight lines");
    }
  } else {
    project.route = selected;
  }
  renderRoute();
  setStatus("Ready");
  if (notify) showToast("Route updated");
}

function cloneRoute(route = project.route) {
  return route.map((point) => ({ lat: point.lat, lng: point.lng }));
}

function recordRouteState() {
  routeUndoStack.push(cloneRoute());
  if (routeUndoStack.length > 50) routeUndoStack.shift();
  routeRedoStack = [];
  updateRouteHistoryControls();
}

function restoreRoute(route) {
  project.route = cloneRoute(route);
  selectedRouteVertex = null;
  renderRoute();
  updateRouteHistoryControls();
}

function undoRoute() {
  if (!routeUndoStack.length) return;
  routeRedoStack.push(cloneRoute());
  restoreRoute(routeUndoStack.pop());
}

function redoRoute() {
  if (!routeRedoStack.length) return;
  routeUndoStack.push(cloneRoute());
  restoreRoute(routeRedoStack.pop());
}

function updateRouteHistoryControls() {
  el("undo-route").disabled = routeUndoStack.length === 0;
  el("redo-route").disabled = routeRedoStack.length === 0;
  el("revert-route").disabled = lastSavedRoute.length === 0;
}

function renderRoute() {
  if (!styleReady) return;
  map.getSource("plainmap-route")?.setData(routeGeoJSON());
  map.setPaintProperty("plainmap-route-line", "line-color", project.palette.route);
  map.setLayoutProperty("plainmap-route-arrows", "visibility", project.show_arrows ? "visible" : "none");
  if (routeEditMode) renderRouteEditHandles();
  renderLegend();
}

function toggleRouteEditMode(force) {
  routeEditMode = typeof force === "boolean" ? force : !routeEditMode;
  el("edit-route").textContent = `Edit mode: ${routeEditMode ? "on" : "off"}`;
  el("edit-route").classList.toggle("active", routeEditMode);
  el("route-edit-help").innerHTML = routeEditMode
    ? "<strong>Editing mode:</strong> drag a large handle to move it, click the route to add a vertex, or right-click/select + Delete to remove one."
    : "<strong>Viewing mode:</strong> your route is protected. Turn on Edit Mode to reveal large vertex handles.";
  if (routeEditMode) {
    if (project.route.length < 2) {
      routeEditMode = false;
      el("edit-route").textContent = "Edit mode: off";
      return showToast("Build a route first");
    }
    renderRouteEditHandles();
    showToast("Route edit mode enabled");
  } else {
    clearRouteEditHandles();
  }
}

function renderRouteEditHandles() {
  clearRouteEditHandles(false);
  project.route.forEach((point, index) => {
    const node = document.createElement("button");
    node.className = `route-vertex ${selectedRouteVertex === index ? "selected" : ""}`;
    node.type = "button";
    node.title = `Route vertex ${index + 1}`;
    node.dataset.vertexIndex = String(index);
    const selectVertex = (event) => {
      event.stopPropagation();
      selectedRouteVertex = index;
      routeEditMarkers.forEach((entry) => entry.getElement().classList.remove("selected"));
      node.classList.add("selected");
      node.focus();
    };
    node.addEventListener("click", selectVertex);
    node.addEventListener("pointerup", selectVertex);
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      deleteRouteVertex(index);
    });
    // Circular edit handles are anchored at their center; POI pins use their
    // bottom-center tip above. Both positions are owned by MapLibre.
    const marker = new maplibregl.Marker({
      element: node,
      draggable: true,
      anchor: "center",
      offset: [0, 0],
    })
      .setLngLat([point.lng, point.lat])
      .addTo(map);
    marker.on("dragend", () => {
      recordRouteState();
      const location = marker.getLngLat();
      project.route[index] = { lat: location.lat, lng: location.lng };
      renderRoute();
    });
    routeEditMarkers.push(marker);
  });
}

function clearRouteEditHandles(disable = true) {
  routeEditMarkers.forEach((marker) => marker.remove());
  routeEditMarkers = [];
  selectedRouteVertex = null;
  if (disable) {
    routeEditMode = false;
    el("edit-route").textContent = "Edit mode: off";
    el("edit-route").classList.remove("active");
  }
}

function deleteRouteVertex(index) {
  if (project.route.length <= 2) {
    showToast("A route needs at least two vertices");
    return;
  }
  recordRouteState();
  project.route.splice(index, 1);
  selectedRouteVertex = null;
  renderRoute();
}

function handleRouteLineClick(event) {
  if (!routeEditMode || project.route.length < 2) return;
  const clicked = map.project(event.lngLat);
  let insertAt = 1;
  let closest = Infinity;
  for (let index = 0; index < project.route.length - 1; index += 1) {
    const a = map.project([project.route[index].lng, project.route[index].lat]);
    const b = map.project([project.route[index + 1].lng, project.route[index + 1].lat]);
    const distance = distanceToSegment(clicked, a, b);
    if (distance < closest) {
      closest = distance;
      insertAt = index + 1;
    }
  }
  recordRouteState();
  project.route.splice(insertAt, 0, { lat: event.lngLat.lat, lng: event.lngLat.lng });
  selectedRouteVertex = insertAt;
  renderRoute();
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function handleDrawCreate(event) {
  const feature = event.features[0];
  draw.delete(feature.id);
  if (drawPurpose === "route" && feature.geometry.type === "LineString") {
    recordRouteState();
    project.route = feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    project.route_mode = "manual";
    el("route-mode").value = "manual";
    renderRoute();
    showToast("Manual route added");
  } else if (drawPurpose === "parking" && feature.geometry.type === "Polygon") {
    project.parking.push({
      id: uuid(),
      label: `Parking ${project.parking.length + 1}`,
      kind: "recommended",
      coordinates: feature.geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng })),
      color: project.palette.parking,
      opacity: 0.35,
      border_color: "#6F3EB8",
      show_icon: true,
    });
    renderParking();
    showToast("Parking area added");
  }
  drawPurpose = null;
  setStatus("Ready");
}

function handleDrawUpdate(event) {
  if (!activeParkingEditId) return;
  const feature = event.features[0];
  const area = project.parking.find((item) => item.id === activeParkingEditId);
  if (area && feature.geometry.type === "Polygon") {
    area.coordinates = feature.geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
    renderParking(false);
  }
}

function handleDrawDelete() {
  if (activeParkingEditId) {
    project.parking = project.parking.filter((area) => area.id !== activeParkingEditId);
    activeParkingEditId = null;
    renderParking();
  }
}

function renderParking(refreshEditor = true) {
  if (!styleReady) return;
  map.getSource("plainmap-parking")?.setData(parkingGeoJSON());
  parkingLabelMarkers.forEach((marker) => marker.remove());
  parkingLabelMarkers.clear();
  project.parking.forEach((area) => {
    if (!area.show_icon || !area.coordinates.length) return;
    const center = area.coordinates.reduce(
      (sum, point) => ({ lat: sum.lat + point.lat / area.coordinates.length, lng: sum.lng + point.lng / area.coordinates.length }),
      { lat: 0, lng: 0 }
    );
    const node = document.createElement("div");
    node.className = "parking-map-label";
    node.style.color = area.border_color;
    node.innerHTML = `<span class="material-symbols-outlined">local_parking</span> ${escapeHtml(area.label)}`;
    parkingLabelMarkers.set(area.id, new maplibregl.Marker({ element: node })
      .setLngLat([center.lng, center.lat])
      .addTo(map));
  });
  if (refreshEditor) renderParkingList();
  renderLegend();
}

function renderParkingList() {
  el("parking-list").innerHTML = project.parking.map((area) => `
    <article class="editor-card" data-id="${area.id}">
      <div class="editor-card-header">
        <span class="marker-preview" style="background:${area.color}"><span class="material-symbols-outlined">local_parking</span></span>
        <strong>${escapeHtml(area.label)}</strong>
        <button class="icon-button delete-parking">x</button>
      </div>
      <label>Label <input data-parking-field="label" value="${escapeHtml(area.label)}"></label>
      <label>Type
        <select data-parking-field="kind">
          ${["recommended", "overflow", "unavailable"].map((kind) => `<option ${area.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}
        </select>
      </label>
      <div class="mini-grid">
        <label>Fill <input data-parking-field="color" type="color" value="${area.color}"></label>
        <label>Border <input data-parking-field="border_color" type="color" value="${area.border_color}"></label>
      </div>
      <label>Opacity <input data-parking-field="opacity" type="range" min="0" max="1" step=".05" value="${area.opacity}"></label>
      <label class="check-row"><input data-parking-field="show_icon" type="checkbox" ${area.show_icon ? "checked" : ""}> Show P icon</label>
      <button class="button secondary edit-parking">Edit shape</button>
    </article>
  `).join("");
}

function bindParkingList() {
  el("parking-list").addEventListener("change", (event) => {
    const card = event.target.closest(".editor-card");
    const area = card && project.parking.find((item) => item.id === card.dataset.id);
    const field = event.target.dataset.parkingField;
    if (!area || !field) return;
    let value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    if (field === "opacity") value = Number(value);
    area[field] = value;
    if (field === "kind") {
      area.color = value === "overflow" ? project.palette.overflow : value === "unavailable" ? "#777777" : project.palette.parking;
    }
    renderParking();
  });
  el("parking-list").addEventListener("click", (event) => {
    const card = event.target.closest(".editor-card");
    if (!card) return;
    if (event.target.matches(".delete-parking")) {
      project.parking = project.parking.filter((item) => item.id !== card.dataset.id);
      renderParking();
    }
    if (event.target.matches(".edit-parking")) startParkingEdit(card.dataset.id);
  });
}

function startParkingEdit(id) {
  const area = project.parking.find((item) => item.id === id);
  if (!area) return;
  draw.deleteAll();
  const ring = area.coordinates.map((point) => [point.lng, point.lat]);
  ring.push([...ring[0]]);
  const featureIds = draw.add({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  });
  activeParkingEditId = id;
  draw.changeMode("direct_select", { featureId: featureIds[0] });
  showToast("Drag, add, or delete parking vertices");
}

function renderImportedFeatures(fit = false) {
  if (!styleReady) return;
  const visibleData = importedLayerGeoJSON();
  map.getSource("plainmap-imported")?.setData(visibleData);
  if (fit && visibleData.features.length) {
    const coordinates = [];
    for (const feature of visibleData.features) collectCoordinates(feature.geometry?.coordinates, coordinates);
    fitCoordinateList(coordinates);
  }
  renderImportLayers();
}

function importedLayerGeoJSON() {
  const features = project.imported_layers.length
    ? project.imported_layers.filter((layer) => layer.visible !== false).flatMap((layer) => (
      (layer.data?.features || []).map((feature) => ({
        ...feature,
        properties: { ...feature.properties, __plainmapLayerId: layer.id },
      }))
    ))
    : project.imported_features.features || [];
  return featureCollection(features);
}

function renderImportLayers() {
  el("import-layer-list").innerHTML = project.imported_layers.map((layer, index) => `
    <article class="layer-card" data-layer-id="${layer.id}">
      <div class="layer-card-title">
        <input data-layer-field="name" value="${escapeHtml(layer.name)}" aria-label="Layer name">
        <button class="icon-button layer-up" ${index === 0 ? "disabled" : ""} title="Move layer up">↑</button>
        <button class="icon-button layer-down" ${index === project.imported_layers.length - 1 ? "disabled" : ""} title="Move layer down">↓</button>
        <button class="icon-button delete-layer" title="Delete layer">x</button>
      </div>
      <div class="button-row">
        <label class="check-row"><input data-layer-field="visible" type="checkbox" ${layer.visible !== false ? "checked" : ""}> Visible</label>
        <label class="check-row"><input data-layer-field="locked" type="checkbox" ${layer.locked ? "checked" : ""}> Locked</label>
      </div>
      ${(layer.data?.features || []).some((feature) => feature.geometry?.type.includes("LineString"))
        ? `<button class="button secondary full convert-layer-route">Convert route to editable</button>`
        : ""}
    </article>
  `).join("") || `<p class="hint">Imported reference layers will appear here.</p>`;
}

function bindImportLayers() {
  el("import-layer-list").addEventListener("change", (event) => {
    const card = event.target.closest("[data-layer-id]");
    const layer = card && project.imported_layers.find((item) => item.id === card.dataset.layerId);
    const field = event.target.dataset.layerField;
    if (!layer || !field) return;
    layer[field] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    renderImportedFeatures();
  });
  el("import-layer-list").addEventListener("click", (event) => {
    const card = event.target.closest("[data-layer-id]");
    const index = card && project.imported_layers.findIndex((item) => item.id === card.dataset.layerId);
    if (index === null || index < 0) return;
    const layer = project.imported_layers[index];
    if (event.target.closest(".delete-layer")) project.imported_layers.splice(index, 1);
    if (event.target.closest(".layer-up") && index > 0) {
      [project.imported_layers[index - 1], project.imported_layers[index]] = [layer, project.imported_layers[index - 1]];
    }
    if (event.target.closest(".layer-down") && index < project.imported_layers.length - 1) {
      [project.imported_layers[index + 1], project.imported_layers[index]] = [layer, project.imported_layers[index + 1]];
    }
    if (event.target.closest(".convert-layer-route")) {
      if (layer.locked) return showToast("Unlock this layer before converting its route");
      const feature = layer.data.features.find((item) => item.geometry?.type === "LineString");
      if (!feature) return showToast("This layer has no editable LineString route");
      recordRouteState();
      project.route = feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      project.route_mode = "manual";
      el("route-mode").value = "manual";
      renderRoute();
      showToast("Imported route converted to an editable route");
    }
    renderImportedFeatures();
  });
}

function collectCoordinates(value, output) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") output.push(value);
  else value.forEach((child) => collectCoordinates(child, output));
}

function handleImportedPolygonClick(event) {
  const feature = event.features?.[0];
  if (!feature || !feature.geometry.type.includes("Polygon")) return;
  const layer = project.imported_layers.find((item) => item.id === feature.properties?.__plainmapLayerId);
  if (layer?.locked) return showToast("Unlock this layer before converting its polygons");
  const coordinates = feature.geometry.type === "MultiPolygon"
    ? feature.geometry.coordinates[0][0]
    : feature.geometry.coordinates[0];
  project.parking.push({
    id: uuid(),
    label: feature.properties?.label || feature.properties?.name || "Imported parking",
    kind: "recommended",
    coordinates: coordinates.slice(0, -1).map(([lng, lat]) => ({ lat, lng })),
    color: project.palette.parking,
    opacity: 0.35,
    border_color: "#6F3EB8",
    show_icon: true,
  });
  renderParking();
  showToast("Imported polygon marked as parking");
}

function renderPaletteControls() {
  el("palette-controls").innerHTML = Object.entries(paletteLabels).map(([key, label]) => `
    <label>${label}<input type="color" data-palette="${key}" value="${project.palette[key]}"></label>
  `).join("");
}

function applyPalette() {
  document.documentElement.style.setProperty("--ink", project.palette.text);
  document.documentElement.style.setProperty("--paper", project.palette.background);
  el("map-tint").style.background = project.palette.background;
  if (styleReady) {
    map.setPaintProperty("plainmap-route-line", "line-color", project.palette.route);
    map.setPaintProperty("plainmap-route-arrows", "text-color", project.palette.text);
    map.setPaintProperty("plainmap-imported-line", "line-color", project.palette.route);
    map.setPaintProperty("plainmap-imported-points", "circle-color", project.palette.poi);
    map.setPaintProperty("plainmap-imported-points", "circle-stroke-color", project.palette.text);
  }
  renderPois();
  renderParking();
  renderLegend();
}

function setRotation(angle, mode = "custom", animate = true) {
  const bearing = normalizeBearing(angle);
  project.rotation = bearing;
  project.orientation_mode = mode;
  const camera = { bearing };
  if (animate) map.easeTo({ ...camera, duration: 350 });
  else map.jumpTo(camera);
  el("rotation-slider").value = bearing;
  el("rotation-output").value = `${Math.round(bearing)}°`;
  el("map-frame").dataset.bearing = String(bearing);
  document.querySelectorAll("[data-orientation]").forEach((button) => {
    button.classList.toggle("active", button.dataset.orientation === mode);
  });
  renderCompass();
}

function routeBearing() {
  if (project.route.length < 2) return 0;
  const start = project.route[0];
  const end = project.route.at(-1);
  const lat1 = start.lat * Math.PI / 180;
  const lat2 = end.lat * Math.PI / 180;
  const delta = (end.lng - start.lng) * Math.PI / 180;
  const y = Math.sin(delta) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta);
  return Math.atan2(y, x) * 180 / Math.PI;
}

function fitRoute(rotate = true) {
  if (project.route.length < 2) return showToast("Build a route first");
  if (rotate) setRotation(routeBearing(), "route");
  fitCoordinateList(project.route.map((point) => [point.lng, point.lat]));
}

function fitCoordinateList(coordinates) {
  if (!coordinates.length) return;
  const bounds = coordinates.reduce(
    (box, coordinate) => box.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  );
  map.fitBounds(bounds, { padding: 70, bearing: project.rotation, duration: 450 });
}

function outputAspectRatio() {
  const width = Number(el("export-width").value);
  const height = Number(el("export-height").value);
  return width > 0 && height > 0 ? width / height : 1;
}

function updateBoundaryCaption() {
  const caption = el("export-boundary").querySelector(".boundary-caption");
  caption.textContent =
    `${project.export.width} × ${project.export.height} · ${formatAspect(project.export_boundary.aspect_ratio)}`;
}

function fitLockedSize(width, height, ratio, maxWidth, maxHeight) {
  let fittedWidth = Math.max(80, width);
  let fittedHeight = Math.max(80, height);
  const scale = Math.max(fittedWidth / ratio, fittedHeight);
  fittedWidth = scale * ratio;
  fittedHeight = scale;
  const clampScale = Math.min(1, maxWidth / fittedWidth, maxHeight / fittedHeight);
  return {
    width: fittedWidth * clampScale,
    height: fittedHeight * clampScale,
  };
}

function applyExportDimensions(width, height, preset = "custom") {
  const safeWidth = Math.max(320, Math.min(5000, Math.round(Number(width) || 1080)));
  const safeHeight = Math.max(320, Math.min(5000, Math.round(Number(height) || 1350)));
  project.export = { preset, width: safeWidth, height: safeHeight };
  project.export_boundary.aspect_ratio = safeWidth / safeHeight;
  el("export-preset").value = preset;
  el("export-width").value = safeWidth;
  el("export-height").value = safeHeight;
  if (project.export_boundary.lock_aspect) {
    project.export_boundary.height =
      project.export_boundary.width / project.export_boundary.aspect_ratio;
  }
  renderExportBoundary(false);
}

function renderExportBoundary(recenter = false) {
  if (!map) return;
  const boundary = el("export-boundary");
  const settings = project.export_boundary;
  boundary.hidden = !settings.visible;
  if (!settings.center) settings.center = { ...project.center };
  if (recenter || !Number.isFinite(settings.width) || !Number.isFinite(settings.height)) {
    settings.center = { lat: map.getCenter().lat, lng: map.getCenter().lng };
    settings.width = Math.min(320, el("map-frame").clientWidth * 0.72);
    settings.height = settings.width / settings.aspect_ratio;
  }
  const center = map.project([settings.center.lng, settings.center.lat]);
  const maxWidth = Math.max(100, el("map-frame").clientWidth - 24);
  const maxHeight = Math.max(100, el("map-frame").clientHeight - 24);
  let width = Math.min(settings.width, maxWidth);
  let height = Math.min(settings.height, maxHeight);
  if (settings.lock_aspect) {
    const ratio = settings.aspect_ratio || outputAspectRatio();
    ({ width, height } = fitLockedSize(width, height, ratio, maxWidth, maxHeight));
  }
  settings.width = width;
  settings.height = height;
  boundary.style.left = `${center.x}px`;
  boundary.style.top = `${center.y}px`;
  boundary.style.width = `${width}px`;
  boundary.style.height = `${height}px`;
  boundary.style.transform = `translate(-50%, -50%) rotate(${settings.rotation}deg)`;
  updateBoundaryCaption();
  updateBoundaryGeography();
}

function formatAspect(ratio) {
  const known = [
    [1, "1:1"],
    [4 / 5, "4:5"],
    [9 / 16, "9:16"],
    [16 / 9, "16:9"],
    [4 / 3, "4:3"],
    [3 / 4, "3:4"],
    [2 / 3, "2:3"],
  ];
  const match = known.find(([value]) => Math.abs(value - ratio) < 0.01);
  return match ? match[1] : `${ratio.toFixed(2)}:1`;
}

function boundaryScreenState() {
  const boundary = el("export-boundary");
  if (boundary.hidden) {
    const center = map.project([project.export_boundary.center.lng, project.export_boundary.center.lat]);
    return {
      x: center.x,
      y: center.y,
      width: project.export_boundary.width,
      height: project.export_boundary.height,
      rotation: project.export_boundary.rotation || 0,
    };
  }
  return {
    x: parseFloat(boundary.style.left) || el("map-frame").clientWidth / 2,
    y: parseFloat(boundary.style.top) || el("map-frame").clientHeight / 2,
    width: boundary.offsetWidth,
    height: boundary.offsetHeight,
    rotation: project.export_boundary.rotation || 0,
  };
}

function rotatedBoundaryCorners(state) {
  const radians = state.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    [-state.width / 2, -state.height / 2],
    [state.width / 2, -state.height / 2],
    [state.width / 2, state.height / 2],
    [-state.width / 2, state.height / 2],
  ].map(([x, y]) => ({
    x: state.x + x * cosine - y * sine,
    y: state.y + x * sine + y * cosine,
  }));
}

function updateBoundaryGeography() {
  if (!map || !project.export_boundary) return;
  const state = boundaryScreenState();
  const center = map.unproject([state.x, state.y]);
  const corners = rotatedBoundaryCorners(state).map((point) => map.unproject([point.x, point.y]));
  project.export_boundary.center = { lat: center.lat, lng: center.lng };
  project.export_boundary.width = state.width;
  project.export_boundary.height = state.height;
  if (!project.export_boundary.lock_aspect) {
    project.export_boundary.aspect_ratio = state.width / state.height;
    const outputHeight = Math.max(
      320,
      Math.min(5000, Math.round(project.export.width / project.export_boundary.aspect_ratio))
    );
    project.export.preset = "custom";
    project.export.height = outputHeight;
    el("export-preset").value = "custom";
    el("export-height").value = outputHeight;
  }
  project.export_boundary.bounds = {
    west: Math.min(...corners.map((point) => point.lng)),
    south: Math.min(...corners.map((point) => point.lat)),
    east: Math.max(...corners.map((point) => point.lng)),
    north: Math.max(...corners.map((point) => point.lat)),
  };
  updateBoundaryCaption();
}

function bindExportBoundary() {
  const boundary = el("export-boundary");
  boundary.querySelector(".boundary-caption").addEventListener("pointerdown", (event) => {
    const state = boundaryScreenState();
    boundaryInteraction = { type: "move", startX: event.clientX, startY: event.clientY, state };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  boundary.querySelectorAll(".boundary-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      const state = boundaryScreenState();
      const frameRect = el("map-frame").getBoundingClientRect();
      boundaryInteraction = {
        type: "resize",
        handle: handle.dataset.handle,
        centerX: frameRect.left + state.x,
        centerY: frameRect.top + state.y,
        state,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.stopPropagation();
      event.preventDefault();
    });
  });
  boundary.querySelector(".boundary-rotate").addEventListener("pointerdown", (event) => {
    const state = boundaryScreenState();
    const frameRect = el("map-frame").getBoundingClientRect();
    boundaryInteraction = {
      type: "rotate",
      centerX: frameRect.left + state.x,
      centerY: frameRect.top + state.y,
      startAngle: Math.atan2(event.clientY - (frameRect.top + state.y), event.clientX - (frameRect.left + state.x)),
      rotation: state.rotation,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  });
  // Global listeners keep resize/rotate responsive even when the pointer leaves
  // the small handle or crosses the map frame while dragging.
  window.addEventListener("pointermove", handleBoundaryPointerMove);
  window.addEventListener("pointerup", finishBoundaryInteraction);
  window.addEventListener("pointercancel", finishBoundaryInteraction);
}

function handleBoundaryPointerMove(event) {
  if (!boundaryInteraction) return;
  const boundary = el("export-boundary");
  const frame = el("map-frame");
  if (boundaryInteraction.type === "move") {
    const x = Math.max(20, Math.min(frame.clientWidth - 20, boundaryInteraction.state.x + event.clientX - boundaryInteraction.startX));
    const y = Math.max(20, Math.min(frame.clientHeight - 20, boundaryInteraction.state.y + event.clientY - boundaryInteraction.startY));
    boundary.style.left = `${x}px`;
    boundary.style.top = `${y}px`;
  } else if (boundaryInteraction.type === "resize") {
    let width = Math.max(80, Math.abs(event.clientX - boundaryInteraction.centerX) * 2);
    let height = Math.max(80, Math.abs(event.clientY - boundaryInteraction.centerY) * 2);
    if (project.export_boundary.lock_aspect) {
      ({ width, height } = fitLockedSize(
        width,
        height,
        project.export_boundary.aspect_ratio,
        frame.clientWidth - 20,
        frame.clientHeight - 20
      ));
    }
    boundary.style.width = `${Math.min(width, frame.clientWidth - 20)}px`;
    boundary.style.height = `${Math.min(height, frame.clientHeight - 20)}px`;
  } else {
    const angle = Math.atan2(event.clientY - boundaryInteraction.centerY, event.clientX - boundaryInteraction.centerX);
    project.export_boundary.rotation = normalizeBearing(
      boundaryInteraction.rotation + (angle - boundaryInteraction.startAngle) * 180 / Math.PI
    );
    boundary.style.transform = `translate(-50%, -50%) rotate(${project.export_boundary.rotation}deg)`;
  }
  updateBoundaryGeography();
}

function finishBoundaryInteraction(event) {
  if (!boundaryInteraction) return;
  const captureTarget = event.target;
  if (captureTarget?.hasPointerCapture?.(event.pointerId)) {
    captureTarget.releasePointerCapture(event.pointerId);
  }
  boundaryInteraction = null;
  updateBoundaryGeography();
}

function centerBoundaryOnRoute() {
  if (!project.route.length) return showToast("Build a route first");
  const points = project.route.map((point) => map.project([point.lng, point.lat]));
  const state = boundaryScreenState();
  el("export-boundary").style.left = `${points.reduce((sum, point) => sum + point.x, 0) / points.length}px`;
  el("export-boundary").style.top = `${points.reduce((sum, point) => sum + point.y, 0) / points.length}px`;
  el("export-boundary").style.width = `${state.width}px`;
  el("export-boundary").style.height = `${state.height}px`;
  updateBoundaryGeography();
}

function fitBoundaryToRoute() {
  if (project.route.length < 2) return showToast("Build a route first");
  const points = project.route.map((point) => map.project([point.lng, point.lat]));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const frame = el("map-frame");
  let width = Math.min(frame.clientWidth - 30, Math.max(120, maxX - minX + 70));
  let height = Math.min(frame.clientHeight - 30, Math.max(120, maxY - minY + 70));
  if (project.export_boundary.lock_aspect) {
    ({ width, height } = fitLockedSize(
      width,
      height,
      project.export_boundary.aspect_ratio,
      frame.clientWidth - 20,
      frame.clientHeight - 20
    ));
  }
  const boundary = el("export-boundary");
  boundary.style.left = `${(minX + maxX) / 2}px`;
  boundary.style.top = `${(minY + maxY) / 2}px`;
  boundary.style.width = `${Math.min(width, frame.clientWidth - 20)}px`;
  boundary.style.height = `${Math.min(height, frame.clientHeight - 20)}px`;
  updateBoundaryGeography();
}

function renderCompass() {
  const compass = el("compass");
  compass.hidden = !project.compass.visible;
  compass.className = `compass ${project.compass.position} ${project.compass.locked ? "locked" : ""}`;
  compass.style.width = `${project.compass.size}px`;
  compass.style.height = `${project.compass.size}px`;
  compass.style.color = project.compass.color;
  if (Number.isFinite(project.compass.custom_position?.x)) {
    compass.style.left = `${project.compass.custom_position.x}px`;
    compass.style.top = `${project.compass.custom_position.y}px`;
    compass.style.right = "auto";
    compass.style.bottom = "auto";
  } else {
    compass.style.left = "";
    compass.style.top = "";
    compass.style.right = "";
    compass.style.bottom = "";
  }
  // MapLibre bearing is clockwise camera rotation; north on screen moves by the inverse angle.
  compass.querySelector(".compass-arrow").style.transform = `rotate(${-map.getBearing()}deg)`;
}

const legendLabels = {
  meeting: "Meeting point",
  parking: "Parking",
  route: "Walking route",
  photoStops: "Photo stops",
  arrows: "Direction arrows",
};

function renderLegendControls() {
  el("legend-toggles").innerHTML = Object.entries(legendLabels).map(([key, label]) => `
    <label class="check-row"><input type="checkbox" data-legend-item="${key}" ${project.legend.items[key] ? "checked" : ""}> ${label}</label>
  `).join("");
}

function renderLegend() {
  const legend = el("legend");
  legend.hidden = !project.legend.visible;
  legend.style.width = `${project.legend.width}px`;
  legend.style.height = project.legend.height ? `${project.legend.height}px` : "";
  legend.classList.toggle("locked", project.legend.locked);
  legend.style.left = `${project.legend.position.x}px`;
  legend.style.top = `${project.legend.position.y}px`;
  legend.style.bottom = "auto";
  const items = [];
  if (project.legend.items.meeting) items.push(`<div class="legend-item"><span class="legend-dot" style="background:${project.palette.meeting}"></span> Meeting point</div>`);
  if (project.legend.items.parking) items.push(`<div class="legend-item"><span class="legend-icon" style="background:${project.palette.parking}"><span class="material-symbols-outlined">local_parking</span></span> Parking</div>`);
  if (project.legend.items.route) items.push(`<div class="legend-item"><span class="legend-icon" style="background:${project.palette.route}"><span class="material-symbols-outlined">directions_walk</span></span> Walking route</div>`);
  if (project.legend.items.photoStops) {
    project.pois.forEach((poi, index) => {
      const iconMode = poi.display_mode === "icon" || (poi.display_mode === "auto" && project.poi_marker_mode === "icons");
      const symbol = iconMode
        ? `<span class="legend-icon" style="background:${poi.color}"><span class="material-symbols-outlined">${escapeHtml(normalizeMaterialIcon(poi.icon))}</span></span>`
        : `<span class="legend-icon legend-text-marker" style="background:${poi.color}">${escapeHtml(markerText(poi, index))}</span>`;
      items.push(`<div class="legend-item">${symbol} ${escapeHtml(poi.label)}</div>`);
    });
    if (!project.pois.length) items.push(`<div class="legend-item"><span class="legend-dot" style="background:${project.palette.poi}"></span> Points of interest</div>`);
  }
  if (project.legend.items.arrows) items.push(`<div class="legend-item"><strong>↑</strong> Direction</div>`);
  el("legend-content").innerHTML = items.join("");
}

function makeLegendDraggable() {
  const legend = el("legend");
  let drag = null;
  legend.addEventListener("pointerdown", (event) => {
    if (project.legend.locked) return;
    if (event.offsetX > legend.clientWidth - 18 && event.offsetY > legend.clientHeight - 18) return;
    drag = { x: event.clientX, y: event.clientY, left: legend.offsetLeft, top: legend.offsetTop };
    legend.setPointerCapture(event.pointerId);
  });
  legend.addEventListener("pointermove", (event) => {
    if (!drag) return;
    legend.style.left = `${Math.max(0, drag.left + event.clientX - drag.x)}px`;
    legend.style.top = `${Math.max(0, drag.top + event.clientY - drag.y)}px`;
    legend.style.bottom = "auto";
  });
  legend.addEventListener("pointerup", () => {
    if (!drag) return;
    project.legend.position = { x: legend.offsetLeft, y: legend.offsetTop };
    project.legend.width = legend.offsetWidth;
    if (project.legend.snap) snapLayoutElement(legend, project.legend, false);
    drag = null;
  });
  new ResizeObserver(() => {
    if (project.legend.locked) return;
    project.legend.width = legend.offsetWidth;
    project.legend.height = legend.offsetHeight;
  }).observe(legend);
}

function makeCompassDraggable() {
  const compass = el("compass");
  let drag = null;
  compass.addEventListener("pointerdown", (event) => {
    if (project.compass.locked) return;
    drag = { x: event.clientX, y: event.clientY, left: compass.offsetLeft, top: compass.offsetTop };
    compass.setPointerCapture(event.pointerId);
  });
  compass.addEventListener("pointermove", (event) => {
    if (!drag) return;
    compass.style.left = `${Math.max(0, drag.left + event.clientX - drag.x)}px`;
    compass.style.top = `${Math.max(0, drag.top + event.clientY - drag.y)}px`;
    compass.style.right = "auto";
    compass.style.bottom = "auto";
  });
  compass.addEventListener("pointerup", () => {
    if (!drag) return;
    project.compass.custom_position = { x: compass.offsetLeft, y: compass.offsetTop };
    if (project.compass.snap) snapLayoutElement(compass, project.compass, true);
    drag = null;
  });
}

function snapLayoutElement(node, settings, isCompass) {
  const frame = el("map-frame");
  const margin = 18;
  const left = node.offsetLeft + node.offsetWidth / 2 < frame.clientWidth / 2;
  const top = node.offsetTop + node.offsetHeight / 2 < frame.clientHeight / 2;
  const x = left ? margin : frame.clientWidth - node.offsetWidth - margin;
  const y = top ? margin : frame.clientHeight - node.offsetHeight - margin;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.right = "auto";
  node.style.bottom = "auto";
  if (isCompass) {
    settings.position = `${top ? "top" : "bottom"}-${left ? "left" : "right"}`;
    settings.custom_position = {};
    el("compass-position").value = settings.position;
    renderCompass();
  } else {
    settings.position = { x, y };
  }
}

async function geocodeLocation(query) {
  setStatus("Searching...");
  try {
    const response = await fetch(apiUrl(`/api/geocode?q=${encodeURIComponent(query)}`));
    if (!response.ok) throw new Error((await response.json()).detail);
    const results = await response.json();
    el("geocode-results").innerHTML = results.map((result) => `
      <button data-lat="${result.lat}" data-lng="${result.lng}">${escapeHtml(result.label)}</button>
    `).join("") || `<span class="hint">No results found.</span>`;
  } catch (error) {
    showToast(error.message);
  } finally {
    setStatus("Ready");
  }
}

async function uploadMapData(file, mode = "layer") {
  const form = new FormData();
  form.append("file", file);
  setStatus(`Importing ${file.name}...`);
  try {
    const response = await fetch(apiUrl("/api/import"), { method: "POST", body: form });
    if (!response.ok) throw new Error((await response.json()).detail);
    const data = await response.json();
    if (mode === "replace") {
      project.pois = [];
      project.route = [];
      project.parking = [];
      project.imported_layers = [];
    }
    if (mode === "merge") {
      data.features.filter((feature) => feature.geometry?.type === "Point").forEach((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        addPoi({ lat, lng }, { label: feature.properties?.label || feature.properties?.name || "Imported point" });
      });
      const firstRoute = data.features.find((feature) => feature.geometry?.type === "LineString");
      if (firstRoute) {
        recordRouteState();
        project.route = firstRoute.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
        project.route_mode = "manual";
        el("route-mode").value = "manual";
      }
    }
    project.imported_layers.push({
      id: uuid(),
      name: file.name.replace(/\.[^.]+$/, "") || `Layer ${project.imported_layers.length + 1}`,
      visible: true,
      locked: mode === "layer",
      data,
    });
    project.imported_features = featureCollection([]);
    renderImportedFeatures(true);
    renderRoute();
    renderPois();
    renderParking();
    showToast(`Imported ${data.features.length} features ${mode === "layer" ? "as a reference layer" : ""}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    setStatus("Ready");
  }
}

function serializeProject() {
  syncCameraState();
  updateBoundaryGeography();
  project.name = el("project-name").value.trim() || "Untitled map";
  project.project_id ||= uuid();
  project.owner_id ??= null;
  project.detail_level = el("detail-level").value;
  project.poi_marker_mode = el("poi-marker-mode").value;
  project.route_mode = el("route-mode").value;
  project.show_arrows = el("show-arrows").checked;
  project.export = {
    preset: el("export-preset").value,
    width: Number(el("export-width").value),
    height: Number(el("export-height").value),
  };
  project.export_boundary.enabled = el("boundary-enabled").checked;
  project.export_boundary.visible = el("boundary-visible").checked;
  project.export_boundary.lock_aspect = el("boundary-lock-aspect").checked;
  return project;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveProject() {
  lastSavedRoute = cloneRoute();
  updateRouteHistoryControls();
  downloadBlob(
    new Blob([JSON.stringify(serializeProject(), null, 2)], { type: "application/json" }),
    `${safeFilename(project.name)}.plainmap.json`
  );
}

function safeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plainmap";
}

async function loadProjectFile(file) {
  try {
    const data = JSON.parse(await file.text());
    project = mergeProjectDefaults(data.properties?.plainmapProject || data);
    lastSavedRoute = cloneRoute(project.route);
    routeUndoStack = [];
    routeRedoStack = [];
    expandedPoiIds.clear();
    clearRouteEditHandles();
    syncUiFromProject();
    map.jumpTo({
      center: [project.center.lng, project.center.lat],
      zoom: project.zoom,
      bearing: project.rotation,
    });
    renderAll();
    showToast("Project loaded");
  } catch (error) {
    showToast(`Could not load project: ${error.message}`);
  }
}

function mergeProjectDefaults(data) {
  const boundaryData = data.export_boundary || {
    center: data.center || DEFAULT_PROJECT.export_boundary.center,
  };
  const migratedPreset = legacyExportPresets[data.export?.preset] || data.export?.preset;
  return {
    ...structuredClone(DEFAULT_PROJECT),
    ...data,
    version: 4,
    poi_marker_mode: data.poi_marker_mode || "letters",
    poi_simple_markers: data.poi_simple_markers === true,
    workflow_stage: Math.max(0, Math.min(7, Number(data.workflow_stage || 0))),
    quick_edit_mode: data.quick_edit_mode === true,
    pois: (data.pois || []).map((poi) => ({
      ...poi,
      icon: normalizeMaterialIcon(poi.icon),
      show_label: poi.show_label !== false,
      display_mode: poi.display_mode || "auto",
      short_text: poi.short_text || "",
      use_category_defaults: poi.use_category_defaults === true,
    })),
    palette: { ...AUSTIN_PALETTE, ...data.palette },
    compass: { ...DEFAULT_PROJECT.compass, ...data.compass },
    legend: {
      ...DEFAULT_PROJECT.legend,
      ...data.legend,
      items: { ...DEFAULT_PROJECT.legend.items, ...data.legend?.items },
    },
    export: { ...DEFAULT_PROJECT.export, ...data.export, preset: migratedPreset || DEFAULT_PROJECT.export.preset },
    export_boundary: {
      ...DEFAULT_PROJECT.export_boundary,
      ...boundaryData,
      center: { ...DEFAULT_PROJECT.export_boundary.center, ...boundaryData.center },
    },
    imported_layers: data.imported_layers?.length ? data.imported_layers : (
      data.imported_features?.features?.length ? [{
        id: uuid(),
        name: "Legacy import",
        visible: true,
        locked: true,
        data: data.imported_features,
      }] : []
    ),
  };
}

function renderExportCrop(sourceCanvas, outputWidth, outputHeight) {
  const output = document.createElement("canvas");
  output.width = outputWidth;
  output.height = outputHeight;
  const context = output.getContext("2d");
  context.fillStyle = project.palette.background;
  context.fillRect(0, 0, outputWidth, outputHeight);

  const frame = el("map-frame");
  const sourceScale = sourceCanvas.width / frame.clientWidth;
  const boundary = project.export_boundary.enabled
    ? boundaryScreenState()
    : {
        x: frame.clientWidth / 2,
        y: frame.clientHeight / 2,
        width: frame.clientWidth,
        height: frame.clientHeight,
        rotation: 0,
      };
  const sourceWidth = boundary.width * sourceScale;
  const sourceHeight = boundary.height * sourceScale;
  // Uniform scaling preserves map geometry. Any unlocked aspect mismatch is
  // letterboxed rather than squeezing the selected geographic area.
  const scale = Math.min(outputWidth / sourceWidth, outputHeight / sourceHeight);
  context.save();
  context.translate(outputWidth / 2, outputHeight / 2);
  context.scale(scale, scale);
  context.rotate(-boundary.rotation * Math.PI / 180);
  context.drawImage(
    sourceCanvas,
    -boundary.x * sourceScale,
    -boundary.y * sourceScale
  );
  context.restore();
  return output;
}

async function exportProject(format) {
  clearRouteEditHandles();
  draw.deleteAll();
  const data = serializeProject();
  const filename = safeFilename(project.name);
  if (format === "png" || format === "pdf") {
    setStatus(`Rendering ${format.toUpperCase()}...`);
    try {
      if (!map.loaded() || !map.areTilesLoaded()) {
        await new Promise((resolve) => map.once("idle", resolve));
      }
      const boundaryNode = el("export-boundary");
      const boundaryVisibility = boundaryNode.style.visibility;
      boundaryNode.style.visibility = "hidden";
      const canvas = await html2canvas(el("map-frame"), {
        useCORS: true,
        allowTaint: false,
        backgroundColor: project.palette.background,
        scale: Math.min(3, Math.max(1.5, data.export.width / el("map-frame").clientWidth)),
      });
      boundaryNode.style.visibility = boundaryVisibility;
      const output = renderExportCrop(canvas, data.export.width, data.export.height);
      if (format === "png") {
        output.toBlob((blob) => downloadBlob(blob, `${filename}.png`), "image/png");
      } else {
        const orientation = data.export.width >= data.export.height ? "landscape" : "portrait";
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation,
          unit: "px",
          format: [data.export.width, data.export.height],
          hotfixes: ["px_scaling"],
        });
        pdf.addImage(output.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, data.export.width, data.export.height);
        pdf.save(`${filename}.pdf`);
      }
    } catch (error) {
      el("export-boundary").style.visibility = "";
      showToast(`${format.toUpperCase()} export failed: ${error.message}`);
    } finally {
      setStatus("Ready");
    }
    return;
  }
  const response = await fetch(apiUrl(`/api/export/${format}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) return showToast((await response.json()).detail || "Export failed");
  downloadBlob(await response.blob(), `${filename}.${format}`);
}

function syncUiFromProject() {
  el("project-name").value = project.name;
  el("detail-level").value = project.detail_level;
  el("poi-marker-mode").value = project.poi_marker_mode;
  el("poi-simple-markers").checked = project.poi_simple_markers;
  el("route-mode").value = project.route_mode;
  el("show-arrows").checked = project.show_arrows;
  el("zoom-number").value = Number(project.zoom).toFixed(1);
  el("zoom-slider").value = project.zoom;
  el("rotation-slider").value = project.rotation;
  el("rotation-output").value = `${Math.round(project.rotation)}°`;
  el("compass-visible").checked = project.compass.visible;
  el("compass-position").value = project.compass.position;
  el("compass-size").value = project.compass.size;
  el("compass-color").value = project.compass.color;
  el("compass-locked").checked = project.compass.locked;
  el("compass-snap").checked = project.compass.snap;
  el("legend-visible").checked = project.legend.visible;
  el("legend-locked").checked = project.legend.locked;
  el("legend-snap").checked = project.legend.snap;
  el("export-preset").value = project.export.preset;
  el("export-width").value = project.export.width;
  el("export-height").value = project.export.height;
  el("boundary-enabled").checked = project.export_boundary.enabled;
  el("boundary-visible").checked = project.export_boundary.visible;
  el("boundary-lock-aspect").checked = project.export_boundary.lock_aspect;
  renderPaletteControls();
  renderLegendControls();
  renderWorkflow();
  updateRouteHistoryControls();
}

function renderAll() {
  renderPois();
  renderRoute();
  renderParking();
  renderImportedFeatures();
  applyPalette();
  applyDetailLevel(project.detail_level);
  setRotation(project.rotation, project.orientation_mode, false);
  renderCompass();
  renderLegend();
  renderExportBoundary(false);
}

function bindEvents() {
  el("location-form").addEventListener("submit", (event) => {
    event.preventDefault();
    geocodeLocation(el("location-input").value);
  });
  el("geocode-results").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    map.flyTo({ center: [Number(button.dataset.lng), Number(button.dataset.lat)], zoom: 16 });
    el("geocode-results").innerHTML = "";
  });
  el("data-upload").addEventListener("change", (event) => {
    pendingImportFile = event.target.files[0] || null;
    if (pendingImportFile) el("import-options-dialog").showModal();
  });
  el("confirm-import").addEventListener("click", () => {
    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    if (pendingImportFile) uploadMapData(pendingImportFile, mode);
    pendingImportFile = null;
    el("data-upload").value = "";
  });
  el("zoom-in").addEventListener("click", () => setMapZoom(map.getZoom() + 1));
  el("zoom-out").addEventListener("click", () => setMapZoom(map.getZoom() - 1));
  el("zoom-number").addEventListener("change", (event) => setMapZoom(event.target.value));
  el("zoom-slider").addEventListener("input", (event) => setMapZoom(event.target.value));
  el("add-poi").addEventListener("click", () => {
    const center = map.getCenter();
    addPoi({ lat: center.lat, lng: center.lng });
  });
  el("poi-marker-mode").addEventListener("change", (event) => {
    project.poi_marker_mode = event.target.value;
    renderPois();
  });
  el("poi-simple-markers").addEventListener("change", (event) => {
    project.poi_simple_markers = event.target.checked;
    renderPois();
  });
  el("collapse-all-pois").addEventListener("click", () => {
    expandedPoiIds.clear();
    renderPoiList();
  });
  el("expand-all-pois").addEventListener("click", () => {
    project.pois.forEach((poi) => expandedPoiIds.add(poi.id));
    renderPoiList();
  });
  el("show-poi-labels").addEventListener("click", () => {
    project.pois.forEach((poi) => { poi.show_label = true; });
    renderPois();
  });
  el("hide-poi-labels").addEventListener("click", () => {
    project.pois.forEach((poi) => { poi.show_label = false; });
    renderPois();
  });
  el("build-route").addEventListener("click", () => {
    project.route_mode = el("route-mode").value;
    buildRoute();
  });
  el("route-mode").addEventListener("change", (event) => { project.route_mode = event.target.value; });
  el("edit-route").addEventListener("click", () => toggleRouteEditMode());
  el("clear-edit-handles").addEventListener("click", () => clearRouteEditHandles());
  document.addEventListener("keydown", (event) => {
    if (!routeEditMode || selectedRouteVertex === null || !["Delete", "Backspace"].includes(event.key)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    deleteRouteVertex(selectedRouteVertex);
  });
  el("reverse-route").addEventListener("click", () => {
    recordRouteState();
    project.route.reverse();
    project.pois.reverse();
    renderPois();
    renderRoute();
  });
  el("clear-route").addEventListener("click", () => {
    recordRouteState();
    project.route = [];
    clearRouteEditHandles();
    renderRoute();
  });
  el("undo-route").addEventListener("click", undoRoute);
  el("redo-route").addEventListener("click", redoRoute);
  el("revert-route").addEventListener("click", () => {
    recordRouteState();
    restoreRoute(lastSavedRoute);
  });
  el("reset-route").addEventListener("click", () => {
    recordRouteState();
    project.route_mode = "straight";
    el("route-mode").value = "straight";
    project.route = project.pois.filter((poi) => poi.selected).map((poi) => ({ ...poi.position }));
    clearRouteEditHandles();
    renderRoute();
  });
  el("show-arrows").addEventListener("change", (event) => {
    project.show_arrows = event.target.checked;
    renderRoute();
  });
  el("draw-parking").addEventListener("click", () => {
    drawPurpose = "parking";
    activeParkingEditId = null;
    draw.changeMode("draw_polygon");
    setStatus("Click map to draw parking; click the first point to finish");
  });
  el("detail-level").addEventListener("change", (event) => applyDetailLevel(event.target.value));
  el("palette-controls").addEventListener("input", (event) => {
    if (!event.target.dataset.palette) return;
    project.palette[event.target.dataset.palette] = event.target.value;
    applyPalette();
  });
  el("austin-palette").addEventListener("click", () => {
    project.palette = { ...AUSTIN_PALETTE };
    renderPaletteControls();
    applyPalette();
  });
  document.querySelectorAll("[data-orientation]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.orientation === "north") setRotation(0, "north");
    if (button.dataset.orientation === "route") fitRoute(true);
    if (button.dataset.orientation === "custom") setRotation(el("rotation-slider").value, "custom");
  }));
  el("rotation-slider").addEventListener("input", (event) => setRotation(event.target.value, "custom", false));
  el("fit-route").addEventListener("click", () => fitRoute(true));
  el("reset-rotation").addEventListener("click", () => setRotation(0, "north"));
  el("compass-visible").addEventListener("change", (event) => { project.compass.visible = event.target.checked; renderCompass(); });
  el("compass-position").addEventListener("change", (event) => {
    project.compass.position = event.target.value;
    project.compass.custom_position = {};
    renderCompass();
  });
  el("compass-size").addEventListener("input", (event) => { project.compass.size = Number(event.target.value); renderCompass(); });
  el("compass-color").addEventListener("input", (event) => { project.compass.color = event.target.value; renderCompass(); });
  el("compass-locked").addEventListener("change", (event) => { project.compass.locked = event.target.checked; renderCompass(); });
  el("compass-snap").addEventListener("change", (event) => { project.compass.snap = event.target.checked; });
  el("legend-visible").addEventListener("change", (event) => { project.legend.visible = event.target.checked; renderLegend(); });
  el("legend-locked").addEventListener("change", (event) => { project.legend.locked = event.target.checked; renderLegend(); });
  el("legend-snap").addEventListener("change", (event) => { project.legend.snap = event.target.checked; });
  el("legend-toggles").addEventListener("change", (event) => {
    project.legend.items[event.target.dataset.legendItem] = event.target.checked;
    renderLegend();
  });
  el("export-preset").addEventListener("change", (event) => {
    const preset = exportPresets[event.target.value];
    if (preset) applyExportDimensions(preset.width, preset.height, event.target.value);
  });
  ["export-width", "export-height"].forEach((id) => el(id).addEventListener("input", () => {
    const width = Number(el("export-width").value);
    const height = Number(el("export-height").value);
    if (width >= 320 && height >= 320) applyExportDimensions(width, height, "custom");
  }));
  el("boundary-enabled").addEventListener("change", (event) => {
    project.export_boundary.enabled = event.target.checked;
  });
  el("boundary-visible").addEventListener("change", (event) => {
    project.export_boundary.visible = event.target.checked;
    renderExportBoundary(false);
  });
  el("boundary-lock-aspect").addEventListener("change", (event) => {
    project.export_boundary.lock_aspect = event.target.checked;
    if (event.target.checked) {
      project.export_boundary.aspect_ratio = outputAspectRatio();
      project.export_boundary.height = project.export_boundary.width / project.export_boundary.aspect_ratio;
    }
    renderExportBoundary(false);
  });
  el("fit-boundary-route").addEventListener("click", fitBoundaryToRoute);
  el("center-boundary-route").addEventListener("click", centerBoundaryOnRoute);
  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportProject(button.dataset.export)));
  el("save-project").addEventListener("click", saveProject);
  el("load-project").addEventListener("change", (event) => event.target.files[0] && loadProjectFile(event.target.files[0]));
  el("previous-stage").addEventListener("click", () => setWorkflowStage(project.workflow_stage - 1));
  el("next-stage").addEventListener("click", () => setWorkflowStage(project.workflow_stage + 1));
  el("quick-edit-mode").addEventListener("change", (event) => {
    project.quick_edit_mode = event.target.checked;
    renderWorkflow();
  });
  el("workflow-steps").addEventListener("click", (event) => {
    const button = event.target.closest("[data-workflow-stage]");
    if (button && !button.disabled) setWorkflowStage(button.dataset.workflowStage);
  });
  bindPoiList();
  bindParkingList();
  bindImportLayers();
}

function start() {
  syncUiFromProject();
  initMap();
  bindEvents();
  makeLegendDraggable();
  makeCompassDraggable();
  renderWorkflow();
  bindExportBoundary();
}

start();

// A small read-only inspection hook helps automated checks verify canvas-only
// MapLibre state without coupling tests to private library internals.
window.plainmapStudio = {
  inspect: () => ({
    bearing: map?.getBearing() ?? 0,
    zoom: map?.getZoom() ?? project.zoom,
    detailLevel: project.detail_level,
    markerMode: project.poi_marker_mode,
    route: structuredClone(project.route),
    boundary: structuredClone(project.export_boundary),
    hiddenBaseLayers: styleReady
      ? [...baseLayerVisibility.keys()].filter((id) => map.getLayoutProperty(id, "visibility") === "none").length
      : 0,
    visibleBaseLayers: styleReady
      ? [...baseLayerVisibility.keys()].filter((id) => map.getLayoutProperty(id, "visibility") !== "none").length
      : 0,
  }),
};
