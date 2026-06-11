from typing import Any, Literal

from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class POI(BaseModel):
    id: str
    position: Coordinate
    label: str
    description: str = ""
    marker: str = ""
    category: str = "photo-stop"
    icon: str = "photo_camera"
    color: str = "#F97316"
    display_mode: Literal["auto", "icon", "text", "reference"] = "auto"
    short_text: str = ""
    use_category_defaults: bool = True
    selected: bool = True
    show_label: bool = True


class ParkingArea(BaseModel):
    id: str
    label: str = "Parking"
    kind: Literal["recommended", "overflow", "unavailable"] = "recommended"
    coordinates: list[Coordinate]
    color: str = "#8E5AD7"
    opacity: float = Field(default=0.35, ge=0, le=1)
    border_color: str = "#6F3EB8"
    show_icon: bool = True


class Palette(BaseModel):
    route: str = "#F5D61E"
    meeting: str = "#F5D61E"
    poi: str = "#F97316"
    parking: str = "#8E5AD7"
    overflow: str = "#4DA3FF"
    background: str = "#F7F5EF"
    text: str = "#111111"


class CompassSettings(BaseModel):
    visible: bool = True
    position: Literal["top-left", "top-right", "bottom-left", "bottom-right"] = "top-right"
    size: int = Field(default=72, ge=40, le=160)
    color: str = "#111111"
    locked: bool = False
    snap: bool = True
    custom_position: dict[str, float] = Field(default_factory=dict)


class LegendSettings(BaseModel):
    visible: bool = True
    position: dict[str, float] = Field(default_factory=lambda: {"x": 20, "y": 20})
    width: int = 190
    height: int = 0
    locked: bool = False
    snap: bool = True
    items: dict[str, bool] = Field(
        default_factory=lambda: {
            "meeting": True,
            "parking": True,
            "route": True,
            "photoStops": True,
            "arrows": True,
        }
    )


class ExportSettings(BaseModel):
    preset: str = "portrait"
    width: int = 1080
    height: int = 1350


class ExportBoundary(BaseModel):
    enabled: bool = True
    visible: bool = True
    center: Coordinate = Field(default_factory=lambda: Coordinate(lat=30.2672, lng=-97.7431))
    width: float = Field(default=420, ge=80)
    height: float = Field(default=525, ge=80)
    rotation: float = Field(default=0, ge=-180, le=180)
    aspect_ratio: float = Field(default=0.8, gt=0)
    lock_aspect: bool = True
    bounds: dict[str, float] = Field(default_factory=dict)


class Project(BaseModel):
    version: int = 4
    project_id: str | None = None
    owner_id: str | None = None
    name: str = "Untitled map"
    center: Coordinate = Field(default_factory=lambda: Coordinate(lat=30.2672, lng=-97.7431))
    zoom: float = Field(default=15, ge=10, le=20)
    detail_level: Literal["minimal", "standard", "detailed"] = "standard"
    poi_marker_mode: Literal["letters", "numbers", "icons"] = "letters"
    poi_simple_markers: bool = False
    workflow_stage: int = Field(default=0, ge=0, le=7)
    quick_edit_mode: bool = False
    pois: list[POI] = Field(default_factory=list)
    route: list[Coordinate] = Field(default_factory=list)
    route_mode: Literal["straight", "walking", "manual"] = "straight"
    show_arrows: bool = True
    parking: list[ParkingArea] = Field(default_factory=list)
    palette: Palette = Field(default_factory=Palette)
    rotation: float = 0
    orientation_mode: Literal["north", "route", "custom"] = "north"
    compass: CompassSettings = Field(default_factory=CompassSettings)
    legend: LegendSettings = Field(default_factory=LegendSettings)
    export: ExportSettings = Field(default_factory=ExportSettings)
    export_boundary: ExportBoundary = Field(default_factory=ExportBoundary)
    imported_features: dict[str, Any] = Field(
        default_factory=lambda: {"type": "FeatureCollection", "features": []}
    )
    imported_layers: list[dict[str, Any]] = Field(default_factory=list)


class RouteRequest(BaseModel):
    coordinates: list[Coordinate]
