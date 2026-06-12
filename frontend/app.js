const state = {
  pois: [],
  route: [],
  parkingAreas: [],
  mode: "view",
  dragIndex: null,
  draggedPoi: null,
  selectedPoi: null,
  hidePoiLabels: false,
  routeMarkers: [],
  colors: {
    route: "#f05a3c",
    poi: "#14213d",
    frame: "#f4c542",
  },
};

const FRAME_INSET = { top: 50, right: 150, bottom: 50, left: 42 };

const elements = {
  fileInput: document.querySelector("#file-input"),
  importStatus: document.querySelector("#import-status"),
  poiCount: document.querySelector("#poi-count"),
  routeCount: document.querySelector("#route-count"),
  parkingCount: document.querySelector("#parking-count"),
  addPoi: document.querySelector("#add-poi"),
  hidePoiLabels: document.querySelector("#hide-poi-labels"),
  poiList: document.querySelector("#poi-list"),
  drawRoute: document.querySelector("#draw-route"),
  editRoute: document.querySelector("#edit-route"),
  clearRoute: document.querySelector("#clear-route"),
  routeColor: document.querySelector("#route-color"),
  poiColor: document.querySelector("#poi-color"),
  frameShape: document.querySelector("#frame-shape"),
  exportCompass: document.querySelector("#export-compass"),
  exportLegend: document.querySelector("#export-legend"),
  cropFrame: document.querySelector("#crop-frame"),
  fitContent: document.querySelector("#fit-content"),
  exportPng: document.querySelector("#export-png"),
  message: document.querySelector("#app-message"),
  dropZone: document.querySelector("#drop-zone"),
  mapTip: document.querySelector("#map-tip"),
  routeOverlayLine: document.querySelector("#route-overlay-line"),
  routeOverlayOutline: document.querySelector("#route-overlay-outline"),
  poiOverlay: document.querySelector("#poi-overlay"),
};

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-97.7431, 30.2672],
  zoom: 13,
  preserveDrawingBuffer: true,
  attributionControl: false,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
map.doubleClickZoom.disable();

map.on("load", () => {
  [
    "waterway_label",
    "place_hamlet",
    "place_suburbs",
    "place_villages",
    "poi_stadium",
    "poi_park",
    "roadname_minor",
    "housenumber",
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
  });
  map.addSource("route", emptyCollection());
  map.addSource("route-vertices", emptyCollection());
  map.addSource("pois", emptyCollection());
  map.addSource("parking", emptyCollection());

  map.addLayer({
    id: "parking-fill",
    type: "fill",
    source: "parking",
    paint: {
      "fill-color": "#4f89c6",
      "fill-opacity": 0.32,
    },
  });
  map.addLayer({
    id: "parking-outline",
    type: "line",
    source: "parking",
    paint: {
      "line-color": "#356da8",
      "line-width": 2,
      "line-dasharray": [2, 1.5],
    },
  });
  map.addLayer({
    id: "route-outline",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 13 },
  });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": state.colors.route, "line-width": 8 },
  });
  map.addLayer({
    id: "route-vertices",
    type: "circle",
    source: "route-vertices",
    paint: {
      "circle-radius": 7,
      "circle-color": "#ffffff",
      "circle-stroke-color": state.colors.route,
      "circle-stroke-width": 3,
    },
  });
  renderAll();
});

map.on("click", (event) => {
  if (state.mode === "draw") {
    state.route.push([event.lngLat.lng, event.lngLat.lat]);
    renderRoute();
    return;
  }
  if (state.mode === "add-poi") {
    addPoiAt([event.lngLat.lng, event.lngLat.lat]);
  }
});

map.on("dblclick", (event) => {
  event.preventDefault();
  if (state.mode === "draw") {
    const last = state.route.at(-1);
    const previous = state.route.at(-2);
    if (last && previous && last[0] === previous[0] && last[1] === previous[1]) {
      state.route.pop();
    }
    finishDrawing();
    return;
  }
  if (state.mode === "edit" || state.mode === "add-poi") return;
});

map.on("mousedown", "route-vertices", (event) => {
  if (state.mode !== "edit" || !event.features?.length) return;
  event.preventDefault();
  state.dragIndex = Number(event.features[0].properties.index);
  map.dragPan.disable();
});

map.on("mousemove", (event) => {
  if (state.dragIndex === null) return;
  state.route[state.dragIndex] = [event.lngLat.lng, event.lngLat.lat];
  renderRoute();
});

