<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import 'leaflet-draw';
  import 'leaflet-draw/dist/leaflet.draw.css';

  let mapContainer: HTMLDivElement | null = null;
  let map: L.Map | null = null;
  let drawnPolygon: L.Polygon | null = null; // single polygon reference
  let streets: string[] = [];
  let loading = false;
  let errorMsg: string | null = null;
  let lastQueryTime = 0; // debounce timestamp

  function polygonToOverpassPoly(polygonOrPolygons: L.Polygon): string {
    const polygonOrPolygonsLatLngs = polygonOrPolygons.getLatLngs();
    if (
      !Array.isArray(polygonOrPolygonsLatLngs) ||
      polygonOrPolygonsLatLngs.length === 0 ||
      polygonOrPolygonsLatLngs.length > 1
    ) {
      throw new Error(
        'Invalid polygon structure. You probably can`t fix this, there is a bug in the code, but you could try drawing a different polygon.'
      );
    }
    const polygon = polygonOrPolygonsLatLngs[0] as L.LatLng[];
    return polygon.map((pt: any) => `${pt.lat} ${pt.lng}`).join(' ');
  }

  async function fetchStreetsForPolygon(polygon: L.Polygon) {
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
      if (!resp.ok) {
        if (resp.status === 429) {
          throw new Error(
            `Overpass error 429 (rate limit). There are some limits on queries per second/minute. Depending on the error try clicking 'Retry'`
          );
        }
        throw new Error(`Overpass error ${resp.status}`);
      }
      const json = await resp.json();
      // Use a Set for efficient de-duplication (ephemeral, not reactive itself)
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const names = new Set<string>();
      if (Array.isArray(json.elements)) {
        for (const el of json.elements as Array<{ type: string; tags?: Record<string, string> }>) {
          if (el.type === 'way' && el.tags?.name) names.add(el.tags.name);
        }
      }
      streets = Array.from(names).sort((a, b) => a.localeCompare(b));
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : 'Failed to load streets';
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

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false, // Overpass doesn't support self-intersection, don't want anyway
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

    map.on(L.Draw.Event.DRAWSTART, (ev: L.LeafletEvent) => {
      const e = ev as L.DrawEvents.DrawStart;
      if (e.layerType === 'polygon') {
        drawnItems.clearLayers();
        drawnPolygon = null;
        streets = [];
        errorMsg = null;
      }
    });

    map.on(L.Draw.Event.CREATED, (ev: L.LeafletEvent) => {
      const e = ev as L.DrawEvents.Created;
      if (e.layerType === 'polygon') {
        const layer = e.layer as L.Polygon;
        drawnItems.addLayer(layer);
        drawnPolygon = layer;
        fetchStreetsForPolygon(layer);
      }
    });

    map.on(L.Draw.Event.EDITED, (ev: L.LeafletEvent) => {
      const e = ev as L.DrawEvents.Edited;
      e.layers.eachLayer((layer: L.Layer) => {
        drawnPolygon = layer as L.Polygon;
        fetchStreetsForPolygon(drawnPolygon);
      });
    });

    map.on(L.Draw.Event.DELETED, () => {
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
    <p class="muted">
      Draw a polygon to list street names within. Any <i>street</i> partially included will be included.
    </p>
  {:else if loading}
    <p>Loading street names…</p>
  {:else if errorMsg}
    <p class="error">{errorMsg}</p>
    <button on:click={() => fetchStreetsForPolygon(drawnPolygon!)}>Retry</button>
  {:else if streets.length === 0}
    <p>No named streets found inside polygon.</p>
    <button on:click={() => fetchStreetsForPolygon(drawnPolygon!)}>Refresh</button>
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
      <!-- eslint-disable-next-line svelte/require-each-key -->
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
      20px system-ui,
      sans-serif;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    z-index: 1100;
  }
  .results-panel h3 {
    margin: 0;
    font-size: 22px;
  }
  .results-panel ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    font-size: 18px;
    line-height: 1.25;
  }
  .results-panel li {
    margin: 0 0 2px;
  }
  .muted {
    color: #555;
    margin: 0;
    font-size: 18px;
  }
  .error {
    color: #b91c1c;
    font-size: 18px;
    margin: 0 0 0.5rem;
  }
  .results-panel button {
    cursor: pointer;
    font-size: 16px;
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
