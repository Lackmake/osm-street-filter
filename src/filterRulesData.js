/**
 * OSM Street Filter Rules Data Definition
 * Sequentially documents each evaluation step in the exact priority order executed by filterEngine.js
 */

export const FILTER_RULES = [
  {
    step: 1,
    action: 'include',
    title: 'Explicit Pedestrian Access',
    tags: 'foot = yes | designated | allowed | permissive | official, foot:conditional',
    summary: 'Streets with explicit pedestrian permission tags are included immediately.',
    description: 'If an OSM way explicitly allows foot traffic via foot=* or foot:conditional, it bypasses default highway exclusion rules.',
    examples: ['foot=yes', 'foot=designated', 'foot:conditional=yes @ (06:00-20:00)']
  },
  {
    step: 2,
    action: 'include',
    title: 'Standard Drivable & Walkable Roads',
    tags: 'highway = residential | living_street | pedestrian | tertiary | secondary | primary | unclassified | road',
    summary: 'Standard public roads suitable for walking are included by default.',
    description: 'Roads meant for general traffic or pedestrian access are automatically included unless subsequent exclusion rules apply.',
    examples: ['highway=residential', 'highway=tertiary', 'highway=living_street', 'highway=pedestrian']
  },
  {
    step: 3,
    action: 'exclude',
    title: 'Forbidden or Restricted Foot Access',
    tags: 'foot = no | use_sidepath | private | destination | customers',
    summary: 'Roads where walking is forbidden or restricted are excluded.',
    description: 'Explicit foot access restrictions override default highway inclusions.',
    examples: ['foot=no', 'foot=use_sidepath', 'foot=private']
  },
  {
    step: 4,
    action: 'include',
    title: 'Wandrer Sidewalk Rule',
    tags: 'foot = use_sidepath + sidewalk = separate',
    summary: 'Re-includes streets where sidepaths are mapped as separate OSM ways.',
    description: 'If foot=use_sidepath is specified but the sidewalk itself is mapped as a standalone OpenStreetMap line (sidewalk=separate), the main road is included.',
    examples: ['foot=use_sidepath + sidewalk=separate', 'sidewalk:both=separate']
  },
  {
    step: 5,
    action: 'exclude',
    title: 'Pedestrian Areas & Public Squares',
    tags: 'highway = pedestrian + area = yes | place = square',
    summary: 'Pedestrian zones mapped as polygons/areas and town squares are excluded.',
    description: 'Open plazas, paved areas, and town squares are excluded from linear street coverage calculation.',
    examples: ['highway=pedestrian + area=yes', 'place=square']
  },
  {
    step: 6,
    action: 'exclude',
    title: 'Bicycle Sidepath Restriction',
    tags: 'bicycle = use_sidepath',
    summary: 'Roads requiring bicycles to use sidepaths are excluded.',
    description: 'When bicycle=use_sidepath is tagged without explicit foot permission, the road is excluded.',
    examples: ['bicycle=use_sidepath']
  },
  {
    step: 7,
    action: 'exclude',
    title: 'Private & Restricted Access Roads',
    tags: 'access = private | customers | military | destination | no',
    summary: 'Private property, restricted access, or military roads are excluded.',
    description: 'Roads restricted to private owners, customers, military, or destination-only access are excluded unless explicit foot access is allowed.',
    examples: ['access=private', 'access=customers', 'access=no']
  },
  {
    step: 8,
    action: 'exclude',
    title: 'Major Arterials & Service Roads Without Foot Tag',
    tags: 'highway = trunk | trunk_link | bridleway | service (without foot tag)',
    summary: 'High-speed trunk roads, bridleways, and generic service roads are excluded.',
    description: 'Trunk motorways, horse paths (bridleways), and utility service roads are excluded unless foot permission is explicitly tagged.',
    examples: ['highway=trunk', 'highway=bridleway', 'highway=service']
  },
  {
    step: 9,
    action: 'include',
    title: 'Parks, Unpaved Paths & Named Service Roads',
    tags: 'highway = footway | steps | path | track | service',
    summary: 'Footways in parks/nature, unpaved surfaces, shared bike paths, or named service roads are included.',
    description: 'Footways/steps located inside park/nature areas, unpaved surface ways (dirt, gravel, earth), footways with bicycle=yes, and service roads with names are included.',
    examples: ['footway in nature area', 'surface=gravel', 'highway=footway + bicycle=yes', 'highway=service + name="Park Lane"']
  },
  {
    step: 10,
    action: 'exclude',
    title: 'Crossings, Tunnels, Covered Ways & Golf Paths',
    tags: 'footway = crossing | motorroad = yes | covered = yes | indoor = yes | tunnel = yes | golf_cart = yes',
    summary: 'Special structure exclusions, pedestrian crossings, tunnels, indoor passages, and golf cart paths.',
    description: 'Crossings across streets, motorways, indoor/covered passages, tunnels, and golf cart tracks are excluded from valid street walk coverage.',
    examples: ['footway=crossing', 'motorroad=yes', 'indoor=yes', 'covered=yes', 'tunnel=yes']
  }
];
