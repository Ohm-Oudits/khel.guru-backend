import assert from "node:assert/strict";

import {
  DEFAULT_SPORT_GROUPS,
  buildSportsbookCatalog,
  coverOfSportGroup,
  expandSportGroupQuery,
  groupSportsByPrefix,
  resolveSportGroup,
  sportPrefixOf,
  titleOfSportGroup,
} from "../services/sportsbookCatalog.service.js";
import {
  dedupeSportsEvents,
  eventPairKey,
  normalizeEventStatusQuery,
  sportsEventListFilter,
} from "../services/sportsbookEvents.service.js";
import {
  isAllSportsToken,
  matchCatalogHintKeys,
  parseSportKeyList,
} from "../services/sportsbookSportKeys.js";

assert.equal(sportPrefixOf("soccer_epl"), "soccer");
assert.equal(resolveSportGroup("soccer_epl"), "football");
assert.equal(resolveSportGroup("american-football"), "americanfootball");
assert.equal(resolveSportGroup("mixed-martial-arts"), "mma");
assert.equal(resolveSportGroup("basketball_nba"), "basketball");
assert.equal(resolveSportGroup("americanfootball_nfl"), "americanfootball");
assert.equal(resolveSportGroup("icehockey_nhl"), "icehockey");
assert.equal(resolveSportGroup("mma_mixed_martial_arts"), "mma");
assert.equal(resolveSportGroup("rugbyleague_nrl"), "rugby");
assert.equal(resolveSportGroup("rugbyunion_six_nations"), "rugby");
assert.equal(resolveSportGroup("cricket"), "cricket");
assert.equal(titleOfSportGroup("americanfootball"), "American Football");
assert.equal(coverOfSportGroup("soccer"), "/sports/football.png");
assert.equal(coverOfSportGroup("esports"), "/sports/esports.png");
assert.equal(coverOfSportGroup("motorsport"), "/sports/default.png");
assert.deepEqual(expandSportGroupQuery("football"), ["football", "soccer"]);
assert.deepEqual(expandSportGroupQuery("soccer"), ["soccer", "football"]);
assert.deepEqual(expandSportGroupQuery("soccer_epl"), ["soccer_epl"]);
assert.equal(
  eventPairKey({
    sportGroup: "cricket",
    competitors: [
      { name: "Australia", shortName: "AUS" },
      { name: "Bangladesh", shortName: "BAN" },
    ],
  }),
  eventPairKey({
    sportGroup: "cricket",
    competitors: [
      { name: "Bangladesh" },
      { name: "Australia" },
    ],
  })
);
assert.equal(
  dedupeSportsEvents([
    {
      _id: "odds",
      provider: "the-odds-api",
      sportGroup: "cricket",
      status: "live",
      competitors: [{ name: "Australia" }, { name: "Bangladesh" }],
      markets: [],
    },
    {
      _id: "house",
      provider: "mock",
      sportGroup: "cricket",
      status: "live",
      scoreboard: { home: 64, away: 132 },
      competitors: [{ shortName: "BAN" }, { shortName: "AUS" }],
      markets: [{}, {}],
    },
  ]).length,
  1
);

const grouped = groupSportsByPrefix([
  { key: "soccer_epl", title: "EPL", active: true },
  { key: "soccer_spain_la_liga", title: "La Liga", active: true },
  { key: "basketball_nba", title: "NBA", active: true },
  { key: "politics_us_pres", title: "US Election", active: true, has_outrights: true },
]);
assert.deepEqual(
  grouped.map((sport) => sport.sportKey),
  ["football", "basketball"]
);
assert.equal(grouped.find((sport) => sport.sportKey === "football").leagueCount, 2);

