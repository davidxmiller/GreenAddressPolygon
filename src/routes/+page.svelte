<script lang="ts">
  import { onMount } from 'svelte';
  import L, { Map as LeafletMap } from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import 'leaflet-draw';
  import 'leaflet-draw/dist/leaflet.draw.css';

  let mapContainer: HTMLDivElement | null = null;
  let map: LeafletMap | null = null;

  onMount(() => {
    if (!mapContainer) return;
    map = L.map(mapContainer, {
      center: [55.9533, -3.1883],
      zoom: 13
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new (L as any).Control.Draw({
      draw: {
        polygon: {
          allowIntersection: true,
          shapeOptions: { color: '#1d4ed8', weight: 3 },
        },
        marker: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        rectangle: false
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });
    map.addControl(drawControl);

    map.on('draw:created', (e: any) => {
      const { layer } = e;
      drawnItems.addLayer(layer);
      if (layer.getLatLngs) {
        const coords = layer.getLatLngs();
        console.log('Polygon created:', coords);
      }
    });

    map.on('draw:edited', (e: any) => {
      console.log('Polygons edited:', e.layers.getLayers().length);
    });

    map.on('draw:deleted', (e: any) => {
      console.log('Polygons deleted:', e.layers.getLayers().length);
    });

    return () => {
      map?.remove();
      map = null;
    };
  });
</script>

<div bind:this={mapContainer} class="map-root"></div>

<style>
  .map-root {
    position: fixed;
    inset: 0;
  }
  :global(.leaflet-control) { z-index: 1000; }
</style>
