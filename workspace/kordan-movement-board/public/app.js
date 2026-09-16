const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  dashboard: null,
  geo: null,
  tracks: [],
  window: 120,
  feedMode: "all",
  search: "",
  scopes: new Set(["military", "related_civilian"]),
  selectedMmsi: null,
  hoveredPoint: null,
  projectedPoints: [],
  bounds: null,
  loading: false,
};

const scopeColors = {
  military: "#4fd1c5",
  related_civilian: "#e8ad58",
  civilian: "#8499a1",
  coast_guard: "#67aef7",
};

function formatHour(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return number < 0 ? `H−${Math.abs(number).toFixed(number % 1 ? 1 : 0)}` : `H+${number.toFixed(number % 1 ? 1 : 0)}`;
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

function escapeSearch(value) {
  return String(value ?? "").toLowerCase();
}

function initials(value) {
  return String(value ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function scopeLabel(scope) {
  return ({ military: "Kordan military", related_civilian: "Related civilian", civilian: "Civilian", coast_guard: "Coast guard" })[scope] ?? scope;
}

function visibleVessels() {
  if (!state.dashboard) return [];
  return state.dashboard.vessels.filter((vessel) => state.scopes.has(vessel.vessel_scope));
}

async function requestJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function loadAll({ refresh = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  $("#feed").setAttribute("aria-busy", "true");
  $("#map-status").hidden = false;
  $("#map-status").textContent = "Loading released tracks…";
  try {
    const dashboardUrl = new URL("/api/dashboard", window.location.origin);
    dashboardUrl.searchParams.set("window", state.window);
    if (refresh) dashboardUrl.searchParams.set("refresh", "true");
    const dashboard = await requestJson(dashboardUrl);
    state.dashboard = dashboard;
    const trackUrl = new URL("/api/tracks", window.location.origin);
    Object.entries({
      start: dashboard.filters.start,
      end: dashboard.filters.end,
      cutoff: dashboard.filters.cutoff,
      min_quality: 2,
      max_points: 260,
    }).forEach(([key, value]) => trackUrl.searchParams.set(key, value));
    const [trackBody, geo] = await Promise.all([
      requestJson(trackUrl),
      state.geo ? Promise.resolve(state.geo) : requestJson("/api/map"),
    ]);
    state.tracks = trackBody.tracks;
    state.geo = geo;
    state.bounds = null;
    updateReleaseChrome();
    updateMetrics();
    renderVesselList();
    renderFeed();
    renderMethodNotes();
    renderSelectedVessel();
    drawMap();
    $("#map-status").hidden = true;
    setConnection("online", `Standalone snapshot · ${dashboard.release.active.activeRelease}`);
  } catch (error) {
    $("#feed").innerHTML = `<div class="feed-empty">${error.message}</div>`;
    $("#map-status").textContent = error.message;
    setConnection("error", "Release data unavailable");
  } finally {
    state.loading = false;
    $("#feed").setAttribute("aria-busy", "false");
  }
}

function setConnection(mode, text) {
  const connection = $("#connection");
  connection.className = `connection ${mode}`;
  connection.lastChild.textContent = ` ${text}`;
}

function updateReleaseChrome() {
  const { release, filters } = state.dashboard;
  $("#release-id").textContent = release.active.activeRelease;
  $("#release-label").textContent = `${release.active.label} · ${formatHour(release.active.cutoffHour)}`;
  $("#cutoff-label").textContent = formatHour(filters.cutoff);
  $("#window-label").textContent = `${formatHour(filters.start)}–${formatHour(filters.end)}`;
  $("#map-window").textContent = `${formatHour(filters.start)} → ${formatHour(filters.end)}`;
  $("#map-cutoff").textContent = `Ingest ≤ ${formatHour(filters.cutoff)}`;
}

function updateMetrics() {
  const { metrics, vessels } = state.dashboard;
  $("#metric-military").textContent = metrics.military_hulls;
  $("#metric-related").textContent = metrics.related_civilians;
  $("#metric-findings").textContent = metrics.agent_findings;
  $("#metric-reports").textContent = metrics.source_reports;
  $("#military-filter-count").textContent = vessels.filter((item) => item.vessel_scope === "military").length;
  $("#related-filter-count").textContent = vessels.filter((item) => item.vessel_scope === "related_civilian").length;
  $("#civilian-filter-count").textContent = vessels.filter((item) => item.vessel_scope === "civilian").length;
  $("#coast-filter-count").textContent = vessels.filter((item) => item.vessel_scope === "coast_guard").length;
  $("#picture-summary").textContent = metrics.tracked_vessels === 0
    ? (state.dashboard.example_data
      ? "No participant snapshot is loaded. Export an authorized local release to populate this standalone board."
      : "No vessel records are available in this snapshot window.")
    : "Confirmed: a seven-vessel group moved east in formation. Bounded judgment: Steadfast later reported near Aster while the other six turned west. Cargo, unloading, and activation remain unresolved.";
}

function renderVesselList() {
  const list = $("#vessel-list");
  list.replaceChildren();
  const search = state.search;
  const vessels = visibleVessels().filter((vessel) => {
    if (!search) return true;
    return [vessel.vessel_name, vessel.mmsi, vessel.hull_id, vessel.class_designation, vessel.unit_designation]
      .some((value) => escapeSearch(value).includes(search));
  });
  $("#watch-count").textContent = vessels.length;
  $("#visible-track-count").textContent = vessels.length;
  if (!vessels.length) {
    const empty = document.createElement("div");
    empty.className = "feed-empty";
    empty.textContent = "No vessels match the current scope.";
    list.append(empty);
    return;
  }
  vessels.forEach((vessel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `vessel-item${state.selectedMmsi === vessel.mmsi ? " selected" : ""}`;
    button.dataset.scope = vessel.vessel_scope;
    button.innerHTML = `<span class="vessel-scope-dot"></span><span class="vessel-copy"><strong></strong><span></span></span><small></small>`;
    button.querySelector("strong").textContent = vessel.vessel_name;
    button.querySelector(".vessel-copy span").textContent = `${vessel.mmsi} · ${scopeLabel(vessel.vessel_scope)}`;
    button.querySelector("small").textContent = formatHour(vessel.latest_observation_hour);
    button.addEventListener("click", () => selectVessel(vessel.mmsi));
    list.append(button);
  });
}

function selectVessel(mmsi) {
  state.selectedMmsi = state.selectedMmsi === mmsi ? null : mmsi;
  renderVesselList();
  renderSelectedVessel();
  $("#map-selected").textContent = state.selectedMmsi
    ? state.dashboard.vessels.find((item) => item.mmsi === state.selectedMmsi)?.vessel_name ?? state.selectedMmsi
    : "All scoped vessels";
  drawMap();
}

function renderSelectedVessel() {
  const panel = $("#selected-vessel");
  const vessel = state.dashboard?.vessels.find((item) => item.mmsi === state.selectedMmsi);
  panel.hidden = !vessel;
  if (!vessel) return;
  $("#selected-name").textContent = vessel.vessel_name;
  $("#selected-id").textContent = `${vessel.mmsi} · ${scopeLabel(vessel.vessel_scope)}`;
  const fields = [
    ["Identity basis", vessel.identity_basis],
    ["Class", vessel.class_designation || "No exact hull match"],
    ["Latest observed", formatHour(vessel.latest_observation_hour)],
    ["Latest ingested", formatHour(vessel.latest_ingest_hour)],
    ["Position", `${formatNumber(vessel.latitude, 3)}, ${formatNumber(vessel.longitude, 3)}`],
    ["SOG / COG", `${formatNumber(vessel.speed_knots)} kt / ${formatNumber(vessel.course_deg, 0)}°`],
    ["Largest gap", `${formatNumber(vessel.largest_gap_hours, 2)} h`],
    ["Signal quality", `${vessel.signal_quality ?? "—"}/5`],
  ];
  const details = $("#selected-details");
  details.replaceChildren();
  fields.forEach(([label, value]) => {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    wrap.append(dt, dd);
    details.append(wrap);
  });
  $("#selected-evidence").onclick = () => openEvidence(vessel.latest_record_id);
}

function postMatches(post) {
  if (state.feedMode === "agent" && post.kind === "source") return false;
  if (state.feedMode === "source" && post.kind !== "source") return false;
  if (!state.search) return true;
  return [post.agent, post.handle, post.title, post.judgment, ...(post.evidence_ids || [])]
    .some((value) => escapeSearch(value).includes(state.search));
}

function fillList(section, values) {
  const clean = (values || []).filter(Boolean);
  section.hidden = clean.length === 0;
  const list = section.querySelector("ul");
  if (!list) return;
  list.replaceChildren(...clean.map((value) => {
    const item = document.createElement("li");
    item.textContent = value;
    return item;
  }));
}

function renderFeed() {
  const feed = $("#feed");
  feed.replaceChildren();
  const posts = state.dashboard.feed.filter(postMatches);
  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "feed-empty";
    empty.textContent = "No posts match the current feed and search filters.";
    feed.append(empty);
    return;
  }
  posts.forEach((post) => {
    const fragment = $("#post-template").content.cloneNode(true);
    const article = fragment.querySelector(".post");
    article.classList.add(post.kind);
    article.dataset.kind = post.kind;
    const avatar = fragment.querySelector(".post-avatar");
    avatar.dataset.initials = initials(post.agent);
    fragment.querySelector(".post-agent").textContent = post.agent;
    fragment.querySelector(".post-handle").textContent = post.handle;
    fragment.querySelector(".post-time").textContent = formatHour(post.ingest_hour);
    fragment.querySelector(".post-time").dateTime = String(post.ingest_hour);
    fragment.querySelector(".post-kind").textContent = post.kind === "source" ? post.source?.discipline || "source" : post.kind;
    fragment.querySelector(".post-role").textContent = post.agent_role;
    fragment.querySelector(".post-title").textContent = post.title;
    fragment.querySelector(".post-judgment").textContent = post.judgment;
    const confidence = fragment.querySelector(".confidence-row");
    if (post.confidence) {
      confidence.hidden = false;
      const strong = document.createElement("strong");
      strong.textContent = "Analytic confidence: ";
      confidence.append(strong, document.createTextNode(post.confidence));
    }
    const expansion = fragment.querySelector(".post-expansion");
    const observationSection = expansion.querySelector(".observations");
    const inferenceSection = expansion.querySelector(".inference");
    const alternativesSection = expansion.querySelector(".alternatives");
    const gapsSection = expansion.querySelector(".gaps");
    fillList(observationSection, post.observations);
    inferenceSection.hidden = !post.inference;
    inferenceSection.querySelector("p").textContent = post.inference || "";
    fillList(alternativesSection, post.alternatives);
    fillList(gapsSection, post.gaps);
    const hasExpansion = !observationSection.hidden || !inferenceSection.hidden || !alternativesSection.hidden || !gapsSection.hidden;
    const expandButton = fragment.querySelector(".expand-post");
    expandButton.hidden = !hasExpansion;
    expandButton.textContent = post.kind === "source" ? "View source limits" : "View reasoning";
    expandButton.addEventListener("click", () => {
      expansion.hidden = !expansion.hidden;
      expandButton.textContent = expansion.hidden
        ? (post.kind === "source" ? "View source limits" : "View reasoning")
        : "Hide detail";
    });
    const evidenceRow = fragment.querySelector(".evidence-row");
    const ids = (post.evidence_ids || []).filter(Boolean);
    ids.slice(0, 7).forEach((identifier) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "evidence-chip";
      button.textContent = identifier;
      button.addEventListener("click", () => openEvidence(identifier));
      evidenceRow.append(button);
    });
    if (ids.length > 7) {
      const more = document.createElement("span");
      more.className = "evidence-more";
      more.textContent = `+${ids.length - 7} more`;
      evidenceRow.append(more);
    }
    fragment.querySelector(".time-lineage").textContent = `Observed ${formatHour(post.observation_hour)} · available ${formatHour(post.ingest_hour)}`;
    feed.append(fragment);
  });
}

function renderMethodNotes() {
  const container = $("#method-notes");
  container.replaceChildren();
  const notes = state.dashboard.method_notes;
  Object.values(notes).forEach((value) => {
    const p = document.createElement("p");
    p.textContent = value;
    container.append(p);
  });
  const basis = document.createElement("p");
  basis.textContent = state.dashboard.analytic_status.basis;
  container.append(basis);
}

async function openEvidence(identifier) {
  if (!identifier) return;
  const dialog = $("#evidence-dialog");
  $("#evidence-family").textContent = "Evidence";
  $("#evidence-title").textContent = identifier;
  $("#evidence-body").innerHTML = "<div class=\"loading-post\">Loading released record…</div>";
  if (!dialog.open) dialog.showModal();
  try {
    const cutoff = state.dashboard?.filters.cutoff ?? 120;
    const body = await requestJson(`/api/evidence/${encodeURIComponent(identifier)}?cutoff=${cutoff}`);
    $("#evidence-family").textContent = `${body.family} · ${body.release}`;
    $("#evidence-title").textContent = body.identifier;
    renderEvidenceRecord(body.record);
  } catch (error) {
    $("#evidence-body").innerHTML = "";
    const failure = document.createElement("div");
    failure.className = "evidence-error";
    failure.textContent = error.message;
    $("#evidence-body").append(failure);
  }
}

function renderEvidenceRecord(record) {
  const container = $("#evidence-body");
  container.replaceChildren();
  const summary = record.summary || record.description || record.capability_summary;
  if (summary) {
    const p = document.createElement("p");
    p.className = "evidence-summary";
    p.textContent = summary;
    container.append(p);
  }
  const preferred = [
    "title", "vessel_name", "ship_name", "entity_name", "name", "record_id", "artifact_id", "hull_id", "facility_id", "entity_id",
    "mmsi", "observation_hour", "collection_hour", "report_hour", "ingest_hour", "collector_id", "source_id", "upstream_source_id",
    "latitude", "longitude", "speed_knots", "course_deg", "navigation_status", "signal_quality", "duplicate_indicator",
    "source_reliability", "information_credibility", "analytic_confidence", "identification_confidence", "coverage_limits", "characteristic_failure_modes",
    "hull_number", "class_designation", "category", "primary_role", "unit_designation", "home_facility_name", "assessment_confidence",
  ];
  const ignored = new Set(["training_data", "classification", "body", "summary", "description", "capability_summary"]);
  const keys = [...preferred.filter((key) => key in record), ...Object.keys(record).filter((key) => !preferred.includes(key) && !ignored.has(key))];
  const table = document.createElement("table");
  table.className = "evidence-table";
  const tbody = document.createElement("tbody");
  keys.forEach((key) => {
    const value = record[key];
    if (value === null || value === undefined || value === "") return;
    const row = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");
    th.textContent = key.replaceAll("_", " ");
    td.textContent = typeof value === "object" ? JSON.stringify(value) : String(value);
    row.append(th, td);
    tbody.append(row);
  });
  table.append(tbody);
  container.append(table);
  if (record.body) {
    const details = document.createElement("details");
    details.className = "source-body";
    const summaryNode = document.createElement("summary");
    summaryNode.textContent = "Full released source body";
    const pre = document.createElement("pre");
    pre.textContent = record.body;
    details.append(summaryNode, pre);
    container.append(details);
  }
}

function walkCoordinates(value, callback) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    callback(value[0], value[1]);
    return;
  }
  value.forEach((child) => walkCoordinates(child, callback));
}