map.on("mouseup", () => {
  if (state.dragIndex === null) return;
  state.dragIndex = null;
  map.dragPan.enable();
  setMessage("Path updated");
});

map.on("mouseenter", "route-vertices", () => {
  if (state.mode === "edit") map.getCanvas().style.cursor = "grab";
});
map.on("mouseleave", "route-vertices", () => {
  map.getCanvas().style.cursor = state.mode === "draw" ? "crosshair" : "";
});
map.on("move", updateOverlays);
map.on("resize", updateOverlays);

elements.fileInput.addEventListener("change", async () => {
  const file = elements.fileInput.files[0];
  if (!file) return;
  await importFile(file);
  elements.fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
});

elements.dropZone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) await importFile(file);
});

async function importFile(file) {
  if (!/\.(kml|kmz)$/i.test(file.name)) {
    elements.importStatus.textContent = "Choose a KML or KMZ file";
    setMessage("That file is not KML or KMZ", true);
    return;
  }
  elements.importStatus.textContent = `Reading ${file.name}...`;
  setMessage("Importing map data");

  try {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/import", { method: "POST", body });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "Import failed.");
    loadFeatures(payload.features || []);
    elements.importStatus.textContent = `${file.name} loaded`;
    setMessage(
      `Loaded ${state.pois.length} POI${state.pois.length === 1 ? "" : "s"}`
      + (state.parkingAreas.length
        ? ` and ${state.parkingAreas.length} parking area${state.parkingAreas.length === 1 ? "" : "s"}`
        : "")
      + (state.route.length ? " and 1 walking path" : ""),
    );
  } catch (error) {
    elements.importStatus.textContent = error.message;
    setMessage(error.message, true);
  }
}

elements.drawRoute.addEventListener("click", () => {
  if (state.mode === "draw") return finishDrawing();
  state.route = [];
  setMode("draw");
  elements.drawRoute.textContent = "Finish path";
  setMessage("Click along the walking path");
});

elements.addPoi.addEventListener("click", () => {
  setMode(state.mode === "add-poi" ? "view" : "add-poi");
  setMessage(state.mode === "add-poi" ? "Click the map to place a POI" : "POI placement cancelled");
});

elements.hidePoiLabels.addEventListener("change", () => {
  state.hidePoiLabels = elements.hidePoiLabels.checked;
  renderPoiOverlay();
  setMessage(state.hidePoiLabels ? "POI labels hidden" : "POI labels shown");
});

elements.editRoute.addEventListener("click", () => {
  if (state.route.length < 2) return setMessage("Draw or import a path first", true);
  setMode(state.mode === "edit" ? "view" : "edit");
  setMessage(state.mode === "edit" ? "Drag the white route points to edit" : "Path editing finished");
});

elements.clearRoute.addEventListener("click", () => {
  state.route = [];
  setMode("view");
  renderRoute();
  setMessage("Walking path cleared");
});

elements.routeColor.addEventListener("input", (event) => {
  state.colors.route = event.target.value;
  document.documentElement.style.setProperty("--route-color", state.colors.route);
  if (map.getLayer("route-line")) {
    map.setPaintProperty("route-line", "line-color", state.colors.route);
    map.setPaintProperty("route-vertices", "circle-stroke-color", state.colors.route);
  }
  updateRouteOverlay();
  renderRouteMarkers();
});

elements.poiColor.addEventListener("input", (event) => {
  state.colors.poi = event.target.value;
  document.documentElement.style.setProperty("--poi-color", state.colors.poi);
});

elements.frameShape.addEventListener("change", updateFrameShape);
elements.fitContent.addEventListener("click", fitContent);
elements.exportPng.addEventListener("click", exportPng);
window.addEventListener("resize", updateFrameShape);

function emptyCollection() {
  return { type: "FeatureCollection", features: [] };
}

function pointFeature(coordinates, label) {
  return {
    type: "Feature",
    properties: {
      label: label || "Point of interest",
      visible: true,
    },
    geometry: { type: "Point", coordinates },
  };
}

