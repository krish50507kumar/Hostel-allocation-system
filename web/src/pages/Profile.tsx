import { useEffect, useMemo, useState } from "react";
import { supabase, friendly } from "../lib";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type Place = {
  id: string;
  name: string;
  description: string | null;
  place_type: "academic" | "campus" | "class_building" | "hostel_building" | "library" | "mess";
  latitude: number | null;
  longitude: number | null;
};
type Building = { id: string; name: string; latitude: number | null; longitude: number | null };
type Route = { building_id: string; place_id: string; distance_meters: number; walking_minutes: number };
type Visit = { place_id: string; visits_per_week: number };
type Recommendation = {
  building: Building;
  totalDistance: number;
  averageDistance: number;
  walkingMinutes: number;
  matchedPlaces: number;
  weeklyVisits: number;
  destinations: { place: Place; distance: number; minutes: number; visits: number }[];
};
type MapPoint = {
  id: string;
  name: string;
  kind: "Hostel" | "Class building" | "Library" | "Mess" | "Campus place";
  latitude: number;
  longitude: number;
  selected: boolean;
};

function placeGroup(place: Place) {
  if (place.place_type === "academic" || place.place_type === "class_building") return "Classes";
  if (place.place_type === "library") return "Libraries";
  if (place.place_type === "mess") return "Messes";
  return "Buildings";
}

function MapViewport({ points }: { points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]), {
      padding: [28, 28],
      maxZoom: 17,
    });
  }, [map, points]);

  return null;
}

function pointColor(point: MapPoint) {
  if (point.selected) return "#0f766e";
  if (point.kind === "Hostel") return "#2563eb";
  if (point.kind === "Library") return "#7c3aed";
  if (point.kind === "Mess") return "#dc2626";
  if (point.kind === "Class building") return "#d97706";
  return "#64748b";
}

type Coordinate = { latitude: number; longitude: number };
type GraphNode = { id: string; coordinate: Coordinate };

