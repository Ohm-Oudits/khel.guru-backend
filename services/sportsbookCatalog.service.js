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
    key: "the-odds-api",
    title: "The Odds API",
    type: "odds",
    sports: ["cricket", "soccer", "tennis", "basketball", "baseball"],
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

export const SPORTSBOOK_CATALOG = [
  {
    sportKey: "cricket",
    title: "Cricket",
    launchPriority: 1,
    categories: ["popular", "india-first", "live", "upcoming"],
    providerHints: ["cricket_test_match", "cricket_odi", "cricket_t20", "cricket_ipl"],
  },
  {
    sportKey: "football",
    title: "Football",
    launchPriority: 2,
    categories: ["popular", "live", "upcoming"],
    providerHints: ["soccer_epl", "soccer_uefa_champs_league", "soccer_spain_la_liga"],
  },
  {
    sportKey: "tennis",
    title: "Tennis",
    launchPriority: 3,
    categories: ["popular", "live", "upcoming"],
    providerHints: ["tennis_atp", "tennis_wta"],
  },
  {
    sportKey: "badminton",
    title: "Badminton",
    launchPriority: 4,
    categories: ["mobile-first", "upcoming"],
    providerHints: ["badminton_bwf"],
  },
];

export const getSportsbookCatalog = () => ({
  sports: SPORTSBOOK_CATALOG,
  providers: SPORTSBOOK_PROVIDERS,
});

const SPORT_GROUP_PREFIX_RULES = [
  ["cricket_", "cricket"],
  ["soccer_", "football"],
  ["tennis_", "tennis"],
  ["badminton_", "badminton"],
];

export const resolveSportGroup = (providerSportKey = "") => {
  const key = String(providerSportKey).toLowerCase().trim();

  if (SPORTSBOOK_CATALOG.some((sport) => sport.sportKey === key)) {
    return key;
  }

  for (const [prefix, group] of SPORT_GROUP_PREFIX_RULES) {
    if (key.startsWith(prefix)) {
      return group;
    }
  }

  return key;
};