function loadFeatures(features) {
  state.pois = features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature, index) => pointFeature(
      feature.geometry.coordinates.slice(0, 2),
      feature.properties?.label || feature.properties?.name || `POI ${index + 1}`,
    ));

  const line = features.find((feature) => feature.geometry?.type === "LineString");
  state.route = line ? line.geometry.coordinates.map((coordinate) => coordinate.slice(0, 2)) : [];
  state.parkingAreas = features
    .filter((feature) => feature.geometry?.type === "Polygon")
    .map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.geometry.coordinates.map((ring) => (
          ring.map((coordinate) => coordinate.slice(0, 2))
        )),
      },
    }));
  state.selectedPoi = state.pois.length ? 0 : null;
  setMode("view");
  renderAll();
  fitContent();
}

function setMode(mode) {
  state.mode = mode;
  state.dragIndex = null;
  elements.drawRoute.textContent = mode === "draw" ? "Finish path" : "Draw path";
  elements.editRoute.textContent = mode === "edit" ? "Done editing" : "Edit path";
  elements.addPoi.textContent = mode === "add-poi" ? "Cancel adding POI" : "Add POI on map";
  elements.mapTip.textContent = mode === "add-poi"
    ? "Click the map to place the new POI"
    : "Choose Add POI, then click the map";
  map.getCanvas().style.cursor = ["draw", "add-poi"].includes(mode) ? "crosshair" : "";
  renderRoute();
}

function finishDrawing() {
  if (state.route.length < 2) {
    state.route = [];
    setMessage("A path needs at least two points", true);
  } else {
    setMessage("Walking path created");
  }
  setMode("view");
}

function renderAll() {
  renderParking();
  renderPois();
  renderRoute();
}

function renderParking() {
  const source = map.getSource("parking");
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features: state.parkingAreas,
    });
  }
  elements.parkingCount.textContent = state.parkingAreas.length;
}

function renderPois() {
  const visiblePois = state.pois
    .map((poi, index) => ({
      ...poi,
      properties: {
        ...poi.properties,
        index,
        number: String(index + 1),
        selected: state.selectedPoi === index,
      },
    }))
    .filter((poi) => poi.properties.visible !== false);
  const source = map.getSource("pois");
  if (source) source.setData({ type: "FeatureCollection", features: visiblePois });
  elements.poiCount.textContent = state.pois.length;
  renderPoiOverlay();
  renderPoiList();
}

function renderPoiOverlay() {
  elements.poiOverlay.replaceChildren();
  state.pois.forEach((poi, index) => {
    if (poi.properties.visible === false) return;
    const item = document.createElement("div");
    item.className = `poi-overlay-item${state.selectedPoi === index ? " selected" : ""}`;
    item.dataset.index = index;

    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "poi-overlay-pin";
    pin.setAttribute("aria-label", `Edit ${poi.properties.label}`);
    pin.innerHTML = `
      <svg viewBox="0 0 34 44" aria-hidden="true">
        <path class="pin-ring" d="M17 0C7.6 0 0 7.6 0 17c0 12.5 17 27 17 27s17-14.5 17-27C34 7.6 26.4 0 17 0z"/>
        <path class="pin-fill" d="M17 4C9.8 4 4 9.8 4 17c0 8.8 9.5 19.2 13 22.7 3.5-3.5 13-13.9 13-22.7C30 9.8 24.2 4 17 4z"/>
        <circle class="pin-ring" cx="17" cy="17" r="8"/>
        <text class="pin-number" x="17" y="21">${index + 1}</text>
      </svg>`;
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      selectPoi(index);
    });
    pin.addEventListener("mousedown", (event) => startPoiDrag(event, index));

    const label = document.createElement("span");
    label.className = "poi-overlay-label";
    label.textContent = poi.properties.label;
    label.hidden = state.hidePoiLabels;
    item.append(pin, label);
    elements.poiOverlay.append(item);
  });
  positionPoiOverlay();
}

function positionPoiOverlay() {
  elements.poiOverlay.querySelectorAll(".poi-overlay-item").forEach((item) => {
    const index = Number(item.dataset.index);
    const point = map.project(state.pois[index].geometry.coordinates);
    item.style.left = `${point.x}px`;
    item.style.top = `${point.y}px`;
  });
}

function updateOverlays() {
  updateRouteOverlay();
  positionPoiOverlay();
}

function startPoiDrag(event, index) {
  if (["draw", "add-poi"].includes(state.mode)) return;
  event.preventDefault();
  event.stopPropagation();
  state.draggedPoi = index;
  state.selectedPoi = index;
  map.dragPan.disable();
  event.currentTarget.style.cursor = "grabbing";
  window.addEventListener("mousemove", movePoiDrag);
  window.addEventListener("mouseup", endPoiDrag, { once: true });
}

