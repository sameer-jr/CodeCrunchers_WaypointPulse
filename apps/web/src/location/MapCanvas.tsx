import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { TripLocation } from '@waypoint/shared';
import 'leaflet/dist/leaflet.css';

export function MapCanvas({ data }: { data: TripLocation }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const currentPoints = useRef<L.LatLngTuple[]>([]);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { scrollWheelZoom: false, attributionControl: true });
    map.current = instance;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(instance);
    tiles.on('tileerror', () => setTileError(true));
    layer.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; layer.current = null; fitted.current = false; };
  }, []);
  useEffect(() => {
    const instance = map.current, markers = layer.current;
    if (!instance || !markers) return;
    markers.clearLayers();
    const stops = data.stops.filter(stop => !!stop.location);
    const points: L.LatLngTuple[] = [];
    for (const stop of stops) {
      const location = stop.location!;
      const point: L.LatLngTuple = [location.latitude, location.longitude];
      points.push(point);
      const popup = document.createElement('div');
      popup.textContent = 'Stop ' + stop.sequence + ' · ' + stop.outletRef + (location.label ? ' · ' + location.label : '');
      L.marker(point, { icon: L.divIcon({ className: 'waypoint-map-pin', html: String(stop.sequence), iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .bindPopup(popup).addTo(markers);
    }
    if (points.length > 1) L.polyline(points, { color: '#648d2a', weight: 3, dashArray: '7 6' }).addTo(markers);
    if (data.position) {
      const point: L.LatLngTuple = [data.position.latitude, data.position.longitude];
      points.push(point);
      L.circle(point, { radius: data.position.accuracyMetres, color: '#3978b6', weight: 1, fillOpacity: .08 }).addTo(markers);
      const popup = document.createElement('div');
      popup.textContent = (data.positionStale || data.status !== 'IN_TRANSIT' ? 'Last recorded vehicle location' : 'Reported vehicle location') + ' · accuracy ±' + Math.round(data.position.accuracyMetres) + ' m';
      L.circleMarker(point, { radius: 9, color: '#ffffff', weight: 3, fillColor: '#2a73b9', fillOpacity: 1 }).bindPopup(popup).addTo(markers);
    }
    currentPoints.current = points;
    if (!fitted.current && points.length) {
      instance.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
      fitted.current = true;
    }
  }, [data]);
  const fitLocations = () => { if (currentPoints.current.length) map.current?.fitBounds(L.latLngBounds(currentPoints.current), { padding: [32, 32], maxZoom: 15 }); };
  return <><div ref={host} className="waypoint-map-canvas" role="region" aria-label="Delivery stops and reported vehicle location" /><button type="button" className="btn secondary" onClick={fitLocations}>Fit all locations</button>{tileError && <p className="location-note" role="status">Map tiles could not load. Recorded coordinates and delivery stops remain available below.</p>}</>;
}
