
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ============================================================
// CONFIGURATION
// ============================================================

const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";

const MAX_TOOL_ROUNDS = 4;
const MAX_MSG = 500;
const MAX_HISTORY = 8;
const MAX_ROOMS = 10;
const MAX_FACILITIES = 5;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hits = new Map<string, number[]>();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });

const err = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

// ============================================================
// SYSTEM INSTRUCTIONS
// ============================================================

const SYSTEM = `
You are an AI hostel room assistant.

Your responsibility is to help students find available hostel rooms
using live database information.

SEARCH RULES:

1. Always use search_rooms when a student asks about available rooms,
   room availability, room facilities or room recommendations.

2. Never claim that a search was performed unless the tool executed.

3. Never invent room information or availability.

4. Use only information returned by database tools.

5. If a search returns zero matching rooms, explain that no matching
   available rooms were found.

6. If a search fails, explain that availability could not be verified.
   Never confuse a failed search with zero available rooms.

7. Respect the student's requested building, room type and facilities.

8. For general questions such as "What facilities do rooms have?",
   search all available rooms without applying a facility filter.

9. When discussing available facilities, use the actual facilities
   arrays returned by search_rooms.

10. Do not classify beds, available beds or bed numbers as facilities.

11. Do not claim that every room has a facility merely because some
    rooms have that facility.

12. Distinguish between facilities found in some rooms and facilities
    found in all rooms.

13. Never invent facilities or add facilities that were not returned
    by the database.

14. Never contradict database results.

15. Use get_room_details when a student requests individual bed details.

16. Never invent bed numbers from available_beds.

BOOKING RULES:

17. You can only propose a booking using propose_booking.

18. A proposal is NOT a confirmed booking.

19. The student must confirm the proposal in the frontend.

20. Never claim that a booking exists until it is confirmed.

21. Only create a proposal when the student's original message explicitly
    asks to book, reserve, make a booking, or get a booking proposal.
    A request to show, find, compare, or list rooms must only return rooms
    and must never ask for booking confirmation.

PRIVACY:

22. Never reveal other students' personal information.

RESPONSE STYLE:

23. Give direct, concise and useful answers.

24. Do not unnecessarily repeat room information.

25. If information is missing, say you cannot verify it.

26. Ask clarifying questions when necessary.

BUILDING RULES:

27. Use get_building_details ONLY when a student asks about a building,
    building descriptions, campus locations or building overviews.

28. Do not call get_building_details when the student is only searching
    for available rooms, beds or facilities (use search_rooms instead).

29. Use only the name and description returned by get_building_details.
    Never invent building details or amenities not present in the database.

CAMPUS CONTEXT:
30. The current campus context may include map locations, selected destinations,
    visits per week, and weekly distance recommendations. Use it when the
    student asks about their profile, campus map, destinations, or commute.
31. Treat image values as frontend image references only. Do not describe image
    contents unless visual image data is explicitly provided.
`;