function movePoiDrag(event) {
  if (state.draggedPoi === null) return;
  const mapRect = map.getContainer().getBoundingClientRect();
  const coordinates = map.unproject([
    event.clientX - mapRect.left,
    event.clientY - mapRect.top,
  ]);
  state.pois[state.draggedPoi].geometry.coordinates = [coordinates.lng, coordinates.lat];
  updatePoiMapData();
  positionPoiOverlay();
}

function endPoiDrag(event) {
  const index = state.draggedPoi;
  window.removeEventListener("mousemove", movePoiDrag);
  state.draggedPoi = null;
  map.dragPan.enable();
  if (index === null) return;
  renderPois();
  setMessage(`${state.pois[index].properties.label} moved`);
}

function addPoiAt(coordinates) {
  const index = state.pois.length;
  const label = `POI ${index + 1}`;
  state.pois.push(pointFeature(coordinates, label));
  state.selectedPoi = index;
  renderPois();
  setMessage(`${label} added. Click the map to add another POI.`);
}

function renderPoiList() {
  elements.poiList.replaceChildren();
  if (!state.pois.length) {
    const empty = document.createElement("div");
    empty.className = "poi-empty";
    empty.textContent = "No POIs yet. Import points or add one on the map.";
    elements.poiList.append(empty);
    return;
  }

  state.pois.forEach((poi, index) => {
    const card = document.createElement("article");
    card.className = `poi-card${state.selectedPoi === index ? " selected" : ""}`;
    card.dataset.index = index;

    const name = document.createElement("input");
    name.className = "poi-name";
    name.value = poi.properties.label;
    name.setAttribute("aria-label", `POI ${index + 1} name`);
    name.addEventListener("focus", () => {
      selectPoi(index, false, false);
      name.dataset.replaceOnType = "true";
      name.select();
    });
    name.addEventListener("click", () => {
      name.dataset.replaceOnType = "true";
      name.select();
    });
    name.addEventListener("beforeinput", (event) => {
      if (
        name.dataset.replaceOnType === "true"
        && event.inputType.startsWith("insert")
      ) {
        name.value = "";
        name.dataset.replaceOnType = "false";
      }
    });
    name.addEventListener("input", () => {
      name.dataset.replaceOnType = "false";
      poi.properties.label = name.value || `POI ${index + 1}`;
      updatePoiMapData();
      const overlayLabel = elements.poiOverlay.querySelector(
        `.poi-overlay-item[data-index="${index}"] .poi-overlay-label`,
      );
      if (overlayLabel) overlayLabel.textContent = poi.properties.label;
    });

    const coordinates = document.createElement("div");
    coordinates.className = "coordinate-row";
    const lng = coordinateInput("Longitude", poi.geometry.coordinates[0], (value) => {
      poi.geometry.coordinates[0] = value;
      renderPois();
    });
    const lat = coordinateInput("Latitude", poi.geometry.coordinates[1], (value) => {
      poi.geometry.coordinates[1] = value;
      renderPois();
    });
    coordinates.append(lng, lat);

    const actions = document.createElement("div");
    actions.className = "poi-actions";
    const visibility = document.createElement("label");
    visibility.className = "poi-visibility";
    const visibilityInput = document.createElement("input");
    visibilityInput.type = "checkbox";
    visibilityInput.checked = poi.properties.visible !== false;
    visibilityInput.setAttribute("aria-label", `Show ${poi.properties.label} on map`);
    const visibilityText = document.createElement("span");
    visibilityText.textContent = "Show on map";
    visibilityInput.addEventListener("change", () => {
      poi.properties.visible = visibilityInput.checked;
      state.selectedPoi = index;
      renderPois();
      setMessage(
        visibilityInput.checked
          ? `${poi.properties.label} shown on map`
          : `${poi.properties.label} hidden from map`,
      );
    });
    visibility.append(visibilityInput, visibilityText);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-poi";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deletePoi(index));
    actions.append(visibility, remove);
    card.append(name, coordinates, actions);
    elements.poiList.append(card);
  });
}

function coordinateInput(label, value, onChange) {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.000001";
  input.value = Number(value).toFixed(6);
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  return input;
}

