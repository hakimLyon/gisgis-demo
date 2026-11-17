#!/usr/bin/env python3
"""Prépare les données de la démo à partir de sources ouvertes.

Ce script télécharge :
  - les bâtiments OpenStreetMap de la zone d'étude de Médina Gounass (API OSM, licence ODbL) ;
  - le modèle numérique de terrain « Terrarium » (AWS Terrain Tiles, issu notamment de SRTM) ;
  - l'emprise du stade Abdoulaye Wade à Diamniadio (OpenStreetMap).

Il calcule l'altitude du sol sous chaque bâtiment et la courbe « surface sous un niveau d'eau »
utilisées par la simulation d'inondation, puis écrit les fichiers dans data/.

Usage : python3 scripts/prepare_data.py   (Python 3.9+, bibliothèque standard uniquement)
"""

import json
import math
import time
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
HEADERS = {"User-Agent": "gisgis-demo-data-prep/1.0"}

DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
DEM_ZOOM = 14  # même niveau que la source « dem » de la carte (≈ 9 m par pixel ici)

# Zone d'étude de Médina Gounass (lon_min, lat_min, lon_max, lat_max)
GOUNASS_BBOX = (-17.392, 14.764, -17.372, 14.779)
# Zone autour du stade Abdoulaye Wade (Diamniadio) et identifiant OSM de son emprise
DIAMNIADIO_BBOX = (-17.2060, 14.7290, -17.1970, 14.7365)
STADIUM_WAY_ID = "1085450274"

DEFAULT_HEIGHT = 3.5  # mètres, quand OSM ne renseigne ni hauteur ni nombre de niveaux
LEVEL_HEIGHT = 3.2


def fetch(url):
    request = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 3)


# ---------------------------------------------------------------- PNG (Terrarium)

def decode_png(blob):
    """Décode un PNG 8 bits (RGB, RGBA ou palette) en liste de lignes de pixels RGB."""
    assert blob[:8] == b"\x89PNG\r\n\x1a\n", "fichier PNG invalide"
    pos, idat, palette = 8, b"", None
    width = height = color_type = None
    while pos < len(blob):
        length = int.from_bytes(blob[pos:pos + 4], "big")
        kind = blob[pos + 4:pos + 8]
        chunk = blob[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width = int.from_bytes(chunk[0:4], "big")
            height = int.from_bytes(chunk[4:8], "big")
            bit_depth, color_type = chunk[8], chunk[9]
            assert bit_depth == 8, "profondeur PNG non gérée"
        elif kind == b"PLTE":
            palette = chunk
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
    channels = {2: 3, 6: 4, 3: 1, 0: 1}[color_type]
    raw = zlib.decompress(idat)
    stride = width * channels
    rows, previous, offset = [], bytearray(stride), 0
    for _ in range(height):
        filter_type = raw[offset]
        line = bytearray(raw[offset + 1:offset + 1 + stride])
        offset += 1 + stride
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            up_left = previous[i - channels] if i >= channels else 0
            if filter_type == 1:
                line[i] = (line[i] + left) & 0xFF
            elif filter_type == 2:
                line[i] = (line[i] + up) & 0xFF
            elif filter_type == 3:
                line[i] = (line[i] + ((left + up) >> 1)) & 0xFF
            elif filter_type == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                predictor = left if pa <= pb and pa <= pc else (up if pb <= pc else up_left)
                line[i] = (line[i] + predictor) & 0xFF
        previous = line
        if color_type == 3:
            rows.append(bytearray(b"".join(palette[v * 3:v * 3 + 3] for v in line)))
        elif color_type == 6:
            rows.append(bytearray(b for j, b in enumerate(line) if j % 4 != 3))
        elif color_type == 0:
            rows.append(bytearray(b for v in line for b in (v, v, v)))
        else:
            rows.append(line)
    return width, height, rows


class Terrain:
    """Échantillonne l'altitude (m) à partir des tuiles Terrarium, avec interpolation bilinéaire."""

    def __init__(self, zoom=DEM_ZOOM):
        self.zoom = zoom
        self.tiles = {}

    def _tile(self, x, y):
        key = (x, y)
        if key not in self.tiles:
            _, _, rows = decode_png(fetch(DEM_URL.format(z=self.zoom, x=x, y=y)))
            grid = []
            for row in rows:
                grid.append([row[i] * 256 + row[i + 1] + row[i + 2] / 256 - 32768 for i in range(0, len(row), 3)])
            self.tiles[key] = grid
        return self.tiles[key]

    def _pixel(self, px, py):
        tx, ty = int(px // 256), int(py // 256)
        return self._tile(tx, ty)[int(py) % 256][int(px) % 256]

    def elevation(self, lon, lat):
        n = 2 ** self.zoom * 256
        px = (lon + 180) / 360 * n - 0.5
        lat_r = math.radians(lat)
        py = (1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n - 0.5
        x0, y0 = math.floor(px), math.floor(py)
        fx, fy = px - x0, py - y0
        top = self._pixel(x0, y0) * (1 - fx) + self._pixel(x0 + 1, y0) * fx
        bottom = self._pixel(x0, y0 + 1) * (1 - fx) + self._pixel(x0 + 1, y0 + 1) * fx
        return top * (1 - fy) + bottom * fy


# ---------------------------------------------------------------- OpenStreetMap

def osm_ways(bbox):
    url = "https://api.openstreetmap.org/api/0.6/map?bbox={},{},{},{}".format(*bbox)
    root = ET.fromstring(fetch(url))
    nodes = {n.get("id"): (float(n.get("lon")), float(n.get("lat"))) for n in root.iter("node")}
    for way in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in way.iter("tag")}
        refs = [nd.get("ref") for nd in way.iter("nd")]
        if len(refs) < 4 or refs[0] != refs[-1] or not all(r in nodes for r in refs):
            continue
        yield way.get("id"), tags, [nodes[r] for r in refs]


def ring_area_m2(ring):
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    k = 6371008.8 * math.pi / 180
    pts = [(p[0] * k * math.cos(lat0), p[1] * k) for p in ring]
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:]))) / 2


