<script lang="ts">
  import { onMount } from 'svelte';
  import L, { Map as LeafletMap } from 'leaflet';
  import 'leaflet/dist/leaflet.css';

  let mapContainer: HTMLDivElement | null = null;
  let map: LeafletMap | null = null;

  onMount(() => {
    if (!mapContainer) return;
    map = L.map(mapContainer, {
      center: [55.9, 3.1], // USA-ish center
      zoom: 4
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

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
