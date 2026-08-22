const ODDS_API_IO_SPORTS = [
  { sportKey: "cricket", title: "Cricket", ioSlug: "cricket", hints: ["cricket_test_match", "cricket_odi", "cricket_t20", "cricket_ipl"], categories: ["popular", "india-first", "live", "upcoming"] },
  { sportKey: "football", title: "Football", ioSlug: "football", hints: ["soccer_epl", "soccer_uefa_champs_league", "soccer_spain_la_liga"], categories: ["popular", "live", "upcoming"] },
  { sportKey: "tennis", title: "Tennis", ioSlug: "tennis", hints: ["tennis_atp", "tennis_wta"], categories: ["popular", "live", "upcoming"] },
  { sportKey: "basketball", title: "Basketball", ioSlug: "basketball", hints: ["basketball_nba", "basketball_euroleague", "basketball_ncaab"], categories: ["popular", "live", "upcoming"] },
  { sportKey: "baseball", title: "Baseball", ioSlug: "baseball", hints: ["baseball_mlb"], categories: ["live", "upcoming"] },
  { sportKey: "americanfootball", title: "American Football", ioSlug: "american-football", hints: ["americanfootball_nfl", "americanfootball_ncaaf"], categories: ["popular", "live", "upcoming"] },
  { sportKey: "icehockey", title: "Ice Hockey", ioSlug: "ice-hockey", hints: ["icehockey_nhl"], categories: ["live", "upcoming"] },
  { sportKey: "esports", title: "Esports", ioSlug: "esports", hints: ["esports"], categories: ["popular", "live", "upcoming"] },
  { sportKey: "darts", title: "Darts", ioSlug: "darts", hints: ["darts"], categories: ["live", "upcoming"] },
  { sportKey: "mma", title: "MMA", ioSlug: "mixed-martial-arts", hints: ["mma_mixed_martial_arts"], categories: ["popular", "live", "upcoming"] },
  { sportKey: "boxing", title: "Boxing", ioSlug: "boxing", hints: ["boxing"], categories: ["popular", "live", "upcoming"] },
  { sportKey: "handball", title: "Handball", ioSlug: "handball", hints: ["handball"], categories: ["upcoming"] },
  { sportKey: "volleyball", title: "Volleyball", ioSlug: "volleyball", hints: ["volleyball"], categories: ["upcoming"] },
  { sportKey: "snooker", title: "Snooker", ioSlug: "snooker", hints: ["snooker"], categories: ["upcoming"] },
  { sportKey: "tabletennis", title: "Table Tennis", ioSlug: "table-tennis", hints: ["tabletennis"], categories: ["upcoming"] },
  { sportKey: "rugby", title: "Rugby", ioSlug: "rugby", hints: ["rugbyleague_nrl", "rugbyunion_six_nations"], categories: ["upcoming"] },
  { sportKey: "waterpolo", title: "Water Polo", ioSlug: "water-polo", hints: ["waterpolo"], categories: ["upcoming"] },
  { sportKey: "futsal", title: "Futsal", ioSlug: "futsal", hints: ["futsal"], categories: ["upcoming"] },
  { sportKey: "beachvolleyball", title: "Beach Volley", ioSlug: "beach-volleyball", hints: ["beachvolleyball"], categories: ["upcoming"] },
  { sportKey: "aussierules", title: "Aussie Rules", ioSlug: "aussie-rules", hints: ["aussierules"], categories: ["upcoming"] },
  { sportKey: "floorball", title: "Floorball", ioSlug: "floorball", hints: ["floorball"], categories: ["upcoming"] },
  { sportKey: "squash", title: "Squash", ioSlug: "squash", hints: ["squash"], categories: ["upcoming"] },
  { sportKey: "beachsoccer", title: "Beach Soccer", ioSlug: "beach-soccer", hints: ["beachsoccer"], categories: ["upcoming"] },
  { sportKey: "lacrosse", title: "Lacrosse", ioSlug: "lacrosse", hints: ["lacrosse"], categories: ["upcoming"] },
  { sportKey: "curling", title: "Curling", ioSlug: "curling", hints: ["curling"], categories: ["upcoming"] },
  { sportKey: "padel", title: "Padel", ioSlug: "padel", hints: ["padel"], categories: ["upcoming"] },
  { sportKey: "bandy", title: "Bandy", ioSlug: "bandy", hints: ["bandy"], categories: ["upcoming"] },
  { sportKey: "gaelicfootball", title: "Gaelic Football", ioSlug: "gaelic-football", hints: ["gaelicfootball"], categories: ["upcoming"] },
  { sportKey: "beachhandball", title: "Beach Handball", ioSlug: "beach-handball", hints: ["beachhandball"], categories: ["upcoming"] },
  { sportKey: "athletics", title: "Athletics", ioSlug: "athletics", hints: ["athletics"], categories: ["upcoming"] },
  { sportKey: "badminton", title: "Badminton", ioSlug: "badminton", hints: ["badminton_bwf"], categories: ["mobile-first", "upcoming"] },
  { sportKey: "crosscountry", title: "Cross-Country", ioSlug: "cross-country", hints: ["crosscountry"], categories: ["upcoming"] },
  { sportKey: "golf", title: "Golf", ioSlug: "golf", hints: ["golf_pga"], categories: ["upcoming"] },
  { sportKey: "cycling", title: "Cycling", ioSlug: "cycling", hints: ["cycling"], categories: ["upcoming"] },
];

