// Source-only selection: rendering owns every default, interpolation and generated model.
import {PLANIMETRIC_SOURCES} from '../data/nyc-planimetrics.js';
export const MERGE_POLICY_VERSION = 27;
export const MERGE_POLICY_STATUS = 'source observations and selections only; separate render decisions';
export const MERGE_INVARIANTS = [
  "Preserve every original record. Resolve geometry and each attribute separately; there is no global winning provider.",
  "Merge only records describing the same physical feature or an explicitly related representation. Same location or name alone is insufficient.",
  "Compare local metre coordinates, normalized units, compatible feature types and vertical levels. Treat missing level information as unknown, not evidence of equality.",
  "Keep unmatched features from either source. Absence from a dataset does not prove that a feature is absent from the world.",
  "Use verified shared IDs where available. Otherwise require unambiguous geometric and semantic evidence; ambiguous matches remain separate and are logged.",
  "Source priority lists are deterministic fallbacks among compatible valid records, not proof that one provider is always better. Stronger feature-specific quality or observation evidence can override a default, with the reason recorded.",
  "Select valid measured values only. Null, field-specific zero-as-missing and malformed values never erase valid values. Explicit zero curb height is valid. Never average conflicting dimensions silently.",
  "Use observation dates for freshness when available. Fetch time, dataset publication time and edit time alone do not establish when an object was observed.",
  "Keep every candidate observation, complete original geometry, chosen source, conversion, rule version, match evidence and conflict. Retain upstream estimates with their qualifications; merge generates no estimates or extrapolations, which belong exclusively to render decisions.",
  "Matching is independent of fetch order. Source/category checkboxes select merge inputs: disabled providers cannot suppress selected alternatives. Cached 3D display-only visibility does not re-resolve a plan; regenerate after changing inputs.",
  "Source representation suppression requires confirmed compatible source geometry. All unique original observations remain available to the renderer; uncertainty retains alternatives. Visual exclusions are separate render decisions."
];
export const NYC_MERGE_POLICY = {...Object.fromEntries(PLANIMETRIC_SOURCES.map(s=>[s.id,'planimetric-inventory'])),"nyc-building-grade":"building-grade-inventory","nyc-pedestrian-ramps":"street-inventory","nyc-pedestrian-progress":"street-inventory","mta-entrances":"station-inventory","mta-stations":"station-inventory","nyc-lidar-2017":"point-cloud","nysdot-ramps":"transport-inventory","nysdot-roadways":"transport-inventory","nysdot-bridges":"transport-inventory","nysdot-overhead-signs":"sign-structure-inventory","nysdot-height-restricted-bridges":"bridge-clearance-inventory","usdot-nbi-2023":"transport-inventory","nysdot-bridge-roadway":"transport-inventory","nyc-buildings":"buildings","nyc-buildings-2014":"buildings","nyc-water-tanks":"roof-equipment","nyc-roadbed":"roads","nyc-sidewalk":"sidewalks","nyc-median":"medians","nyc-transport":"transport","nyc-railroad":"rail","nyc-rail-structures":"rail","nyc-retaining-walls":"barriers","nyc-boardwalk":"coastal","nyc-shoreline":"coastal","nyc-hydro-structures":"coastal","nyc-hydrography":"coastal","nyc-lion":"roads","nyc-curbs":"curbs","nyc-pavement":"pavement-edges","nyc-trees":"trees","nyc-elevation":"elevation"};
export const MERGE_POLICIES = [
  {
    id:'building-grade-inventory',name:'Building grade and active-floor observations',sources:['nyc-building-grade','nyc-buildings'],
    match:'A valid building BIN can relate the reported centroid to a footprint with the same building BIN. Keep both records and distinct roles; a shared tax lot, proximity or matching height is insufficient.',
    geometrySources:['nyc-building-grade:source-centroid'],geometry:'Retain each source centroid and full original response. It is not a footprint, surveyed terrain point or street-level sample.',
    attributeSources:{grade:['nyc-building-grade:z_grade'],activeFloor:['nyc-building-grade:z_floor'],qualification:['nyc-building-grade:notes1,notes2,notes3']},
    attributes:'Preserve feet, source-stated vertical reference, notes, subgrade status and original numeric values. The lowest actively used floor is source-estimated; an obstructed lowest adjacent grade may also be source-estimated. No merge-stage floor, street or grade value is generated.',
    conflicts:'BES grade, footprint ground_elevation and roof heights are distinct observations. Retain every original record, disagreement and observation date; any future role-specific preference must not delete an alternative.'
  },
  {
    id:'structures',name:'Standalone mapped structures',sources:['osm-overpass'],
    match:'Retain explicit man_made roles separately from generic land areas. Geometry proximity alone does not establish a match to NYC hydro or transport observations.',
    geometrySources:['osm-overpass'],geometry:'Preserve mapped points, paths, complete outlines and holes without treating a closed structure as a ground styling surface.',
    attributeSources:{classification:['man_made'],dimensions:['height','width']},attributes:'Keep original tags and valid measured dimensions with units and provenance. Unknown placement, thickness and support geometry remain unknown.',
    conflicts:'Keep unmatched structures and dated alternatives available. Physical placement and reconstruction require renderer rules; merge supplies no estimated elevations or solids.'
  },
  {
    id:'street-inventory',name:'Pedestrian ramp survey and work records',sources:['nyc-pedestrian-ramps','nyc-pedestrian-progress'],
    match:'Survey ramp IDs identify surveyed access points; program object IDs identify work records. Shared corner IDs are relationships, not proof of one ramp or a duplicate record. Different observations and dates remain separate.',
    geometrySources:['original-source'],geometry:'Retain reported locations with every measurement, status, source field and response. A point does not supply ramp orientation, outlines or a highway on-ramp alignment.',
    attributeSources:{identity:['rampid','objectid','cornerid'],observations:['original-source-fields']},attributes:'Preserve numeric strings, negative values, missing values and dated observations unchanged. Units, sentinels and measurement roles require verified field-specific interpretation before use.',
    conflicts:'Do not replace old measurements with newer program status or interpret negative ramp lengths as physical dimensions. Rendering owns any validated pedestrian-ramp geometry; neither source measures highway grades or pillars.'
  },
  {
    id:'planimetric-inventory',name:'Original NYC planimetric observations',sources:PLANIMETRIC_SOURCES.map(s=>s.id),
    match:'Original ArcGIS layers and Socrata exports may describe the same NYC survey. Keep both channels until shared source IDs, survey edition, classifications and compatible geometry establish an association; proximity alone never suppresses either.',
    geometrySources:['original-source'],geometry:'Retain geographic XYZ, source-native coordinates, curves, fields and full responses. Deck, rail, curb and retaining-wall vertices have different capture roles; a Z value never automatically becomes a deck grade or equipment height.',
    attributeSources:{identity:['OBJECTID','SOURCE_ID','GlobalID'],classification:['FEATURE_CODE','SUB_FEATURE_CODE','STATUS'],equipment:['BIN','DESCRIPTION']},attributes:'Preserve complete survey observations and lineage. Cooling-tower and miscellaneous outlines supply no height or individual support positions. Source merge creates no solids, curb ramps or elevation profiles.',
    conflicts:'Keep unresolved cross-export associations and distinct physical roles available. Standard capture dimensions are mapping conventions, not surveyed structural widths. Original services do not count as independent confirmation of their Socrata exports.'
  },
  {
    id:'station-inventory',name:'Station inventory observations',sources:['mta-stations','mta-entrances','nyc-rail-structures','osm-overpass'],
    match:'Station MRNs and GTFS stop IDs identify transit records; entrance row IDs identify separate access points. A station centroid, entrance, complex member and mapped station polygon describe separate roles. Proximity and station names alone do not establish duplication.',
    geometrySources:['mta-stations:GTFS-centroid','mta-entrances:entrance-coordinate'],geometry:'Keep source centroids, entrance coordinates and complete records. No platform dimensions, stairs, height, support placement or route connectivity are derived.',
    attributeSources:{identity:['station_id','complex_id','gtfs_stop_id'],classification:['structure'],services:['daytime_routes']},attributes:'Retain every delivered field, the original georeference alternative and provider schema/date metadata. Structure type and accessibility flags are semantic observations.',
    conflicts:'Retain different complex members and ambiguous associations. Station records do not suppress physical station or rail geometry.'
  },
  {
    id:'point-cloud',name:'Original LiDAR point payloads',sources:['nyc-lidar-2017'],
    match:'EPT node identity identifies a unique payload within this distribution. Intersecting depths are additive; coarse and fine nodes are complementary, never duplicates.',
    geometrySources:['nyc-lidar-2017:original-LASzip'],geometry:'Preserve original compressed payloads and complete decoded LAS point records, native XYZ, attributes, LAS/VLR layout, hierarchy and source inventory. Saved compressed-only captures remain available for later decoding. Node envelopes describe acquisition coverage, not measured object geometry.',
    attributeSources:{coordinates:['LAS-header','EPT-srs'],dimensions:['EPT-schema','LAS-VLR'],provenance:['OriginId','ept-sources/list.json']},attributes:'Retain checksums, complete bytes, source CRS, units, declared survey year and conservative query envelope. No point filtering, resampling, height alignment or roof/deck reconstruction occurs during merge.',
    conflicts:'Header/hierarchy/decoded-point inconsistency or acquisition limits reject a complete snapshot, with read evidence archived separately. Point-class interpretation, datum alignment and physical model construction belong to rendering and remain pending.'
  },
  {
    id:'bridge-clearance-inventory',name:'Reported bridge clearances',sources:['nysdot-height-restricted-bridges','nysdot-bridges','usdot-nbi-2023'],
    match:'Retain each height-restricted service row by its own OBJECTID. A matching validated NYSDOT bridge BIN may relate the bridge records, but point proximity or a shared crossed-road name alone does not prove the same physical underpass or direction.',
    geometrySources:['nysdot-height-restricted-bridges:reported-point'],geometry:'Preserve the bridge reference point, complete native/GeoJSON responses and every original clearance/inspection field. A point and one minimum clearance do not define a road surface, continuous underside, pier or usable vehicle route.',
    attributeSources:{identity:['BIN','OBJECTID'],crossing:['CARRIED_1','CROSSED_1','CROSSED_MIN_VERT_DESC'],reportedClearance:['MIN_VERT_CLEARANCE_ON','MIN_VERT_CLEARANCE_UNDER','POSTED_VRT_CLRNC_UNDER','PERMITTED_VC_UNDER'],date:['INSPECTION_DATE','Date_FC_Updated']},
    attributes:'Retain reported numeric values, field names, text, zeroes, high sentinels and dates unchanged. Validate source units, sentinels, crossing role and inspection time before selecting a physical clearance; source merge computes no elevation or underside profile.',
    conflicts:'A federal/state bridge or low-bridge catalog may carry a different edition, definition or direction of clearance. Preserve all alternatives and disagreements; renderer interpretation cannot promote a single point value to a measured surface.'
  },
  {
    id:'sign-structure-inventory',name:'Overhead-sign asset locations',sources:['nysdot-overhead-signs','nyc-misc-structures-2022'],
    match:'Keep state AssetID/SIN in the sign-asset namespace and NYC miscellaneous-structure GlobalID in its survey namespace. Proximity alone cannot establish that a state asset point and a NYC sign-gantry polygon are the same physical structure.',
    geometrySources:['nysdot-overhead-signs:reported-point','nyc-misc-structures-2022:survey-outline'],geometry:'Preserve original point and polygon observations, complete native/geographic responses and independent identities. A sign asset point is not a post location, sign face or gantry span.',
    attributeSources:{identity:['AssetID','SIN','GlobalID'],status:['AssetStatus','STATUS'],description:['DESCRIPTION']},attributes:'Retain all original fields, source status and edit dates without assigning dimensions, elevation, column count or sign orientation.',
    conflicts:'State sign points and city miscellaneous outlines may describe the same asset or distinct assets. Keep both until independent identity and geometry evidence supports association; rendering owns any constructed sign or support model.'
  },
  {
    id:'transport-inventory',name:'Roadway, ramp and bridge inventories',
    sources:['nysdot-ramps','nysdot-roadways','nysdot-bridges','usdot-nbi-2023','nysdot-bridge-roadway'],
    match:'Retain inventory points and road/ramp alignments as complementary references. NYSDOT bridge BINs belong to the bridge inventory namespace, independently of NYC building BINs. Federal NBI structure IDs need validated equivalence before joining NYSDOT BINs. Route IDs, positions or names alone do not establish matching geometry, levels or connectivity.',
    geometrySources:['original-source'],
    geometry:'Preserve every alignment, inventory point, native geometry channel, route measure and full property set. An inventory location is not an individual support location; an alignment is not a surveyed deck surface.',
    attributeSources:{classification:['Roadway_Type','RAMP_INTERCHANGE_CODE'],bridge:['BIN','BRIDGE_FEATURE_NUMBER','NumberOfSpans','GTMSStructure','GTMSMaterial','structure_'],routeRelationship:['nysdot-bridge-roadway:Bridge_ROUTE_ID,ROUTE_ID,FROM_MEASURE,TO_MEASURE'],dimensions:['original-source-fields','usdot-nbi-2023:max_span_l,deck_width,vert_clr_1,min_vert_c'],supportContext:['usdot-nbi-2023:pier_prote']},
    attributes:'Retain lane, pavement, shoulder, direction, material, span-count, route-measure, relative-clearance and dimension fields without deriving member positions, alignments or widths. Federal codes, units and missing-value sentinels require their field dictionary before physical selection. HasZ only declares a channel; the sampled roadway and ramp Z values were all zero, and no verified vertical role is assigned.',
    conflicts:'Unproven identities and duplicate-looking representations remain available. Federal inventory clearances are not safe route-clearance measurements; matching to deck/road geometry, grades, support layouts and dimension interpretation require explicit render rules with evidence.'
  },
  {
    id:"roof-equipment",
    name:"Rooftop water tanks",
    sources:["nyc-water-tanks","nyc-buildings","nyc-buildings-2014"],
    match:"Retain rooftop equipment as a distinct role. A valid BIN identifies possible parent relationships; roof support and attachment are evaluated by rendering.",
    geometrySources:["nyc-water-tanks"],
    geometry:"Keep the measured footprint, base, top and height as observations. Preserve overlapping native meshes and current outlines for renderer attachment and overlap checks.",
    attributeSources:{"dimensions":["nyc-water-tanks:BASE_ELEVATION,TOP_ELEVATION,HEIGHT"],"parent":["BIN"],"base":["nyc-buildings:ground_elevation"]},
    attributes:"Retain every native response, property, metadata field and declared datum. Convert recorded feet to metres without constructing an envelope model.",
    conflicts:"Missing dimensions, conflicting identities and ambiguous relationships remain available. Parent roof support, rigid placement, wall/top shape and supports are renderer decisions."
  },
  {
    id:"transport",
    name:"Bridge decks and transportation structures",
    sources:["nyc-transport","nyc-elevation","osm-overpass","nyc-railroad"],
    match:"Keep transportation polygons, bridge/ground spot observations and ordered OSM roads as complementary source roles. A polygon, road and elevation point are not duplicates.",
    geometrySources:["nyc-transport","osm-overpass:ordered-bridge-roads","osm-overpass:bridge:support"],
    geometry:"Retain the complete mapped deck outline, all holes, road paths, support outlines and source points. Do not synthesize a deck profile, ramp, pylon frame or missing support.",
    attributeSources:{"elevation":["nyc-elevation:sub_code=300020"],"classification":["nyc-transport:feat_code","osm-overpass"]},
    attributes:"Preserve actual elevations and units, source roles, bridge identities, node membership and relative layer tags. Layer numbers never supply metres.",
    conflicts:"Overlapping structures, unknown levels and contradictory observations remain distinct. Interpolation, support membership, clearance, road grades and mesh construction belong to rendering."
  },
  {
    id:"coastal",
    name:"Boardwalks, shorelines and waterfront surfaces",
    sources:["nyc-boardwalk","nyc-shoreline","nyc-hydro-structures","nyc-hydrography","osm-overpass"],
    match:"These are complementary roles. A shoreline does not replace a seawall, and water does not replace a pier. No automatic cross-source identity suppression without matching evidence.",
    geometrySources:["original-source"],
    geometry:"Keep mapped shoreline, boardwalk, hydrography and hydro-structure roles and complete original geometry, including holes.",
    attributeSources:{"elevation":["nyc-hydro-structures:elevation"],"classification":["feat_code","sub_code","osm-overpass"]},
    attributes:"Retain actual recorded elevations and source classes. A shoreline does not determine a wall height, water level, deck thickness or support shape.",
    conflicts:"Unmeasured water/structure elevations and ambiguous source roles remain references. Terrain-following, display offsets and thickness choices belong to rendering."
  },
  {
    id:"buildings",
    name:"Buildings and building parts",
    sources:["osm-overpass","nyc-buildings","nyc-buildings-2014"],
    match:"Unique shared NYC BIN (OSM nycdoitt:bin ↔ NYC bin) plus at least 50% sampled footprint intersection-over-union, or 80% without conflicting valid BINs. Ignore borough placeholder IDs. Repeated IDs, conflicting IDs and weak overlap remain review records. Match only whole-building roles; preserve parts and ambiguous splits.",
    geometrySources:["nyc-buildings","osm-overpass","nyc-buildings-2014:associated-dated-surfaces"],
    geometry:"Select the valid current NYC footprint after reciprocal identity/geometry matching. Associate compatible whole-building identities across dated native surfaces and footprints, preserving every distinct geometry and metric. The renderer decides mesh display eligibility, height/history/detail gates and part assemblies.",
    attributeSources:{"height":["nyc-buildings:height_roof","osm-overpass:height"],"ground":["nyc-buildings:ground_elevation"],"useAndName":["osm-overpass","nyc-buildings"]},
    attributes:"Prefer recorded NYC roof height, then a valid measured OSM height after a confirmed match. Keep levels, names, use, identifiers, dates and actual ground elevations without deriving floor heights or terrain bases.",
    conflicts:"Ambiguous identities, parts, conflicting heights and post-capture changes retain all alternatives. Native rebasing, collision proxies, default heights and parent-volume suppression are renderer decisions."
  },
  {
    id:"roads",
    name:"Roads and paths",
    sources:["osm-overpass","nyc-roadbed","nyc-lion"],
    match:"Associate OSM road segments with intersecting compatible roadbed polygons using direction, road class and known level. A centerline and a surface are complementary representations, not identical geometry.",
    geometrySources:["nyc-roadbed","osm-overpass"],
    geometry:"Select actual NYC roadbed surfaces with all holes. Retain complete OSM topology and uncovered source centreline spans with logged coverage masks. Every original path remains in observations.",
    attributeSources:{"semantics":["osm-overpass"],"outline":["nyc-roadbed"],"width":["osm-overpass:width","nyc-lion:StreetWidth_Min/Max-after-matching"]},
    attributes:"Keep actual OSM width, names, lanes, directions and access. LION aliases retain every row; an unambiguous same-name, same-level full-path association preserves its measured minimum/maximum width range without assigning a constant ribbon width.",
    conflicts:"Bridge, tunnel, ramp and unknown-level observations remain separate. Lane-to-width calculations, default widths and ribbons are renderer rules; a roadbed hole never proves a missing road surface."
  },
  {
    id:"sidewalks",
    name:"Sidewalks, crossings and pedestrian links",
    sources:["osm-overpass","nyc-sidewalk"],
    match:"Associate sidewalk areas and compatible sidewalk centerlines with NYC polygons. Keep crossings, entrances and steps as connected but distinct features; a nearby generic footpath is not automatically a sidewalk.",
    geometrySources:["nyc-sidewalk","osm-overpass"],
    geometry:"Preserve NYC sidewalk polygons and OSM uncovered path observations, crossings, entrances and steps with complete connectivity.",
    attributeSources:{"accessAndSurface":["osm-overpass"],"outline":["nyc-sidewalk"],"verticalOffset":["matched-measurement"]},
    attributes:"Keep actual accessibility, surface, width, crossing, step and vertical measurements. Do not add a curb offset.",
    conflicts:"Overlaps alone do not equate elevated and ground walkways. Preserve gaps and missing height evidence; the renderer chooses offsets and step models."
  },
  {
    id:"medians",
    name:"Medians and traffic islands",
    sources:["osm-overpass","nyc-median"],
    match:"Match overlapping island/median areas with compatible physical type. Painted, curbed, grass, fence and barrier medians are different attributes/structures.",
    geometrySources:["nyc-median","osm-overpass"],
    geometry:"Select compatible actual island outlines while preserving holes, painted/raised classifications and distinct fence/barrier roles.",
    attributeSources:{"subtype":["nyc-median:sub_code","osm-overpass"],"surface":["osm-overpass","nyc-median"],"height":["matched-measurement"]},
    attributes:"Keep subtype, material and surface as independent source facts. No island height is inferred from grass color, canopy coverage or classification.",
    conflicts:"Conflicting painted/raised classifications remain reviewable. Never fill polygon holes or remove barriers merely because their parent island has merged."
  },
  {
    id:"curbs",
    name:"Curbs and curb ramps",
    sources:["osm-overpass","nyc-curbs"],
    match:"Associate compatible near-coincident curb segments on the same boundary and level. Match segments, not entire polylines based on one nearby endpoint.",
    geometrySources:["nyc-curbs","osm-overpass"],
    geometry:"Select compatible coincident measured curb lines. Local point heights cannot set an entire longer line. Keep the full source paths of all represented records.",
    attributeSources:{"height":["osm-overpass:kerb:height","osm-overpass:height"],"classification":["osm-overpass:kerb"],"outline":["nyc-curbs","osm-overpass"]},
    attributes:"Collect all matched numeric height claims before selection. Explicit zero is a valid measurement. Conflicting measured heights retain every record. Keep kerb classification tags and all candidates without interpreting them as dimensions.",
    conflicts:"Classification-based heights, curb defaults, beam width and ramp geometry belong to rendering. Uncertain or contradictory numeric measurements stay separate."
  },
  {
    id:"pavement-edges",
    name:"Pavement boundaries",
    sources:["nyc-pavement","osm-overpass"],
    match:"Associate lines with compatible road/sidewalk boundaries. The boundary can describe an existing surface without being a second physical object.",
    geometrySources:["nyc-pavement","osm-overpass"],
    geometry:"Keep as reference boundaries and evidence for surface validation. Do not extrude another wall or curb at an already represented boundary. Unmatched lines remain inspectable.",
    attributeSources:{"boundary":["nyc-pavement"],"semantics":["osm-overpass"]},
    attributes:"Retain block-face and conflation metadata. A line is not enough to infer a road width or construct a closed polygon.",
    conflicts:"Boundary disagreements flag the associated surfaces for review rather than deforming or stitching them automatically."
  },
  {
    id:"trees",
    name:"Individual trees",
    sources:["osm-overpass","nyc-trees"],
    match:"Generate nearby point candidates, then require compatible tree identity, status and any available species/size evidence with an unambiguous one-to-one assignment. Nearest point alone is not enough in dense rows.",
    geometrySources:["matched-position-quality","osm-overpass","nyc-trees"],
    geometry:"Retain complete measured point alternatives. Reciprocal unique compatible tree matches may select the mapped point outside actual mapped road/walkway surfaces, with both positions recorded. Tree rows remain source paths.",
    attributeSources:{"position":["nyc-trees","osm-overpass"],"dimensions":["osm-overpass:height,diameter_crown,circumference"],"speciesAndStatus":["nyc-trees","osm-overpass"]},
    attributes:"Combine source status/species/date/DBH with measured OSM height, crown and circumference where available. Circumference-to-diameter is a documented mathematical conversion; species and DBH do not establish canopy height.",
    conflicts:"Ambiguous neighbours and retired/live conflicts remain separate. Tree defaults, row spacing, visual road clearance and instance exclusions are renderer decisions; every observation remains available."
  },
  {
    id:"vegetation-areas",
    name:"Tree rows, woods, hedges and vegetation areas",
    sources:["osm-overpass","nyc-trees"],
    match:"Relate individual trees to row/area generators spatially, while preserving the distinction between observed tree points and areas of vegetation.",
    geometrySources:["osm-overpass"],
    geometry:"Retain complete tree-row paths, woodland outlines, hedge boundaries and actual individual tree points as separate source roles.",
    attributeSources:{"vegetationType":["osm-overpass"],"individualTree":["nyc-trees","osm-overpass"]},
    attributes:"Retain available measured dimensions, spacing and species tags without procedural instance generation.",
    conflicts:"Overlap with a woodland or hedge never proves a duplicate measured tree. Spacing, default size and visual exclusions belong exclusively to rendering."
  },
  {
    id:"elevation",
    name:"Ground, roof and bridge elevations",
    sources:["nyc-elevation","nyc-buildings","osm-overpass"],
    match:"Match samples only when horizontal location, feature class, units and vertical reference are compatible. Ground samples, building base values, roof heights and roof elevations are not interchangeable.",
    geometrySources:["nyc-elevation:ground-only"],
    geometry:"Retain all actual point locations, source subtype/role and converted elevation values without constructing a ground surface.",
    attributeSources:{"ground":["nyc-elevation:sub_code=300000"],"buildingBase":["nyc-buildings:ground_elevation"],"supplementalElevation":["osm-overpass:ele-with-verified-datum"]},
    attributes:"Keep recorded units, datum metadata and every co-located reading. Merge cannot average, interpolate, classify uncertain sample roles or infer a terrain base.",
    conflicts:"Unknown datum and contradictory readings remain available with provenance. Role association, lattice interpolation and clearance tests belong to rendering."
  },
  {
    id:"barriers",
    name:"Fences, walls, gates and retaining walls",
    sources:["osm-overpass","nyc-retaining-walls"],
    match:"Same barrier type, compatible level and coincident segment/point identity. Gates belong to a barrier but are not duplicate fence posts; retaining walls have a different role from curbs.",
    geometrySources:["osm-overpass"],
    geometry:"Preserve OSM barriers. A mutually unique, fully coincident NYC retaining wall can be represented by an explicitly ground-level OSM retaining wall with measured height. Keep gates/openings and distinct parallel fences.",
    attributeSources:{"dimensionsAndMaterial":["osm-overpass"]},
    attributes:"Retain measured height/width, material, access and direction. Preserve all independent barrier/opening roles.",
    conflicts:"Do not infer a fence from pavement or a curb. Missing beam dimensions and placement remain renderer decisions."
  },
  {
    id:"rail",
    name:"Railways, stations and platforms",
    sources:["osm-overpass","nyc-railroad","nyc-rail-structures"],
    match:"Match only the same track/platform role and known level. Route relations describe service membership; they do not duplicate every member track.",
    geometrySources:["osm-overpass"],
    geometry:"Preserve separate tracks, platform areas, station points and entrances. Roadbed polygons do not erase rails or elevated infrastructure.",
    attributeSources:{"gaugeAndUse":["osm-overpass"]},
    attributes:"Convert a valid single numeric OSM gauge from millimetres and retain bridge/tunnel/layer, class, service and name. No standard gauge is assigned by merge.",
    conflicts:"Parallel tracks, stations and different levels remain distinct. Standard-gauge defaults, beam sections, support association and platform models belong to rendering."
  },
  {
    id:"street-furniture",
    name:"Benches, lamps, signals, bins and bollards",
    sources:["osm-overpass"],
    match:"Require compatible object kind and an unambiguous point identity. A lamp and a signal at one location can be separate objects or a shared support; proximity does not decide that.",
    geometrySources:["osm-overpass"],
    geometry:"Retain all unmatched props. One instance per confirmed duplicate; preserve components with different roles.",
    attributeSources:{"dimensionsAndOrientation":["osm-overpass"]},
    attributes:"Retain measured dimensions, explicit direction, material and operation tags. Unknown dimensions and orientation remain unknown.",
    conflicts:"Proximity does not establish a shared support. Default dimensions, north-facing orientation and placement belong to rendering; unsupported types remain source markers."
  },
  {
    id:"areas",
    name:"Parks, pitches, parking, water and other areas",
    sources:["osm-overpass"],
    match:"Compare semantic role as well as footprint. A park, pond, pitch and parking area can overlap a larger land-use polygon without being duplicates.",
    geometrySources:["osm-overpass"],
    geometry:"Preserve nested areas and holes. Dissolve only proven same-role duplicate surfaces; keep different surface roles as separate layers. NYC roads/sidewalks can cover ground styling without deleting the underlying land-use record.",
    attributeSources:{"useAndSurface":["osm-overpass"],"dimensions":["osm-overpass"]},
    attributes:"Keep use, material, access and water classification. Merge cannot infer depth, terrain or physical dimensions from a map color.",
    conflicts:"Incompatible boundaries or missing area topology are logged. Do not close incomplete rings or fill water/park holes to force a match."
  },
  {
    id:"places",
    name:"Names, businesses, amenities and entrances",
    sources:["osm-overpass","nyc-buildings"],
    match:"Relate a point/address to a building using explicit membership, address and containment evidence. A business in a building is not the building itself; multiple occupants are allowed.",
    geometrySources:["osm-overpass"],
    geometry:"Retain points and entrances as linked semantic features. Do not spawn duplicate building volumes from business nodes or erase multiple amenities that share an address.",
    attributeSources:{"namesUsesAndAccess":["osm-overpass"],"buildingIdentifiers":["nyc-buildings"]},
    attributes:"Preserve original names, uses, addresses and IDs by role. Different sources or tenants can have different valid names.",
    conflicts:"Ambiguous ownership/containment remains unlinked and logged. Mere nearest-building distance is not sufficient for attachment."
  },
  {
    id:"relations",
    name:"Relations and geometry support",
    sources:["osm-overpass"],
    match:"Use explicit OSM member references and roles rather than spatial coincidence. Untagged support nodes are vertices, not stand-alone physical objects.",
    geometrySources:["osm-overpass"],
    geometry:"Assemble complete multipolygon outer/inner rings once. Preserve independently meaningful member tags while preventing duplicate parent/member surface rendering. Logical routes/sites remain metadata.",
    attributeSources:{"membership":["osm-overpass"]},
    attributes:"Retain membership, roles, restrictions and source IDs even when no independent mesh is emitted.",
    conflicts:"Incomplete members, inconsistent roles and missing geometry remain visible in coverage/errors; do not guess a closed surface."
  },
  {
    id:"unknown",
    name:"Unrecognized or future feature types",
    sources:["*"],
    match:"No cross-source automatic matching until a compatible feature-specific policy exists. Exact duplicate raw records within one source can be deduplicated.",
    geometrySources:["original-source"],
    geometry:"Keep the original feature and reference outline/marker where available; do not silently discard it or invent a solid.",
    attributeSources:{"originalProperties":["original-source"]},
    attributes:"Retain all properties and source provenance. New adapters must declare a policy before participating in automatic suppression.",
    conflicts:"Log unsupported classification or geometry. Preserve unmatched records so adding a future rule can regenerate them without another inferred reconstruction."
  }
];
export function mergePoliciesForSource(sourceId) { const policies = MERGE_POLICIES.filter(p => p.sources.includes(sourceId)); return policies.length ? policies : [MERGE_POLICIES.find(p => p.id === 'unknown')]; }