function updatePoiMapData() {
  const source = map.getSource("pois");
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features: state.pois
        .map((poi, index) => ({
          ...poi,
          properties: {
            ...poi.properties,
            index,
            number: String(index + 1),
            selected: state.selectedPoi === index,
          },
        }))
        .filter((poi) => poi.properties.visible !== false),
    });
  }
}

function selectPoi(index, moveMap = false, rebuildList = true) {
  state.selectedPoi = index;
  if (rebuildList) {
    renderPois();
  } else {
    elements.poiList.querySelectorAll(".poi-card").forEach((card) => {
      card.classList.toggle("selected", Number(card.dataset.index) === index);
    });
    renderPoiOverlay();
  }
  if (moveMap) {
    map.easeTo({ center: state.pois[index].geometry.coordinates, zoom: Math.max(map.getZoom(), 16) });
  }
  setMessage(`Editing ${state.pois[index].properties.label}`);
}

function deletePoi(index) {
  const label = state.pois[index].properties.label;
  state.pois.splice(index, 1);
  state.selectedPoi = state.pois.length ? Math.min(index, state.pois.length - 1) : null;
  renderPois();
  setMessage(`${label} deleted`);
}

function renderRoute() {
  const routeSource = map.getSource("route");
  const vertexSource = map.getSource("route-vertices");
  const routeFeatures = state.route.length >= 2
    ? [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: state.route },
    }]
    : [];
  const vertices = state.mode === "edit"
    ? state.route.map((coordinates, index) => ({
      type: "Feature",
      properties: { index },
      geometry: { type: "Point", coordinates },
    }))
    : [];

  if (routeSource) routeSource.setData({ type: "FeatureCollection", features: routeFeatures });
  if (vertexSource) vertexSource.setData({ type: "FeatureCollection", features: vertices });
  elements.routeCount.textContent = state.route.length;
  updateRouteOverlay();
  renderRouteMarkers();
}