export const DEFAULT_SPORT_GROUPS = ODDS_API_IO_SPORTS.map((sport) => sport.sportKey);

export const ODDS_API_IO_SPORT_SLUGS = ODDS_API_IO_SPORTS.map((sport) => sport.ioSlug);

export const ioSlugForSportGroup = (sportKey = "") => {
  const group = canonicalizeSportGroup(sportKey);
  return (
    ODDS_API_IO_SPORTS.find((sport) => sport.sportKey === group)?.ioSlug || null
  );
};

export const SPORTSBOOK_PROVIDERS = [
  {
    key: "mock",
    title: "Mock Feed",
    type: "sandbox",
    sports: ["cricket", "football", "tennis", "badminton"],
    requiresToken: false,
  },
  {
    key: "simulated",
    title: "Simulated Live",
    type: "sandbox",
    sports: ["cricket", "football", "tennis", "badminton"],
    requiresToken: false,
  },
  {
    key: "odds-api-io",
    title: "Odds-API.io",
    type: "odds",
    sports: DEFAULT_SPORT_GROUPS,
    requiresToken: true,
  },
  {
    key: "the-odds-api",
    title: "The Odds API",
    type: "odds",
    sports: [
      "cricket",
      "football",
      "tennis",
      "basketball",
      "baseball",
      "americanfootball",
      "icehockey",
      "mma",
      "golf",
      "rugby",
    ],
    requiresToken: true,
  },
  {
    key: "sportmonks",
    title: "Sportmonks",
    type: "scores-odds",
    sports: ["football", "cricket", "formula1"],
    requiresToken: true,
  },
];

export const SPORTSBOOK_CATALOG = ODDS_API_IO_SPORTS.map((sport, index) => ({
  sportKey: sport.sportKey,
  title: sport.title,
  launchPriority: index + 1,
  categories: sport.categories,
  providerHints: sport.hints,
  ioSlug: sport.ioSlug,
}));

const SAFE_GROUP = /^[a-z0-9_]+$/i;

const SPORT_GROUP_TITLES = Object.fromEntries(
  ODDS_API_IO_SPORTS.map((sport) => [sport.sportKey, sport.title])
);

const SPORT_GROUP_CANONICAL = {
  soccer: "football",
  rugbyleague: "rugby",
  rugbyunion: "rugby",
  mixedmartialarts: "mma",
};

const KNOWN_SPORT_COVERS = new Set([
  ...DEFAULT_SPORT_GROUPS,
  "soccer",
  "rugbyleague",
  "rugbyunion",
]);

const LEGACY_SPORT_GROUP_ALIASES = {
  football: ["football", "soccer"],
  soccer: ["soccer", "football"],
  rugby: ["rugby", "rugbyleague", "rugbyunion"],
};

export const sportPrefixOf = (providerSportKey = "") => {
  const key = String(providerSportKey).toLowerCase().trim();
  if (!key) return "";
  const cut = key.indexOf("_");
  return cut === -1 ? key : key.slice(0, cut);
};

export const canonicalizeSportGroup = (group = "") => {
  const compact = String(group).toLowerCase().trim().replace(/-/g, "");
  return SPORT_GROUP_CANONICAL[compact] || compact;
};

export const resolveSportGroup = (providerSportKey = "") =>
  canonicalizeSportGroup(sportPrefixOf(providerSportKey));

