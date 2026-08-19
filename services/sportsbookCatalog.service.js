export const SPORTSBOOK_PROVIDERS = [
  {
    key: "mock",
    title: "Mock Feed",
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