function updateRouteOverlay() {
  const path = state.route
    .map((coordinates, index) => {
      const point = map.project(coordinates);
      return `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
  elements.routeOverlayOutline.setAttribute("d", state.route.length >= 2 ? path : "");
  elements.routeOverlayLine.setAttribute("d", state.route.length >= 2 ? path : "");
}

function renderRouteMarkers() {
  state.routeMarkers.forEach((marker) => marker.remove());
  state.routeMarkers = [];
  if (!map.loaded() || state.mode !== "edit") return;

  state.route.forEach((coordinates, index) => {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "route-map-handle";
    handle.setAttribute("aria-label", `Move path point ${index + 1}`);
    const marker = new maplibregl.Marker({
      element: handle,
      draggable: true,
      anchor: "center",
    })
      .setLngLat(coordinates)
      .addTo(map);
    marker.on("drag", () => {
      const position = marker.getLngLat();
      state.route[index] = [position.lng, position.lat];
      updateRouteOverlay();
    });
    marker.on("dragend", () => {
      renderRoute();
      setMessage(`Path point ${index + 1} moved`);
    });
    state.routeMarkers.push(marker);
  });
}

function visiblePoiCoordinates() {
  return state.pois
    .filter((feature) => feature.properties.visible !== false)
    .map((feature) => feature.geometry.coordinates);
}

function parkingCoordinates() {
  return state.parkingAreas.flatMap((feature) => feature.geometry.coordinates[0] || []);
}

function fitContent(options = {}) {
  const coordinates = [...visiblePoiCoordinates(), ...parkingCoordinates()];
  if (!coordinates.length) return setMessage("Show or add map content to fit", true);
  const padding = exportFramePadding();
  if (coordinates.length === 1) {
    map.easeTo({
      center: coordinates[0],
      zoom: 16,
      bearing: map.getBearing(),
      pitch: 0,
      padding,
      duration: 650,
    });
    setMessage(options.message || "Content fitted to the map");
    return;
  }
  const camera = bestFrameCamera(coordinates);
  map.easeTo({
    center: camera.center,
    zoom: camera.zoom,
    padding,
    bearing: camera.bearing,
    pitch: 0,
    duration: 650,
  });
  setMessage(options.message || "Content fitted to the map");
}

function bestFrameCamera(coordinates) {
  const frameRect = elements.cropFrame.getBoundingClientRect();
  const availableWidth = Math.max(
    80,
    frameRect.width - FRAME_INSET.left - FRAME_INSET.right,
  );
  const availableHeight = Math.max(
    80,
    frameRect.height - FRAME_INSET.top - FRAME_INSET.bottom,
  );
  const points = coordinates.map((coordinate) => {
    const mercator = maplibregl.MercatorCoordinate.fromLngLat(coordinate);
    return { x: mercator.x, y: mercator.y };
  });
  let best = null;

  for (let bearing = 0; bearing < 180; bearing += 3) {
    const radians = bearing * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const rotated = points.map((point) => ({
      x: point.x * cosine + point.y * sine,
      y: -point.x * sine + point.y * cosine,
    }));
    const xs = rotated.map((point) => point.x);
    const ys = rotated.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const zoomX = width ? Math.log2(availableWidth / (width * 512)) : 24;
    const zoomY = height ? Math.log2(availableHeight / (height * 512)) : 24;
    const zoom = Math.min(16, zoomX, zoomY);
    if (!best || zoom > best.zoom) {
      const rotatedCenter = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
      best = {
        bearing,
        zoom,
        centerPoint: {
          x: rotatedCenter.x * cosine - rotatedCenter.y * sine,
          y: rotatedCenter.x * sine + rotatedCenter.y * cosine,
        },
      };
    }
  }

  const center = new maplibregl.MercatorCoordinate(
    best.centerPoint.x,
    best.centerPoint.y,
    0,
  ).toLngLat();
  return { center, zoom: best.zoom, bearing: best.bearing };
}

function exportFramePadding() {
  const mapRect = map.getContainer().getBoundingClientRect();
  const frameRect = elements.cropFrame.getBoundingClientRect();
  return {
    top: Math.max(0, frameRect.top - mapRect.top + FRAME_INSET.top),
    right: Math.max(0, mapRect.right - frameRect.right + FRAME_INSET.right),
    bottom: Math.max(0, mapRect.bottom - frameRect.bottom + FRAME_INSET.bottom),
    left: Math.max(0, frameRect.left - mapRect.left + FRAME_INSET.left),
  };
}

function updateFrameShape() {
  const ratio = Number(elements.frameShape.value);
  const workspace = document.querySelector(".map-workspace");
  const maxWidth = workspace.clientWidth * 0.68;
  const maxHeight = workspace.clientHeight * 0.72;
  let width = Math.min(620, maxWidth);
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  elements.cropFrame.style.width = `${Math.max(180, width)}px`;
  elements.cropFrame.style.height = `${Math.max(180, height)}px`;
  elements.cropFrame.style.aspectRatio = "auto";
}

async function exportPng() {
  setMode("view");
  setMessage("Preparing PNG");
  await waitForMap();

  try {
    const sourceCanvas = map.getCanvas();
    const mapRect = sourceCanvas.getBoundingClientRect();
    const frameRect = elements.cropFrame.getBoundingClientRect();
    const scaleX = sourceCanvas.width / mapRect.width;
    const scaleY = sourceCanvas.height / mapRect.height;
    const sx = Math.max(0, (frameRect.left - mapRect.left) * scaleX);
    const sy = Math.max(0, (frameRect.top - mapRect.top) * scaleY);
    const sw = Math.min(sourceCanvas.width - sx, frameRect.width * scaleX);
    const sh = Math.min(sourceCanvas.height - sy, frameRect.height * scaleY);
    const output = document.createElement("canvas");
    output.width = Math.round(sw);
    output.height = Math.round(sh);
    const context = output.getContext("2d");
    context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, output.width, output.height);
    drawExportFeatures(context, mapRect, frameRect, scaleX, scaleY);
    drawExportDecorations(context, output);

    await downloadCanvas(output, "plainmap.png");
    if (elements.exportLegend.value === "separate") {
      await downloadCanvas(createLegendCanvas(), "plainmap-legend.png");
      setMessage("Map and legend PNGs exported");
    } else {
      setMessage("PNG exported");
    }
  } catch (error) {
    setMessage("Export failed. Check that map tiles finished loading.", true);
  }
}

function drawExportDecorations(context, output) {
  if (elements.exportLegend.value === "inside") {
    drawLegend(context, {
      x: Math.round(output.width * 0.035),
      y: Math.round(output.height * 0.035),
      maxWidth: Math.round(output.width * 0.44),
      maxHeight: Math.round(output.height * 0.9),
      scale: Math.max(0.8, Math.min(1.5, output.width / 700)),
    });
  }
  if (elements.exportCompass.checked) {
    drawCompass(
      context,
      output.width - Math.round(output.width * 0.085),
      Math.round(output.height * 0.09),
      Math.max(0.85, Math.min(1.5, output.width / 700)),
    );
  }
}

function drawCompass(context, x, y, scale) {
  const radius = 28 * scale;
  const bearing = map.getBearing() * Math.PI / 180;
  context.save();
  context.translate(x, y);
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  context.fill();
  context.lineWidth = 2 * scale;
  context.strokeStyle = state.colors.poi;
  context.stroke();

  context.rotate(-bearing);
  context.beginPath();
  context.moveTo(0, -19 * scale);
  context.lineTo(7 * scale, 8 * scale);
  context.lineTo(0, 4 * scale);
  context.lineTo(-7 * scale, 8 * scale);
  context.closePath();
  context.fillStyle = state.colors.route;
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1.5 * scale;
  context.stroke();
  context.fillStyle = state.colors.poi;
  context.font = `900 ${10 * scale}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("N", 0, -radius - 8 * scale);
  context.restore();
}

function legendItems() {
  const items = [];
  if (state.route.length >= 2) {
    items.push({ type: "route", label: "Walking path" });
  }
  if (state.parkingAreas.length) {
    items.push({ type: "parking", label: "Parking" });
  }
  state.pois.forEach((poi, index) => {
    if (poi.properties.visible === false) return;
    items.push({
      type: "poi",
      number: index + 1,
      label: poi.properties.label || `POI ${index + 1}`,
    });
  });
  return items;
}

function drawLegend(context, options) {
  const { x, y, maxWidth, maxHeight, scale } = options;
  const items = legendItems();
  const padding = 14 * scale;
  const titleHeight = 25 * scale;
  const rowHeight = 24 * scale;
  const availableRows = Math.max(
    1,
    Math.floor((maxHeight - padding * 2 - titleHeight) / rowHeight),
  );
  const itemLimit = items.length > availableRows ? Math.max(1, availableRows - 1) : availableRows;
  const shownItems = items.slice(0, itemLimit);
  const hasMore = items.length > shownItems.length;
  const rows = shownItems.length + (hasMore ? 1 : 0);
  const width = Math.max(170 * scale, maxWidth);
  const height = padding * 2 + titleHeight + Math.max(1, rows) * rowHeight;

  context.save();
  roundedRect(context, x, y, width, height, 10 * scale);
  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  context.fill();
  context.lineWidth = 2 * scale;
  context.strokeStyle = "rgba(20, 33, 61, 0.9)";
  context.stroke();

  context.fillStyle = state.colors.poi;
  context.font = `900 ${12 * scale}px sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText("LEGEND", x + padding, y + padding + 6 * scale);

  if (!items.length) {
    drawLegendText(
      context,
      "No visible map items",
      x + padding,
      y + padding + titleHeight,
      width - padding * 2,
      scale,
    );
    context.restore();
    return;
  }

  shownItems.forEach((item, index) => {
    const rowY = y + padding + titleHeight + index * rowHeight + rowHeight / 2;
    if (item.type === "route") {
      context.beginPath();
      context.moveTo(x + padding, rowY);
      context.lineTo(x + padding + 22 * scale, rowY);
      context.strokeStyle = "#ffffff";
      context.lineWidth = 7 * scale;
      context.stroke();
      context.strokeStyle = state.colors.route;
      context.lineWidth = 4 * scale;
      context.stroke();
    } else if (item.type === "parking") {
      context.fillStyle = "rgba(79, 137, 198, 0.45)";
      context.fillRect(
        x + padding,
        rowY - 7 * scale,
        22 * scale,
        14 * scale,
      );
      context.strokeStyle = "#356da8";
      context.lineWidth = 2 * scale;
      context.strokeRect(
        x + padding,
        rowY - 7 * scale,
        22 * scale,
        14 * scale,
      );
    } else {
      context.beginPath();
      context.arc(x + padding + 10 * scale, rowY, 9 * scale, 0, Math.PI * 2);
      context.fillStyle = state.colors.poi;
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = `900 ${9 * scale}px sans-serif`;
      context.textAlign = "center";
      context.fillText(String(item.number), x + padding + 10 * scale, rowY);
    }
    drawLegendText(
      context,
      item.label,
      x + padding + 32 * scale,
      rowY,
      width - padding * 2 - 32 * scale,
      scale,
    );
  });

  if (hasMore) {
    const rowY = y + padding + titleHeight + shownItems.length * rowHeight + rowHeight / 2;
    drawLegendText(
      context,
      `+${items.length - shownItems.length} more`,
      x + padding + 32 * scale,
      rowY,
      width - padding * 2 - 32 * scale,
      scale,
    );
  }
  context.restore();
}

function drawLegendText(context, text, x, y, maxWidth, scale) {
  context.fillStyle = state.colors.poi;
  context.font = `700 ${11 * scale}px sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  let output = text;
  while (output.length > 1 && context.measureText(output).width > maxWidth) {
    output = output.slice(0, -1);
  }
  if (output !== text) output = `${output.slice(0, -1)}...`;
  context.fillText(output, x, y);
}

function createLegendCanvas() {
  const items = legendItems();
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = Math.max(220, 128 + Math.max(1, items.length) * 48);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawLegend(context, {
    x: 24,
    y: 24,
    maxWidth: canvas.width - 48,
    maxHeight: canvas.height - 48,
    scale,
  });
  return canvas;
}

async function downloadCanvas(canvas, filename) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The image could not be created.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawExportFeatures(context, mapRect, frameRect, scaleX, scaleY) {
  const exportPoint = (coordinates) => {
    const point = map.project(coordinates);
    return {
      x: (point.x - (frameRect.left - mapRect.left)) * scaleX,
      y: (point.y - (frameRect.top - mapRect.top)) * scaleY,
    };
  };

  if (state.route.length >= 2) {
    const points = state.route.map(exportPoint);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    points.forEach((point, index) => {
      if (index) context.lineTo(point.x, point.y);
      else context.moveTo(point.x, point.y);
    });
    context.strokeStyle = "#ffffff";
    context.lineWidth = 13 * scaleX;
    context.stroke();
    context.strokeStyle = state.colors.route;
    context.lineWidth = 8 * scaleX;
    context.stroke();
  }

  state.pois
    .map((poi, index) => ({ poi, index }))
    .filter(({ poi }) => poi.properties.visible !== false)
    .forEach(({ poi, index }) => {
      drawExportPin(
        context,
        exportPoint(poi.geometry.coordinates),
        index + 1,
        poi.properties.label || `POI ${index + 1}`,
        (scaleX + scaleY) / 2,
      );
    });
}

function drawExportPin(context, point, number, label, scale) {
  const width = 34 * scale;
  const height = 44 * scale;
  const left = point.x - width / 2;
  const top = point.y - height;

  context.save();
  context.translate(left, top);
  context.scale(scale, scale);

  context.beginPath();
  context.moveTo(17, 44);
  context.bezierCurveTo(13, 39, 0, 28, 0, 17);
  context.arc(17, 17, 17, Math.PI, 0);
  context.bezierCurveTo(34, 28, 21, 39, 17, 44);
  context.closePath();
  context.fillStyle = "#ffffff";
  context.fill();

  context.beginPath();
  context.moveTo(17, 39.5);
  context.bezierCurveTo(13.5, 35.5, 4, 26, 4, 17);
  context.arc(17, 17, 13, Math.PI, 0);
  context.bezierCurveTo(30, 26, 20.5, 35.5, 17, 39.5);
  context.closePath();
  context.fillStyle = state.colors.poi;
  context.fill();

  context.beginPath();
  context.arc(17, 17, 8, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.fillStyle = state.colors.poi;
  context.font = "900 11px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(number), 17, 17.5);
  context.restore();

  if (state.hidePoiLabels) return;
  const fontSize = 11 * scale;
  const paddingX = 7 * scale;
  const labelHeight = 24 * scale;
  const labelX = point.x + 23 * scale;
  const labelY = point.y - 39 * scale;
  context.save();
  context.font = `800 ${fontSize}px sans-serif`;
  const labelWidth = context.measureText(label).width + paddingX * 2;
  roundedRect(context, labelX, labelY, labelWidth, labelHeight, 6 * scale);
  context.fillStyle = "rgba(20, 33, 61, 0.96)";
  context.fill();
  context.lineWidth = 2 * scale;
  context.strokeStyle = "#ffffff";
  context.stroke();
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(label, labelX + paddingX, labelY + labelHeight / 2);
  context.restore();
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function waitForMap() {
  if (map.loaded() && map.areTilesLoaded()) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    map.once("idle", finish);
    window.setTimeout(finish, 1500);
  });
}

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.style.color = isError ? "#b9382b" : "";
}

updateFrameShape();