export const titleOfSportGroup = (group = "") => {
  const key = canonicalizeSportGroup(group);
  if (SPORT_GROUP_TITLES[key]) return SPORT_GROUP_TITLES[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

export const coverOfSportGroup = (group = "") => {
  const slug = canonicalizeSportGroup(group);
  if (KNOWN_SPORT_COVERS.has(slug)) return `/sports/${slug}.png`;
  return "/sports/default.png";
};

export const emptySportGroup = (sportKey) => ({
  sportKey,
  title: titleOfSportGroup(sportKey),
  cover: coverOfSportGroup(sportKey),
  leagues: [],
  leagueCount: 0,
  liveCount: 0,
});

export const expandSportGroupQuery = (requested = "") => {
  const key = String(requested).toLowerCase().trim();
  if (!SAFE_GROUP.test(key)) return [];
  if (key.includes("_")) return [key];
  return LEGACY_SPORT_GROUP_ALIASES[key] || [key];
};

export const sportGroupEventFilter = (requested = "") => {
  const groups = expandSportGroupQuery(requested);
  if (!groups.length) return {};

  return {
    $or: [
      { sportGroup: { $in: groups } },
      { sportKey: { $in: groups } },
      ...groups.map((group) => ({ sportKey: { $regex: `^${group}_` } })),
    ],
  };
};

export const fallbackProviderSports = () =>
  SPORTSBOOK_CATALOG.flatMap((sport) => {
    const keys = sport.providerHints?.length
      ? sport.providerHints
      : [sport.sportKey];
    return keys.map((key) => ({
      key,
      title: sport.title,
      group: sport.sportKey,
      active: true,
      has_outrights: false,
    }));
  });

export const sortSportGroups = (groups = []) => {
  const defaultIndex = new Map(
    DEFAULT_SPORT_GROUPS.map((key, index) => [key, index])
  );

  return [...groups].sort((a, b) => {
    const aIndex = defaultIndex.has(a.sportKey)
      ? defaultIndex.get(a.sportKey)
      : DEFAULT_SPORT_GROUPS.length;
    const bIndex = defaultIndex.has(b.sportKey)
      ? defaultIndex.get(b.sportKey)
      : DEFAULT_SPORT_GROUPS.length;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.title.localeCompare(b.title);
  });
};

export const groupSportsByPrefix = (sports = []) => {
  const byPrefix = new Map();

  for (const sport of sports) {
    if (!sport || !sport.key) continue;
    if (sport.has_outrights === true) continue;

    const sportKey = resolveSportGroup(sport.key);
    if (!sportKey) continue;

    const entry = byPrefix.get(sportKey) || {
      sportKey,
      title: titleOfSportGroup(sportKey),
      cover: coverOfSportGroup(sportKey),
      leagues: [],
      liveCount: 0,
    };

    if (!entry.leagues.some((league) => league.key === sport.key)) {
      entry.leagues.push({
        key: sport.key,
        title: sport.title || sport.key,
      });
    }

    byPrefix.set(sportKey, entry);
  }

  return sortSportGroups(
    Array.from(byPrefix.values()).map((entry) => ({
      ...entry,
      leagues: entry.leagues.sort((a, b) => a.title.localeCompare(b.title)),
      leagueCount: entry.leagues.length,
      liveCount: entry.liveCount || 0,
    }))
  );
};

export const mergeEventRowsIntoGroups = (groups, eventRows = []) => {
  const byPrefix = new Map(
    groups.map((group) => [
      group.sportKey,
      { ...group, leagues: [...group.leagues], liveCount: group.liveCount || 0 },
    ])
  );

  for (const row of eventRows) {
    const sportKey = resolveSportGroup(row.sportKey || row.sportGroup);
    if (!sportKey) continue;

    const entry = byPrefix.get(sportKey) || {
      sportKey,
      title: titleOfSportGroup(sportKey),
      cover: coverOfSportGroup(sportKey),
      leagues: [],
      liveCount: 0,
    };

    const leagueKey = row.sportKey || sportKey;
    if (leagueKey && !entry.leagues.some((league) => league.key === leagueKey)) {
      entry.leagues.push({
        key: leagueKey,
        title: row.leagueName || row.sportName || leagueKey,
      });
    }

    entry.liveCount += Number(row.liveCount) || 0;
    byPrefix.set(sportKey, entry);
  }

  return sortSportGroups(
    Array.from(byPrefix.values()).map((entry) => ({
      ...entry,
      leagues: entry.leagues.sort((a, b) => a.title.localeCompare(b.title)),
      leagueCount: entry.leagues.length,
      liveCount: entry.liveCount || 0,
    }))
  );
};

export const buildSportsbookCatalog = ({
  providerSports = [],
  eventRows = [],
} = {}) => {
  const defaults = DEFAULT_SPORT_GROUPS.map((sportKey) =>
    emptySportGroup(sportKey)
  );
  // Provider sports only discover new parent cards. League badges count
  // fixtures we actually have, not every in-season Odds API key.
  const discovered = groupSportsByPrefix(providerSports);
  const byKey = new Map(defaults.map((group) => [group.sportKey, group]));

  for (const group of discovered) {
    if (byKey.has(group.sportKey)) continue;
    byKey.set(group.sportKey, emptySportGroup(group.sportKey));
  }

  const sports = mergeEventRowsIntoGroups(
    Array.from(byKey.values()),
    eventRows
  );

  return {
    sports,
    providers: SPORTSBOOK_PROVIDERS,
  };
};

export const getSportsbookCatalog = () =>
  buildSportsbookCatalog({ providerSports: fallbackProviderSports() });
