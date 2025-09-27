<script lang="ts">
  import { onMount } from 'svelte';
  import L, { Map as LeafletMap } from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import 'leaflet-draw';
  import 'leaflet-draw/dist/leaflet.draw.css';

  let mapContainer: HTMLDivElement | null = null;
  let map: LeafletMap | null = null;
  let drawnPolygon: any = null; // single polygon reference
  let streets: string[] = [];
  let loading = false;
  let errorMsg: string | null = null;
  let lastQueryTime = 0; // debounce timestamp

  function polygonToOverpassPoly(polygon: any): string {
    const rings = polygon.getLatLngs();
    const first = Array.isArray(rings[0]) ? rings[0] : rings; // handle nested ring structure
    return first.map((pt: any) => `${pt.lat} ${pt.lng}`).join(' ');
  }

  async function fetchStreetsForPolygon(polygon: any) {
    if (!polygon) return;
    const now = Date.now();
    if (now - lastQueryTime < 1500) return; // debounce 1.5s
    lastQueryTime = now;
    loading = true;
    errorMsg = null;
    streets = [];
    try {
      const poly = polygonToOverpassPoly(polygon);
      // Query named highway ways whose geometry intersects the polygon (poly filter)
      const query = `[out:json][timeout:30];\n(way[highway][name](poly:"${poly}"););\nout tags;`;
      const body = new URLSearchParams({ data: query });
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' }
      });
      if (!resp.ok) throw new Error(`Overpass error ${resp.status}`);
      const json = await resp.json();
      const names = new Set<string>();
      if (Array.isArray(json.elements)) {
        for (const el of json.elements) {
          if (el.type === 'way' && el.tags?.name) names.add(el.tags.name);
        }
      }
      streets = Array.from(names).sort((a, b) => a.localeCompare(b));
    } catch (err: any) {
      errorMsg = err.message || 'Failed to load streets';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!mapContainer) return;
    map = L.map(mapContainer, {
      center: [55.9533, -3.1883],
      zoom: 13
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new (L as any).Control.Draw({
      draw: {
        polygon: {
          allowIntersection: true,
          shapeOptions: { color: '#1d4ed8', weight: 3 }
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

    map.on('draw:drawstart', (e: any) => {
      // For simple usage of the app, only allow drawing one polygon at a time
      if (e.layerType === 'polygon') {
        drawnItems.clearLayers();
        drawnPolygon = null;
        streets = [];
        errorMsg = null;
      }
    });

    map.on('draw:created', (e: any) => {
      const { layer, layerType } = e;
      if (layerType === 'polygon') {
        drawnItems.addLayer(layer);
        drawnPolygon = layer;
        if (layer.getLatLngs) console.log('Polygon created:', layer.getLatLngs());
        fetchStreetsForPolygon(layer);
      }
    });

    map.on('draw:edited', (e: any) => {
      e.layers.eachLayer((layer: any) => {
        drawnPolygon = layer;
        fetchStreetsForPolygon(layer);
      });
    });

    map.on('draw:deleted', () => {
      drawnPolygon = null;
      streets = [];
      errorMsg = null;
    });

    return () => {
      map?.remove();
      map = null;
    };
  });
</script>

<div bind:this={mapContainer} class="map-root"></div>

<div class="results-panel">
  {#if !drawnPolygon}
    <p class="muted">Draw a polygon to list street names.</p>
  {:else if loading}
    <p>Loading street names…</p>
  {:else if errorMsg}
    <p class="error">{errorMsg}</p>
    <p>
      There are some limits on queries per second/minute. Depending on the error try clicking
      'Retry'
    </p>
    <button on:click={() => fetchStreetsForPolygon(drawnPolygon)}>Retry</button>
  {:else if streets.length === 0}
    <p>No named streets found inside polygon.</p>
    <button on:click={() => fetchStreetsForPolygon(drawnPolygon)}>Refresh</button>
  {:else}
    <div class="header-row">
      <h3>Streets ({streets.length})</h3>
      <div class="actions">
        <button title="Copy list" on:click={() => navigator.clipboard.writeText(streets.join('\n'))}
          >Copy</button
        >
      </div>
    </div>
    <ul>
      {#each streets as name}
        <li>{name}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .map-root {
    position: fixed;
    inset: 0;
  }
  :global(.leaflet-control) {
    z-index: 1000;
  }
  .results-panel {
    position: fixed;
    top: 0.75rem;
    right: 0.75rem;
    max-height: 60vh;
    width: 260px;
    overflow: auto;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(4px);
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0.75rem 0.85rem 0.9rem;
    font:
      13px system-ui,
      sans-serif;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    z-index: 1100;
  }
  .results-panel h3 {
    margin: 0;
    font-size: 14px;
  }
  .results-panel ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    font-size: 12px;
    line-height: 1.25;
  }
  .results-panel li {
    margin: 0 0 2px;
  }
  .muted {
    color: #555;
    margin: 0;
    font-size: 12px;
  }
  .error {
    color: #b91c1c;
    font-size: 12px;
    margin: 0 0 0.5rem;
  }
  .results-panel button {
    cursor: pointer;
    font-size: 11px;
    padding: 2px 6px;
    background: #1d4ed8;
    color: #fff;
    border: none;
    border-radius: 4px;
  }
  .results-panel button:hover {
    background: #1e40af;
  }
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
  }
</style>