function haversineDistance(a: Coordinate, b: Coordinate) {
  const radius = 6371000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function shortestCoordinateDistance(start: GraphNode, target: GraphNode, nodes: GraphNode[]) {
  const distances = new Map(nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const unvisited = new Set(nodes.map((node) => node.id));
  distances.set(start.id, 0);

  while (unvisited.size) {
    const currentId = [...unvisited].reduce((best, id) =>
      (distances.get(id) ?? Number.POSITIVE_INFINITY) < (distances.get(best) ?? Number.POSITIVE_INFINITY) ? id : best);
    const currentDistance = distances.get(currentId) ?? Number.POSITIVE_INFINITY;
    unvisited.delete(currentId);
    if (currentId === target.id) return currentDistance;
    if (!Number.isFinite(currentDistance)) break;
    const current = nodes.find((node) => node.id === currentId)!;
    for (const neighbor of nodes) {
      if (!unvisited.has(neighbor.id)) continue;
      const distance = currentDistance + haversineDistance(current.coordinate, neighbor.coordinate);
      if (distance < (distances.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) distances.set(neighbor.id, distance);
    }
  }
  return Number.POSITIVE_INFINITY;
}

function routeDistance(building: Building, place: Place, routes: Route[], nodes: GraphNode[]) {
  const savedRoute = routes.find((route) => route.building_id === building.id && route.place_id === place.id);
  if (savedRoute) return { distance: Number(savedRoute.distance_meters), minutes: Number(savedRoute.walking_minutes) };
  if (building.latitude == null || building.longitude == null || place.latitude == null || place.longitude == null) {
    return null;
  }
  const start = { id: `building:${building.id}`, coordinate: { latitude: building.latitude, longitude: building.longitude } };
  const target = { id: `place:${place.id}`, coordinate: { latitude: place.latitude, longitude: place.longitude } };
  const distance = shortestCoordinateDistance(start, target, nodes);
  return Number.isFinite(distance) ? { distance, minutes: Math.max(1, Math.round(distance / 80)) } : null;
}

function bestBuilding(placeIds: string[], buildings: Building[], places: Place[], routes: Route[], visits: Visit[]): Recommendation | null {
  const candidates = buildingRecommendations(placeIds, buildings, places, routes, visits);
  if (!candidates.some((candidate) => candidate.matchedPlaces > 0)) return null;
  return candidates.find((candidate) => candidate.matchedPlaces === placeIds.length) ?? candidates[0] ?? null;
}

function buildingRecommendations(placeIds: string[], buildings: Building[], places: Place[], routes: Route[], visits: Visit[]): Recommendation[] {
  if (!placeIds.length) return [];
  const nodes = [
    ...buildings.filter((building) => building.latitude != null && building.longitude != null)
      .map((building) => ({ id: `building:${building.id}`, coordinate: { latitude: building.latitude!, longitude: building.longitude! } })),
    ...places.filter((place) => place.latitude != null && place.longitude != null)
      .map((place) => ({ id: `place:${place.id}`, coordinate: { latitude: place.latitude!, longitude: place.longitude! } })),
  ];
  const candidates = buildings.map((building) => {
    const destinations = placeIds.map((placeId) => {
      const place = places.find((item) => item.id === placeId);
      const visit = visits.find((item) => item.place_id === placeId);
      const route = place ? routeDistance(building, place, routes, nodes) : null;
      return place && route ? { place, route, visits: visit?.visits_per_week ?? 1 } : null;
    }).filter((item): item is { place: Place; route: { distance: number; minutes: number }; visits: number } => item != null);
    const weeklyVisits = destinations.reduce((sum, item) => sum + item.visits, 0);
    const totalDistance = destinations.reduce((sum, item) => sum + 2 * item.visits * item.route.distance, 0);
    const walkingMinutes = destinations.reduce((sum, item) => sum + 2 * item.visits * item.route.minutes, 0);
    return {
      building,
      totalDistance,
      averageDistance: weeklyVisits ? totalDistance / weeklyVisits : Number.POSITIVE_INFINITY,
      walkingMinutes,
      matchedPlaces: destinations.length,
      weeklyVisits,
      destinations: destinations.map((item) => ({
        place: item.place,
        distance: item.route.distance,
        minutes: item.route.minutes,
        visits: item.visits,
      })),
    };
  }).sort((a, b) => b.matchedPlaces - a.matchedPlaces || a.totalDistance - b.totalDistance);
  return candidates;
}

export default function Profile() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [frequencyByPlace, setFrequencyByPlace] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const groupedPlaces = useMemo(() => ["Classes", "Buildings", "Messes", "Libraries"].map((title) => ({
    title,
    hint: title === "Classes" ? "Select the academic buildings you visit." : `Select the ${title.toLowerCase()} you use.`,
    items: places.filter((p) => placeGroup(p) === title),
  })).filter((group) => group.items.length > 0), [places]);
  const mapPoints = useMemo<MapPoint[]>(() => [
    ...buildings.filter((building) => building.latitude != null && building.longitude != null).map((building) => ({
      id: `building:${building.id}`,
      name: building.name,
      kind: "Hostel" as const,
      latitude: building.latitude!,
      longitude: building.longitude!,
      selected: false,
    })),
    ...places.filter((place) => place.latitude != null && place.longitude != null).map((place) => ({
      id: `place:${place.id}`,
      name: place.name,
      kind: place.place_type === "class_building" ? "Class building" as const
        : place.place_type === "library" ? "Library" as const
          : place.place_type === "mess" ? "Mess" as const : "Campus place" as const,
      latitude: place.latitude!,
      longitude: place.longitude!,
      selected: selected.includes(place.id),
    })),
  ], [buildings, places, selected]);
  const comparisons = useMemo(
    () => buildingRecommendations(
      selected,
      buildings,
      places,
      routes,
      selected.map((place_id) => ({ place_id, visits_per_week: frequencyByPlace[place_id] ?? 1 })),
    ).filter((item) => item.matchedPlaces > 0),
    [selected, buildings, places, routes, frequencyByPlace],
  );

  useEffect(() => {
    async function load() {
      setBusy(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErr("Your session has expired. Please sign in again.");
        setBusy(false);
        return;
      }

      const [placeResult, buildingResult, routeResult, routineResult] = await Promise.all([
        supabase.from("campus_places").select("id, name, description, place_type, latitude, longitude").order("name"),
        supabase.from("buildings").select("id, name, latitude, longitude").eq("is_active", true).order("name"),
        supabase.from("commute_routes").select("building_id, place_id, distance_meters, walking_minutes"),
        supabase.from("student_routines").select("id").eq("student_id", user.id).maybeSingle(),
      ]);
      const firstError = [placeResult, buildingResult, routeResult, routineResult].find((result) => result.error)?.error;
      if (firstError) {
        setErr(friendly(firstError));
        setBusy(false);
        return;
      }

      const routine = routineResult.data as { id: string } | null;
      const loadedPlaces = (placeResult.data ?? []) as Place[];
      const loadedBuildings = (buildingResult.data ?? []) as Building[];
      const loadedRoutes = (routeResult.data ?? []) as Route[];
      setPlaces(loadedPlaces);
      setBuildings(loadedBuildings);
      setRoutes(loadedRoutes);
      setRoutineId(routine?.id ?? null);

      let savedVisits: Visit[] = [];
      if (routine) {
        const { data: visits, error } = await supabase
          .from("routine_visits")
          .select("place_id, visits_per_week")
          .eq("routine_id", routine.id);
        if (error) setErr(friendly(error));
        savedVisits = (visits ?? []) as Visit[];
        const savedPlaceIds = savedVisits.map((visit) => visit.place_id);
        setVisits(savedVisits);
        setSelected(savedPlaceIds);
        setRecommendation(bestBuilding(savedPlaceIds, loadedBuildings, loadedPlaces, loadedRoutes, savedVisits));
      }
      setFrequencyByPlace(Object.fromEntries(
        loadedPlaces.map((place) => [
          place.id,
          savedVisits.find((visit) => visit.place_id === place.id)?.visits_per_week ?? 1,
        ]),
      ));
      setBusy(false);
    }
    load();
  }, []);

  function togglePlace(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((placeId) => placeId !== id)
      : [...current, id]);
    setOk("");
    setRecommendation(null);
  }

  function updateVisitFrequency(placeId: string, value: string) {
    const frequency = Math.max(1, Math.min(99, Number(value) || 1));
    setFrequencyByPlace((current) => ({ ...current, [placeId]: frequency }));
    setOk("");
    setRecommendation(null);
  }

  function calculateBestBuilding(placeIds: string[], visitList = visits) {
    setRecommendation(bestBuilding(placeIds, buildings, places, routes, visitList));
  }

  async function save() {
    setErr(""); setOk("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setErr("Your session has expired. Please sign in again.");
    if (!selected.length) return setErr("Select at least one place to calculate a recommendation.");

    setSaving(true);
    const { data: routine, error: routineError } = await supabase
      .from("student_routines")
      .upsert({ id: routineId ?? undefined, student_id: user.id }, { onConflict: "student_id" })
      .select("id")
      .single();
    if (routineError) {
      setSaving(false);
      return setErr(friendly(routineError));
    }
    const id = routine.id as string;
    const { error: deleteError } = await supabase.from("routine_visits").delete().eq("routine_id", id);
    if (deleteError) {
      setSaving(false);
      return setErr(friendly(deleteError));
    }
    const savedVisits = selected.map((place_id) => ({
      place_id,
      visits_per_week: frequencyByPlace[place_id] ?? 1,
    }));
    const { error: insertError } = await supabase.from("routine_visits").insert(
      savedVisits.map((visit) => ({ routine_id: id, ...visit })),
    );
    setSaving(false);
    if (insertError) return setErr(friendly(insertError));
    setVisits(savedVisits);
    setRoutineId(id);
    calculateBestBuilding(selected, savedVisits);
    setOk("Your campus preferences were saved.");
  }

  if (busy) return <p className="state" role="status">Loading profile preferences…</p>;

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" /><div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Student profile</div>
          <h1>Preference</h1>
          <p>Tell us where you spend time on campus so we can recommend the most convenient hostel building.</p>
        </div>
      </div>

      {err && <div className="alert alert-error" role="alert">{err}</div>}
      {ok && <div className="alert alert-success" role="status">{ok}</div>}

      <section className="profile-map-card card-pad">
        <div className="profile-map-heading">
          <div>
            <p className="settings-overline">Campus map</p>
            <h2>Explore buildings and places</h2>
            <p>Locations are shown using the coordinates configured by an administrator.</p>
          </div>
          <div className="profile-map-legend" aria-label="Map legend">
            <span><i className="profile-map-dot profile-map-dot--selected" />Selected</span>
            <span><i className="profile-map-dot profile-map-dot--hostel" />Hostel</span>
            <span><i className="profile-map-dot profile-map-dot--place" />Campus place</span>
          </div>
        </div>
        {mapPoints.length ? (
          <MapContainer className="profile-map" center={[mapPoints[0].latitude, mapPoints[0].longitude]} zoom={16} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapViewport points={mapPoints} />
            {mapPoints.map((point) => (
              <CircleMarker
                key={point.id}
                center={[point.latitude, point.longitude]}
                radius={point.selected ? 11 : point.kind === "Hostel" ? 9 : 7}
                pathOptions={{ color: pointColor(point), fillColor: pointColor(point), fillOpacity: point.selected ? 0.95 : 0.75, weight: point.selected ? 4 : 2 }}
              >
                <Popup>
                  <strong>{point.name}</strong>
                  <br />
                  {point.selected ? "Selected destination" : point.kind}
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        ) : (
          <p className="state profile-map-empty">No buildings or campus places have coordinates yet.</p>
        )}
      </section>

      <div className="profile-layout">
        <div className="card-pad profile-preferences">
          <div>
            <h2>Where do you go?</h2>
            <p className="settings-muted">Choose every class building, mess, library, or campus place you regularly visit.</p>
          </div>
          {groupedPlaces.length === 0 && <p className="state">No campus places have been configured yet.</p>}
          {groupedPlaces.map((group) => (
            <fieldset className={`profile-place-group ${group.title === "Classes" ? "profile-place-group--classes" : ""}`} key={group.title}>
              <legend>{group.title}</legend>
              <p>{group.hint}</p>
              <div className="profile-place-options">
                {group.items.map((place) => (
                  <label className={`profile-place-option ${selected.includes(place.id) ? "selected" : ""}`} key={place.id}>
                    <input type="checkbox" checked={selected.includes(place.id)} onChange={() => togglePlace(place.id)} />
                    <span>
                      <strong>{place.name}</strong>
                      {place.description && <small>{place.description}</small>}
                      <span className="profile-place-frequency" onClick={(event) => event.stopPropagation()}>
                        <span>Visits per week</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={frequencyByPlace[place.id] ?? 1}
                          onChange={(event) => updateVisitFrequency(place.id, event.target.value)}
                          aria-label={`Visits per week for ${place.name}`}
                        />
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button type="button" onClick={save} disabled={saving || !selected.length}>
            {saving ? "Saving preferences…" : "Save preferences & find best building"}
          </button>
        </div>

        <div className="profile-result-column">
        <aside className="profile-result">
          {recommendation ? (
            <>
              <p className="settings-overline">Your recommendation</p>
              <h2>{recommendation.building.name}</h2>
              <p>Best overall match for the places you selected.</p>
              <div className="profile-metrics">
                <div><strong>{Math.round(recommendation.totalDistance / 1000 * 100) / 100} km</strong><span>weekly round trip</span></div>
                <div><strong>{recommendation.walkingMinutes} min</strong><span>weekly walking</span></div>
                <div><strong>{recommendation.matchedPlaces}/{selected.length}</strong><span>places matched</span></div>
              </div>
              <p className="profile-result-note">Distance uses saved campus routes when available, otherwise the admin-provided coordinates. Weekly distance counts two trips per visit.</p>
            </>
          ) : (
            <div className="profile-result__empty">
              <span aria-hidden="true">⌖</span>
              <h2>Your best building will appear here</h2>
              <p>Select your regular campus destinations and save your preferences to calculate it.</p>
            </div>
          )}
        </aside>
        {comparisons.length > 0 && (
          <div className="preference-analysis__summary">
            <div className="card-pad preference-comparison">
              <div>
                <h2>Compare your weekly walking</h2>
                <p>Less distance means more time for everything else.</p>
              </div>
              <div className="preference-bars">
                {comparisons.slice(0, 5).map((item, index) => {
                  const maxDistance = Math.max(...comparisons.map((comparison) => comparison.totalDistance), 1);
                  const distanceKm = item.totalDistance / 1000;
                  return (
                    <div className="preference-bar-row" key={item.building.id}>
                      <strong>{item.building.name}</strong>
                      <div className="preference-bar-track">
                        <span className={index === 0 ? "best" : ""} style={{ width: `${Math.max(8, distanceKm / (maxDistance / 1000) * 100)}%` }} />
                      </div>
                      <span className="preference-bar-value">
                        {distanceKm.toFixed(1)} km
                        <small>{index === 0 ? "Best fit" : `+${(distanceKm - comparisons[0].totalDistance / 1000).toFixed(1)} km`}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="preference-bar-scale"><span>0</span><span>{Math.round((comparisons[0].totalDistance / 1000) / 2)} km</span><span>{Math.ceil(comparisons[comparisons.length - 1].totalDistance / 1000)} km</span></div>
            </div>

            <aside className="preference-why">
              <h2>Why {comparisons[0].building.name} comes first</h2>
              <ol>
                <li><strong>{comparisons[0].matchedPlaces} of {selected.length} destinations are reachable</strong><span>Your selected places are included in the comparison.</span></li>
                <li><strong>{comparisons[0].walkingMinutes} minutes of walking per week</strong><span>Calculated from saved routes and your visit frequency.</span></li>
                <li><strong>{(comparisons[0].totalDistance / 1000).toFixed(1)} km weekly round trip</strong><span>The shortest result among the available matches.</span></li>
              </ol>
            </aside>
          </div>
        )}
        </div>
      </div>

      {comparisons.length > 0 && (
        <section className="preference-analysis">
          <div className="card-pad preference-routes">
            <h2>Your route-by-route breakdown</h2>
            <p>From {comparisons[0].building.name} · Walking routes, not straight-line distances</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Destination</th><th>One-way route</th><th>Walking time</th><th>Visits / week</th><th>Weekly return distance</th></tr>
                </thead>
                <tbody>
                  {comparisons[0].destinations.map((destination) => (
                    <tr key={destination.place.id}>
                      <td>{destination.place.name}</td>
                      <td>{destination.distance >= 1000 ? `${(destination.distance / 1000).toFixed(1)} km` : `${Math.round(destination.distance)} m`}</td>
                      <td>{destination.minutes} min</td>
                      <td>{destination.visits}</td>
                      <td className="preference-routes__total">{(2 * destination.visits * destination.distance / 1000).toFixed(1)} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