// ============================================================
// GEMINI TOOL DECLARATIONS
// ============================================================

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_rooms",
        description:
          "Search currently available hostel rooms with free beds. " +
          "Optional filters include building name, room type and facilities. " +
          "For general facility questions, leave required_facilities empty.",
        parameters: {
          type: "OBJECT",
          properties: {
            building_name: {
              type: "STRING",
              description: "Optional building name.",
            },
            room_type: {
              type: "STRING",
              description: "Optional room type.",
            },
            required_facilities: {
              type: "ARRAY",
              items: { type: "STRING" },
              description:
                "Facilities that every returned room must have. " +
                "Leave empty when asking about facilities generally.",
            },
          },
        },
      },
      {
        name: "get_room_details",
        description:
          "Get actual free bed IDs and bed numbers for a room.",
        parameters: {
          type: "OBJECT",
          properties: {
            room_id: {
              type: "STRING",
            },
          },
          required: ["room_id"],
        },
      },
      {
        name: "propose_booking",
        description:
          "Create a short-lived proposal for one available bed. " +
          "This is not a confirmed booking.",
        parameters: {
          type: "OBJECT",
          properties: {
            bed_id: {
              type: "STRING",
            },
          },
          required: ["bed_id"],
        },
      },
      {
        name: "get_building_details",
        description:
          "Fetch the name and description of hostel buildings from the active buildings table. " +
          "Use this ONLY when a student asks about a building, its description, or building overview.",
        parameters: {
          type: "OBJECT",
          properties: {
            building_name: {
              type: "STRING",
              description:
                "Optional building name (e.g. 'BH6', 'BS13'). If omitted or empty, details for all active buildings are returned.",
            },
          },
        },
      },
    ],
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function isObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radius = 6371000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function getCampusContext(sb: ReturnType<typeof createClient>, userId: string) {
  const [buildingResult, placeResult, routeResult, routineResult] = await Promise.all([
    sb.from("buildings")
      .select("id, name, description, latitude, longitude")
      .eq("is_active", true)
      .order("name"),
    sb.from("campus_places")
      .select("id, name, place_type, description, latitude, longitude")
      .eq("is_active", true)
      .order("name"),
    sb.from("commute_routes")
      .select("building_id, place_id, distance_meters, walking_minutes"),
    sb.from("student_routines")
      .select("id")
      .eq("student_id", userId)
      .maybeSingle(),
  ]);
  const queryError = [buildingResult, placeResult, routeResult, routineResult].find((result) => result.error)?.error;
  if (queryError) throw queryError;

  const routineId = routineResult.data?.id as string | undefined;
  const visitResult = routineId
    ? await sb.from("routine_visits").select("place_id, visits_per_week").eq("routine_id", routineId)
    : { data: [], error: null };
  if (visitResult.error) throw visitResult.error;

  const buildings = buildingResult.data ?? [];
  const places = placeResult.data ?? [];
  const routes = routeResult.data ?? [];
  const visits = visitResult.data ?? [];
  const visitByPlace = new Map(visits.map((visit: any) => [visit.place_id, Number(visit.visits_per_week)]));
  const routeByPair = new Map(routes.map((route: any) => [
    `${route.building_id}:${route.place_id}`,
    { distance: Number(route.distance_meters), minutes: Number(route.walking_minutes) },
  ]));

  const recommendations = buildings.map((building: any) => {
    const destinations = places
      .filter((place: any) => visitByPlace.has(place.id))
      .map((place: any) => {
        const saved = routeByPair.get(`${building.id}:${place.id}`);
        const fallback = building.latitude != null && building.longitude != null &&
          place.latitude != null && place.longitude != null
          ? {
            distance: haversineMeters(
              { latitude: Number(building.latitude), longitude: Number(building.longitude) },
              { latitude: Number(place.latitude), longitude: Number(place.longitude) },
            ),
            minutes: Math.max(1, Math.round(haversineMeters(
              { latitude: Number(building.latitude), longitude: Number(building.longitude) },
              { latitude: Number(place.latitude), longitude: Number(place.longitude) },
            ) / 80)),
          }
          : null;
        const route = saved ?? fallback;
        return route ? {
          place: place.name,
          visits: visitByPlace.get(place.id) ?? 1,
          distance: route.distance,
          minutes: route.minutes,
        } : null;
      })
      .filter(Boolean) as Array<{ place: string; visits: number; distance: number; minutes: number }>;
    return {
      building: building.name,
      matched_places: destinations.length,
      weekly_distance_meters: destinations.reduce((sum, item) => sum + 2 * item.visits * item.distance, 0),
      weekly_walking_minutes: destinations.reduce((sum, item) => sum + 2 * item.visits * item.minutes, 0),
      destinations,
    };
  }).sort((a, b) => b.matched_places - a.matched_places || a.weekly_distance_meters - b.weekly_distance_meters);

  return {
    map_locations: [
      ...buildings.map((building: any) => ({
        name: building.name,
        type: "hostel",
        latitude: building.latitude,
        longitude: building.longitude,
        image: "/buildings/building-1.png",
      })),
      ...places.map((place: any) => ({
        name: place.name,
        type: place.place_type,
        latitude: place.latitude,
        longitude: place.longitude,
        selected: visitByPlace.has(place.id),
      })),
    ],
    selected_destinations: places
      .filter((place: any) => visitByPlace.has(place.id))
      .map((place: any) => ({
        name: place.name,
        type: place.place_type,
        visits_per_week: visitByPlace.get(place.id),
      })),
    recommendations: recommendations.slice(0, 5),
  };
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ------------------------------------------------------------
// FACILITY NORMALIZATION
// Fixes:
// "Attached bathroom" = "Attached bathrooms"
// "Study desk" = "Study desks"
// "Facility" = "Facilities"
// ------------------------------------------------------------


function normalizeFacilityName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")  // Convert underscores and hyphens
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      if (word.length <= 3) return word;

      if (word.endsWith("ies")) {
        return word.slice(0, -3) + "y";
      }

      if (word.endsWith("sses")) {
        return word.slice(0, -2);
      }

      if (word.endsWith("s") && !word.endsWith("ss")) {
        return word.slice(0, -1);
      }

      return word;
    })
    .join(" ");
}


function normalizeFacilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((x) => typeof x === "string")
    .map(normalizeFacilityName)
    .filter(Boolean);
}

// ------------------------------------------------------------
// ROOM SEARCH INTENT
// ------------------------------------------------------------

function isRoomSearchRequest(message: string): boolean {
  const text = message.toLowerCase();

  // If the student is asking about building details/description, do not force room search
  if (
    /\b(building|buildings)\b.*\b(about|detail|details|description|describe|info|what is)\b/i.test(text) ||
    /\b(about|detail|details|description|describe|info|tell me about)\b.*\b(building|buildings)\b/i.test(text)
  ) {
    return false;
  }

  const patterns = [
    /\b(show|find|search|look for|looking for|display)\b.*\b(room|rooms|hostel|hostels|bed|beds|accommodation)\b/,
    /\b(room|rooms|hostel|hostels|accommodation)\b.*\b(available|availability|with|having|containing)\b/,
    /\b(available|availability)\b.*\b(room|rooms|bed|beds)\b/,
    /\b(facility|facilities|study desk|attached bathroom)\b/,
    /\b(i need|i want|looking for)\b.*\b(room|rooms|hostel|accommodation)\b/,
    /\b(studio|single|double|triple)\b.*\b(room|rooms)\b/,
    /\bany\s+rooms?\b/,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function isBookingRequest(message: string): boolean {
  const text = message.toLowerCase();
  return /\b(book|booking|reserve|reservation|proposal|confirm)\b/.test(text);
}

// ------------------------------------------------------------
// GENERAL FACILITY QUESTIONS
// ------------------------------------------------------------

function isFacilityOverviewRequest(message: string): boolean {
  const text = message.toLowerCase();

  const patterns = [
    /\bwhat\b.*\bfacilit(y|ies)\b/,
    /\bwhich\b.*\bfacilit(y|ies)\b/,
    /\blist\b.*\bfacilit(y|ies)\b/,
    /\bfacilit(y|ies)\b.*\b(do|does|are|available|provided)\b/,
  ];

  const isOverview = patterns.some((p) => p.test(text));

  const asksForSpecificFacility =
    /\b(with|having|include|including)\b.*\b(study desk|attached bathroom|bathroom|desk)\b/i.test(
      text,
    );

  return isOverview && !asksForSpecificFacility;
}

// ============================================================
// EDGE FUNCTION
// ============================================================

Deno.serve(async (req: Request) => {

  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return err(405, "METHOD_NOT_ALLOWED", "Use POST.");
  }

  // ----------------------------------------------------------
  // ENVIRONMENT
  // ----------------------------------------------------------

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
    console.error("Missing environment variables.");

    return err(
      503,
      "CONFIGURATION_ERROR",
      "Assistant configuration is incomplete.",
    );
  }

  // ----------------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------------

  const authorization = req.headers.get("Authorization");

  if (!authorization) {
    return err(401, "UNAUTHENTICATED", "Please sign in again.");
  }

  const sb = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await sb.auth.getUser();

  if (authError || !user) {
    return err(401, "UNAUTHENTICATED", "Please sign in again.");
  }

  // ----------------------------------------------------------
  // RATE LIMIT
  // ----------------------------------------------------------

  const now = Date.now();

  const recent = (hits.get(user.id) ?? []).filter(
    (timestamp) => now - timestamp < 60_000,
  );

  if (recent.length >= 10) {
    return err(
      429,
      "RATE_LIMITED",
      "Too many requests. Please wait a minute.",
    );
  }

  hits.set(user.id, [...recent, now]);

  // ----------------------------------------------------------
  // REQUEST VALIDATION
  // ----------------------------------------------------------

  let body: Record<string, unknown>;

  try {
    const parsed = await req.json();

    if (!isObject(parsed)) {
      return err(400, "BAD_REQUEST", "Invalid request body.");
    }

    body = parsed;
  } catch {
    return err(400, "BAD_REQUEST", "Invalid JSON.");
  }

  const message = safeString(body.message);

  if (!message || message.length > MAX_MSG) {
    return err(
      400,
      "BAD_REQUEST",
      `Message must contain 1-${MAX_MSG} characters.`,
    );
  }

  const history = (
    Array.isArray(body.history) ? body.history : []
  )
    .slice(-MAX_HISTORY)
    .filter(
      (h: any) =>
        isObject(h) &&
        (h.role === "user" || h.role === "model") &&
        typeof h.text === "string",
    )
    .map((h: any) => ({
      role: h.role,
      parts: [
        { text: h.text.slice(0, MAX_MSG) },
      ],
    }));

  let campusContext: unknown = null;
  try {
    campusContext = await getCampusContext(sb, user.id);
  } catch (error) {
    console.error("Campus context unavailable:", error);
  }

  const contents: any[] = [
    ...(campusContext
      ? [{
        role: "user",
        parts: [{
          text: `CURRENT CAMPUS CONTEXT (database-backed; use only when relevant):
${JSON.stringify(campusContext)}`,
        }],
      }]
      : []),
    ...history,
    {
      role: "user",
      parts: [{ text: message }],
    },
  ];

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const rooms: any[] = [];

  let pending: any = null;
  let searchFailed = false;
  let searchExecuted = false;

  // ==========================================================
  // TOOL EXECUTION
  // ==========================================================

  async function runTool(
    name: string,
    args: unknown,
  ): Promise<unknown> {

    const a = isObject(args) ? args : {};

    // ========================================================
    // SEARCH ROOMS
    // ========================================================

    if (name === "search_rooms") {

      const buildingName = safeString(a.building_name);
      const roomType = safeString(a.room_type);

      // For general facility questions, retrieve all available
      // rooms instead of filtering by a facility.
      const facilityOverview = isFacilityOverviewRequest(message);

      const requiredFacilities = facilityOverview
        ? []
        : (
            Array.isArray(a.required_facilities)
              ? a.required_facilities
              : []
          )
            .filter((x) => typeof x === "string")
            .map(normalizeFacilityName)
            .filter(Boolean)
            .slice(0, MAX_FACILITIES);

      console.log("========== ROOM SEARCH ==========");
      console.log("Arguments:", JSON.stringify(a));
      console.log("Facility overview:", facilityOverview);
      console.log("Required facilities:", requiredFacilities);

      const { data, error } = await sb.rpc("get_availability");

      if (error) {
        console.error("get_availability failed:", error);
        throw new Error("Availability RPC failed.");
      }

      if (!Array.isArray(data)) {
        console.error("Unexpected availability response:", data);
        throw new Error("Invalid availability response.");
      }

      searchExecuted = true;

      console.log("Database rooms:", data.length);

      const filtered = data.filter((r: any) => {

        if (!isObject(r)) return false;

        const building = safeString(r.building_name).toLowerCase();
        const type = safeString(r.room_type).toLowerCase();

        const facilities = normalizeFacilities(r.facilities);

        const availableBeds = Number(r.available_beds);

        if (
          !Number.isFinite(availableBeds) ||
          availableBeds <= 0
        ) {
          return false;
        }

        if (
          buildingName &&
          !building.includes(buildingName.toLowerCase())
        ) {
          return false;
        }

        if (
          roomType &&
          type !== roomType.toLowerCase()
        ) {
          return false;
        }

        // Match singular/plural and minor naming variations.
        const matchesFacilities = requiredFacilities.every(
          (required) =>
            facilities.some(
              (available) =>
                available.includes(required) ||
                required.includes(available),
            ),
        );

        return matchesFacilities;
      });

      // Keep original database facility values.
      // Only the matching process uses normalized values.
      const out = filtered
        .slice(0, MAX_ROOMS)
        .map((r: any) => ({
          room_id: r.room_id,
          building_name: r.building_name,
          room_number: r.room_number,
          room_type: r.room_type,
          facilities: r.facilities ?? [],
          available_beds: Number(r.available_beds),
          checked_at: new Date().toISOString(),
          evidence: [
            "room_active",
            "bed_available",
          ],
        }));

      // Preserve the database-derived records for frontend cards.
      for (const room of out) {
        const index = rooms.findIndex(
          (item) => item.room_id === room.room_id,
        );

        if (index === -1) {
          rooms.push(room);
        } else {
          rooms[index] = room;
        }
      }

      // Derive a facility summary from the actual returned rooms.
      // No facilities are invented or added.
      const availableFacilities = [
        ...new Set(
          out.flatMap((room: any) =>
            Array.isArray(room.facilities)
              ? room.facilities.filter(
                  (f: unknown) => typeof f === "string",
                )
              : [],
          ),
        ),
      ];

      console.log("Matching rooms:", out.length);
      console.log("Available facilities:", availableFacilities);
      console.log("================================");

      return {
        rooms: out,
        total_found: out.length,
        available_facilities: availableFacilities,
        checked_at: new Date().toISOString(),
        message: out.length
          ? "Matching rooms found."
          : "No matching available rooms found.",
      };
    }

    // ========================================================
    // GET ROOM DETAILS
    // ========================================================

    if (name === "get_room_details") {

      const roomId = safeString(a.room_id);

      if (!UUID.test(roomId)) {
        return { error: "Invalid room ID." };
      }

      const [bedsResult, takenResult] = await Promise.all([
        sb
          .from("beds")
          .select("id, bed_number")
          .eq("room_id", roomId)
          .eq("is_active", true)
          .order("bed_number"),

        sb.rpc("get_taken_bed_ids", {
          p_room_id: roomId,
        }),
      ]);

      if (bedsResult.error) {
        console.error("Beds query failed:", bedsResult.error);
        throw new Error("Could not retrieve beds.");
      }

      if (takenResult.error) {
        console.error("Taken beds RPC failed:", takenResult.error);
        throw new Error("Could not retrieve occupied beds.");
      }

      const beds = bedsResult.data ?? [];
      const taken = takenResult.data ?? [];

      const takenIds = new Set<string>(
        (Array.isArray(taken) ? taken : []).map((item: any) =>
          typeof item === "string"
            ? item
            : String(item?.bed_id ?? item?.id ?? ""),
        ),
      );

      const freeBeds = beds
        .filter((bed: any) => !takenIds.has(bed.id))
        .map((bed: any) => ({
          bed_id: bed.id,
          bed_number: bed.bed_number,
        }));

      return {
        room_id: roomId,
        free_beds: freeBeds,
        total_free_beds: freeBeds.length,
        checked_at: new Date().toISOString(),
      };
    }

    // ========================================================
    // PROPOSE BOOKING
    // ========================================================

    if (name === "propose_booking") {

      const bedId = safeString(a.bed_id);

      if (!UUID.test(bedId)) {
        return { error: "Invalid bed ID." };
      }

      const { data, error } = await sb.rpc("create_proposal", {
        p_bed_id: bedId,
      });

      if (error) {
        console.error("create_proposal failed:", error);

        if (
          String(error.message ?? "").includes("ALREADY_HAS")
        ) {
          return {
            error: "Student already has an active booking.",
          };
        }

        return {
          error: "Bed is not available.",
        };
      }

      const proposal = Array.isArray(data) ? data[0] : data;

      if (!proposal?.id || !proposal?.expires_at) {
        throw new Error("Invalid proposal response.");
      }

      pending = {
        proposal_id: proposal.id,
        expires_at: proposal.expires_at,
        building_name: proposal.building_name,
        room_number: proposal.room_number,
        bed_number: proposal.bed_number,
      };

      return {
        proposal_created: true,
        ...pending,
        note: "Not a confirmed booking. Student confirmation is required.",
      };
    }

    // ========================================================
    // GET BUILDING DETAILS
    // ========================================================

    if (name === "get_building_details") {
      const buildingName = safeString(a.building_name);

      console.log("========== BUILDING DETAILS ==========");
      console.log("Building name query:", buildingName);

      let query = sb
        .from("buildings")
        .select("id, name, description")
        .eq("is_active", true)
        .order("name");

      if (buildingName) {
        query = query.ilike("name", `%${buildingName}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error("get_building_details failed:", error);
        throw new Error("Could not retrieve building details.");
      }

      const buildingsList = (data ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        description: b.description || "No description available.",
      }));

      console.log("Matching buildings:", buildingsList.length);
      console.log("======================================");

      return {
        buildings: buildingsList,
        total_found: buildingsList.length,
        checked_at: new Date().toISOString(),
        message: buildingsList.length
          ? "Building details retrieved."
          : `No active building found matching '${buildingName}'.`,
      };
    }

    return { error: "Unknown tool." };
  }

  // ==========================================================
  // GEMINI EXECUTION LOOP
  // ==========================================================

  try {
    const bookingRequested = isBookingRequest(message);

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {

      // Force search on the first round for room-search requests.
      const forceSearch =
        round === 0 && isRoomSearchRequest(message);

      console.log("Gemini round:", round);
      console.log("Force search:", forceSearch);
      console.log("Booking requested:", bookingRequested);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",

          signal: AbortSignal.timeout(15_000),

          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },

          body: JSON.stringify({

            systemInstruction: {
              parts: [{ text: SYSTEM }],
            },

            contents,

            tools: bookingRequested
              ? tools
              : [{
                functionDeclarations: tools[0].functionDeclarations.filter(
                  (tool) => tool.name !== "propose_booking",
                ),
              }],

            // Main fix: mandatory tool execution.
            toolConfig: {
              functionCallingConfig: {
                mode: forceSearch ? "ANY" : "AUTO",

                ...(forceSearch
                  ? {
                      allowedFunctionNames: ["search_rooms"],
                    }
                  : {}),
              },
            },

            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "Gemini API error:",
          response.status,
          errorText.slice(0, 1000),
        );

        throw new Error(
          `Gemini API returned ${response.status}.`,
        );
      }

      const result = await response.json();

      const candidate = result?.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      if (!Array.isArray(parts)) {
        throw new Error("Invalid Gemini response.");
      }

      const calls = parts.filter(
        (p: any) => p?.functionCall,
      );

      // --------------------------------------------------------
      // VERIFY MANDATORY SEARCH
      // --------------------------------------------------------

      if (forceSearch && calls.length === 0) {
        console.error(
          "Gemini did not return a mandatory search function call.",
        );

        return json({
          reply:
            "I couldn't start the room search. Please try again.",
          rooms: [],
          pending_action: null,
          search_status: "failed",
        });
      }

      // --------------------------------------------------------
      // FINAL RESPONSE
      // --------------------------------------------------------

      if (calls.length === 0) {

        if (searchFailed) {
          return json({
            reply:
              "I couldn't verify room availability right now. Please try again.",
            rooms: [],
            pending_action: null,
            search_status: "failed",
          });
        }

        const reply = parts
          .map((p: any) => p.text ?? "")
          .join("")
          .trim();

        return json({
          reply:
            reply ||
            "I could not complete that request. Please try again.",
          rooms,
          pending_action: pending,
          ...(searchExecuted
            ? { search_status: "success" }
            : {}),
        });
      }

      // --------------------------------------------------------
      // ADD MODEL TOOL CALLS TO CONVERSATION
      // --------------------------------------------------------

      contents.push({
        role: "model",
        parts,
      });

      const toolResponses: any[] = [];

      for (const call of calls) {

        const name = call.functionCall.name;
        const args = call.functionCall.args ?? {};

        console.log("Executing tool:", name);
        console.log("Arguments:", JSON.stringify(args));

        let toolResult: unknown;

        try {
          toolResult = await runTool(name, args);

          if (
            isObject(toolResult) &&
            "error" in toolResult
          ) {
            if (name === "search_rooms") {
              searchFailed = true;
            }
          }

        } catch (error) {

          console.error(`Tool ${name} failed:`, error);

          if (name === "search_rooms") {
            searchFailed = true;
          }

          toolResult = {
            error: "TOOL_EXECUTION_FAILED",
            message: "Availability could not be verified.",
          };
        }

        toolResponses.push({
          functionResponse: {
            name,
            ...(call.functionCall.id
              ? { id: call.functionCall.id }
              : {}),
            response: {
              result: toolResult,
            },
          },
        });
      }

      // Do not let Gemini generate a misleading response
      // after a failed search.
      if (searchFailed) {
        return json({
          reply:
            "I couldn't verify room availability right now. Please try again.",
          rooms: [],
          pending_action: null,
          search_status: "failed",
        });
      }

      contents.push({
        role: "user",
        parts: toolResponses,
      });
    }

    // ----------------------------------------------------------
    // MAXIMUM TOOL ROUNDS
    // ----------------------------------------------------------

    return json({
      reply:
        "I couldn't complete your request within the allowed steps. Please try again.",
      rooms,
      pending_action: pending,
      search_status: searchExecuted ? "success" : "failed",
    });

  } catch (error) {

    console.error("ai-chat failed:", error);

    return err(
      503,
      "AI_UNAVAILABLE",
      "The assistant is temporarily unavailable. You can still browse rooms manually.",
    );
  }
});