function computeBounds() {
  const coords = [];
  if (state.geo?.features) {
    state.geo.features.forEach((feature) => walkCoordinates(feature.geometry?.coordinates, (lon, lat) => coords.push([lon, lat])));
  }
  visibleVessels().forEach((vessel) => {
    state.tracks.filter((point) => point.mmsi === vessel.mmsi).forEach((point) => coords.push([point.longitude, point.latitude]));
  });
  if (!coords.length) return { minLon: 58, maxLon: 66.5, minLat: -14.5, maxLat: -8 };
  const lons = coords.map((item) => item[0]);
  const lats = coords.map((item) => item[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return { minLon: minLon - .25, maxLon: maxLon + .25, minLat: minLat - .2, maxLat: maxLat + .2 };
}

function projection(width, height) {
  const bounds = state.bounds || computeBounds();
  state.bounds = bounds;
  const pad = 22;
  const xScale = (width - pad * 2) / (bounds.maxLon - bounds.minLon);
  const yScale = (height - pad * 2) / (bounds.maxLat - bounds.minLat);
  const scale = Math.min(xScale, yScale);
  const usedWidth = (bounds.maxLon - bounds.minLon) * scale;
  const usedHeight = (bounds.maxLat - bounds.minLat) * scale;
  const left = (width - usedWidth) / 2;
  const top = (height - usedHeight) / 2;
  return (lon, lat) => [left + (lon - bounds.minLon) * scale, top + (bounds.maxLat - lat) * scale];
}

function traceGeometry(ctx, geometry, project) {
  const drawLine = (line) => {
    line.forEach((coord, index) => {
      const [x, y] = project(coord[0], coord[1]);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
  };
  if (geometry.type === "LineString") drawLine(geometry.coordinates);
  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") geometry.coordinates.forEach(drawLine);
  if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((polygon) => polygon.forEach(drawLine));
}

function drawMap() {
  const canvas = $("#movement-map");
  if (!canvas || !state.geo || !state.dashboard) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const project = projection(rect.width, rect.height);

  state.geo.features.forEach((feature) => {
    if (!feature.geometry) return;
    const type = feature.properties?.feature_type;
    ctx.beginPath();
    traceGeometry(ctx, feature.geometry, project);
    if (["landmass", "elevation_band"].includes(type)) {
      ctx.closePath();
      ctx.fillStyle = type === "landmass" ? "#16323a" : "rgba(46,82,84,.34)";
      ctx.fill();
      ctx.strokeStyle = type === "landmass" ? "#31565d" : "rgba(56,89,91,.35)";
      ctx.lineWidth = .8;
      ctx.stroke();
    } else {
      ctx.strokeStyle = type === "river" ? "rgba(86,142,153,.46)" : "rgba(75,112,116,.42)";
      ctx.lineWidth = type === "river" ? .65 : .75;
      ctx.stroke();
    }
  });

  state.projectedPoints = [];
  const vessels = visibleVessels();
  vessels.forEach((vessel, vesselIndex) => {
    const points = state.tracks.filter((point) => point.mmsi === vessel.mmsi);
    if (!points.length) return;
    const selected = vessel.mmsi === state.selectedMmsi;
    const color = scopeColors[vessel.vessel_scope];
    ctx.save();
    ctx.beginPath();
    points.forEach((point, index) => {
      const [x, y] = project(point.longitude, point.latitude);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      state.projectedPoints.push({ x, y, point, vessel });
    });
    ctx.strokeStyle = color;
    ctx.globalAlpha = state.selectedMmsi && !selected ? .22 : (selected ? 1 : .7);
    ctx.lineWidth = selected ? 3 : (vessel.vessel_scope === "military" ? 1.8 : 1.4);
    if (vessel.vessel_scope === "related_civilian") ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    const latest = points.at(-1);
    const [latestX, latestY] = project(latest.longitude, latest.latitude);
    ctx.globalAlpha = state.selectedMmsi && !selected ? .32 : 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(latestX, latestY, selected ? 5 : 3.3, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = "#e6f0f2";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    if (vesselIndex === 0) ctx.globalAlpha = 1;
  });

  const keyFacilities = new Set(["FAC-KOR-ASTER", "FAC-KOR-KESH-MP"]);
  state.dashboard.facilities.filter((facility) => keyFacilities.has(facility.facility_id)).forEach((facility) => {
    const [x, y] = project(facility.longitude, facility.latitude);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#071015";
    ctx.strokeStyle = "#d4e2e5";
    ctx.lineWidth = 1;
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.strokeRect(-3.5, -3.5, 7, 7);
    ctx.restore();
    ctx.fillStyle = "rgba(230,240,242,.78)";
    ctx.font = "9px system-ui";
    ctx.fillText(facility.name.replace(" Facility", "").replace(" Military Logistics Pier", " Pier"), x + 7, y - 6);
  });
}

function nearestMapPoint(event) {
  const canvas = $("#movement-map");
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let winner = null;
  let distance = Infinity;
  state.projectedPoints.forEach((candidate) => {
    const delta = Math.hypot(candidate.x - x, candidate.y - y);
    if (delta < distance) {
      winner = candidate;
      distance = delta;
    }
  });
  return distance <= 11 ? { ...winner, distance, cursorX: x, cursorY: y } : null;
}

function showMapTooltip(hit) {
  const tooltip = $("#map-tooltip");
  if (!hit) {
    tooltip.hidden = true;
    return;
  }
  tooltip.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = hit.vessel.vessel_name;
  const detail = document.createElement("span");
  detail.textContent = `${formatHour(hit.point.observation_hour)} · ${formatNumber(hit.point.speed_knots)} kt · ${hit.point.record_id}`;
  tooltip.append(strong, detail);
  tooltip.style.left = `${Math.max(8, Math.min(hit.cursorX + 12, $("#map-wrap").clientWidth - 240))}px`;
  tooltip.style.top = `${Math.max(8, hit.cursorY - 48)}px`;
  tooltip.hidden = false;
}

function bindEvents() {
  $$(".scope-filters input").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.scopes.add(input.value); else state.scopes.delete(input.value);
    if (state.selectedMmsi && !visibleVessels().some((item) => item.mmsi === state.selectedMmsi)) state.selectedMmsi = null;
    state.bounds = null;
    renderVesselList();
    renderSelectedVessel();
    drawMap();
  }));
  $("#search-input").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderVesselList();
    renderFeed();
  });
  $("#window-select").addEventListener("change", (event) => {
    state.window = Number(event.target.value);
    state.selectedMmsi = null;
    state.bounds = null;
    loadAll();
  });
  $$(".feed-tab").forEach((button) => button.addEventListener("click", () => {
    state.feedMode = button.dataset.feed;
    $$(".feed-tab").forEach((peer) => peer.classList.toggle("active", peer === button));
    renderFeed();
  }));
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => {
    $$(".nav-button").forEach((peer) => peer.classList.toggle("active", peer === button));
    document.getElementById(button.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("#refresh-button").addEventListener("click", () => loadAll({ refresh: true }));
  $("#fit-button").addEventListener("click", () => {
    state.bounds = null;
    drawMap();
  });
  $("#map-collapse").addEventListener("click", (event) => {
    const card = $(".map-card");
    card.classList.toggle("collapsed");
    const expanded = !card.classList.contains("collapsed");
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    event.currentTarget.textContent = expanded ? "Collapse" : "Expand";
    if (expanded) requestAnimationFrame(drawMap);
  });
  $("#movement-map").addEventListener("mousemove", (event) => showMapTooltip(nearestMapPoint(event)));
  $("#movement-map").addEventListener("mouseleave", () => showMapTooltip(null));
  $("#movement-map").addEventListener("click", (event) => {
    const hit = nearestMapPoint(event);
    if (hit) selectVessel(hit.vessel.mmsi);
  });
  $("#dialog-close").addEventListener("click", () => $("#evidence-dialog").close());
  $("#evidence-dialog").addEventListener("click", (event) => {
    if (event.target === $("#evidence-dialog")) $("#evidence-dialog").close();
  });
  new ResizeObserver(() => drawMap()).observe($("#map-wrap"));
}

function connectStream() {
  const events = new EventSource("/api/stream");
  events.addEventListener("connected", () => setConnection("online", "Standalone snapshot"));
  events.addEventListener("release", () => loadAll({ refresh: true }));
  events.addEventListener("error", () => setConnection("error", "Release stream reconnecting"));
}

bindEvents();
connectStream();
loadAll();