const catalog = buildSportsbookCatalog({
  providerSports: [
    { key: "soccer_epl", title: "EPL", active: true },
    { key: "soccer_uefa_champs_league", title: "UCL", active: true },
    { key: "motorsport_f1", title: "F1", active: true },
  ],
});
assert.ok(catalog.sports.length >= DEFAULT_SPORT_GROUPS.length);
assert.deepEqual(
  catalog.sports.slice(0, DEFAULT_SPORT_GROUPS.length).map((sport) => sport.sportKey),
  DEFAULT_SPORT_GROUPS
);
const football = catalog.sports.find((sport) => sport.sportKey === "football");
assert.equal(football.leagues.length, 0);
assert.equal(football.leagueCount, 0);
assert.equal(football.liveCount, 0);
assert.equal(football.cover, "/sports/football.png");
const catalogWithEvents = buildSportsbookCatalog({
  providerSports: [
    { key: "soccer_epl", title: "EPL", active: true },
    { key: "soccer_uefa_champs_league", title: "UCL", active: true },
    { key: "soccer_italy_serie_a", title: "Serie A", active: true },
  ],
  eventRows: [
    { sportGroup: "soccer", sportKey: "soccer_epl", leagueName: "EPL", liveCount: 2 },
    { sportGroup: "soccer", sportKey: "soccer_spain_la_liga", leagueName: "La Liga", liveCount: 1 },
    { sportGroup: "cricket", sportKey: "cricket_test_match", leagueName: "2nd Test", liveCount: 1 },
  ],
});
assert.equal(
  catalogWithEvents.sports.find((sport) => sport.sportKey === "football")
    .leagueCount,
  2
);
assert.equal(
  catalogWithEvents.sports.find((sport) => sport.sportKey === "football")
    .liveCount,
  3
);
assert.equal(
  catalogWithEvents.sports.find((sport) => sport.sportKey === "cricket")
    .liveCount,
  1
);
assert.equal(normalizeEventStatusQuery("completed"), "settled");
assert.equal(
  sportsEventListFilter({ status: "completed", sameDay: true }).$and[0].status,
  "settled"
);
assert.deepEqual(
  sportsEventListFilter({ status: "upcoming" }).$and.find(
    (clause) => clause.provider
  ),
  { provider: { $nin: ["mock", "simulated"] } }
);
assert.equal(
  sportsEventListFilter({ status: "upcoming", provider: "mock" }).$and.find(
    (clause) => clause.provider
  )?.provider,
  "mock"
);
const previousIoOnly = process.env.SPORTSBOOK_IO_ONLY;
const previousDefaultProvider = process.env.SPORTSBOOK_DEFAULT_PROVIDER;
process.env.SPORTSBOOK_IO_ONLY = "true";
delete process.env.SPORTSBOOK_DEFAULT_PROVIDER;
assert.equal(
  sportsEventListFilter({ status: "live" }).$and.find((clause) => clause.provider)
    ?.provider,
  "odds-api-io"
);
assert.equal(
  sportsEventListFilter({ status: "live", provider: "mock" }).$and.find(
    (clause) => clause.provider
  )?.provider,
  "mock"
);
if (previousIoOnly === undefined) delete process.env.SPORTSBOOK_IO_ONLY;
else process.env.SPORTSBOOK_IO_ONLY = previousIoOnly;
if (previousDefaultProvider === undefined) {
  delete process.env.SPORTSBOOK_DEFAULT_PROVIDER;
} else {
  process.env.SPORTSBOOK_DEFAULT_PROVIDER = previousDefaultProvider;
}
const golf = catalog.sports.find((sport) => sport.sportKey === "golf");
assert.equal(golf.leagueCount, 0);
const motorsport = catalog.sports.find((sport) => sport.sportKey === "motorsport");
assert.equal(motorsport.title, "Motorsport");
assert.equal(motorsport.cover, "/sports/default.png");

assert.deepEqual(parseSportKeyList("all"), ["all"]);
assert.deepEqual(parseSportKeyList("soccer_epl, cricket_ipl"), [
  "soccer_epl",
  "cricket_ipl",
]);
assert.equal(isAllSportsToken("all"), true);
assert.equal(isAllSportsToken("soccer_epl"), false);
assert.deepEqual(
  matchCatalogHintKeys(
    ["soccer_epl", "soccer_uefa_champs_league", "soccer_spain_la_liga"],
    [
      "soccer_epl",
      "soccer_italy_serie_a",
      "soccer_spain_la_liga",
      "basketball_nba",
    ]
  ),
  ["soccer_epl", "soccer_spain_la_liga"]
);
assert.deepEqual(
  matchCatalogHintKeys(
    ["tennis_atp", "tennis_wta"],
    [
      "tennis_atp_aus_open_singles",
      "tennis_atp_wimbledon_singles",
      "tennis_atp_us_open_singles",
      "tennis_wta_aus_open_singles",
    ]
  ),
  [
    "tennis_atp_aus_open_singles",
    "tennis_atp_wimbledon_singles",
    "tennis_wta_aus_open_singles",
  ]
);

console.log("Sportsbook sport key helpers passed");