def centroid(ring):
    area = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(area) < 1e-14:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return cx / (3 * area), cy / (3 * area)


def building_height(tags):
    for key in ("height", "building:height"):
        try:
            return round(float(tags[key].replace("m", "").strip()), 1)
        except (KeyError, ValueError):
            pass
    try:
        return round(float(tags["building:levels"]) * LEVEL_HEIGHT, 1)
    except (KeyError, ValueError):
        return DEFAULT_HEIGHT


def round_ring(ring):
    return [[round(lon, 6), round(lat, 6)] for lon, lat in ring]


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {path.relative_to(ROOT)}  ({path.stat().st_size / 1024:.0f} Ko)")


# ---------------------------------------------------------------- Préparation

def prepare_gounass(terrain):
    lon_min, lat_min, lon_max, lat_max = GOUNASS_BBOX
    features = []
    for way_id, tags, ring in osm_ways(GOUNASS_BBOX):
        if "building" not in tags:
            continue
        lon, lat = centroid(ring)
        if not (lon_min <= lon <= lon_max and lat_min <= lat <= lat_max):
            continue
        props = {"id": int(way_id), "z": round(terrain.elevation(lon, lat), 1), "h": building_height(tags)}
        if tags.get("name"):
            props["n"] = tags["name"]
        features.append({"type": "Feature", "properties": props,
                         "geometry": {"type": "Polygon", "coordinates": [round_ring(ring)]}})
    write_json(DATA / "gounass-batiments.geojson", {"type": "FeatureCollection", "features": features})

    # Courbe hypsométrique : surface de la zone d'étude située sous chaque altitude (pas de 0,1 m)
    step_deg = 0.00009  # ≈ 10 m
    k = 6371008.8 * math.pi / 180
    cell_m2 = (step_deg * k) * (step_deg * k * math.cos(math.radians((lat_min + lat_max) / 2)))
    samples = []
    lat = lat_min + step_deg / 2
    while lat < lat_max:
        lon = lon_min + step_deg / 2
        while lon < lon_max:
            samples.append(terrain.elevation(lon, lat))
            lon += step_deg
        lat += step_deg
    low = math.floor(min(samples) * 10) / 10
    high = math.ceil(max(samples) * 10) / 10
    bins = int(round((high - low) / 0.1)) + 1
    counts = [0] * bins
    for z in samples:
        counts[min(bins - 1, int((z - low) / 0.1))] += 1
    cumulative, total = [], 0
    for c in counts:
        total += c
        cumulative.append(round(total * cell_m2 / 10000, 2))
    elevations = sorted(f["properties"]["z"] for f in features)
    write_json(DATA / "gounass-hypsometrie.json", {
        "bbox": list(GOUNASS_BBOX), "start": low, "step": 0.1, "hectaresBelow": cumulative,
        "terrainMin": round(min(samples), 1), "terrainMax": round(max(samples), 1),
        "buildingsMedianZ": elevations[len(elevations) // 2] if elevations else None,
        "source": "AWS Terrain Tiles (Terrarium), zoom 14"})
    print(f"  {len(features)} bâtiments ; terrain de {min(samples):.1f} à {max(samples):.1f} m")


def prepare_diamniadio():
    for way_id, tags, ring in osm_ways(DIAMNIADIO_BBOX):
        if way_id == STADIUM_WAY_ID:
            props = {"name": tags.get("name", "Stade"), "areaHa": round(ring_area_m2(ring) / 10000, 2)}
            write_json(DATA / "diamniadio-stade.geojson", {"type": "FeatureCollection", "features": [
                {"type": "Feature", "properties": props,
                 "geometry": {"type": "Polygon", "coordinates": [round_ring(ring)]}}]})
            print(f"  emprise du stade : {props['areaHa']} ha")
            return
    raise SystemExit("Emprise du stade introuvable dans OpenStreetMap")


if __name__ == "__main__":
    DATA.mkdir(exist_ok=True)
    print("Médina Gounass")
    prepare_gounass(Terrain())
    print("Diamniadio")
    prepare_diamniadio()
