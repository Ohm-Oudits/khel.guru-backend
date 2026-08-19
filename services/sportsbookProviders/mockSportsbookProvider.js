export const fetchMockSportsbookFeed = async () => {
  const now = Date.now();

  return [
  {
    provider: "mock",
    providerEventId: "mock-cricket-001",
    sportKey: "cricket",
    sportName: "Cricket",
    leagueName: "Indian Premier League",
    status: "upcoming",
    startTime: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    competitors: [
      { name: "Mumbai Indians", role: "home" },
      { name: "Chennai Super Kings", role: "away" },
    ],
    markets: [
      {
        providerMarketKey: "h2h",
        marketType: "h2h",
        title: "Match Winner",
        selections: [
          { key: "mumbai_indians", name: "Mumbai Indians" },
          { key: "chennai_super_kings", name: "Chennai Super Kings" },
        ],
        snapshots: [
          {
            bookmakerKey: "mockbook",
            bookmakerTitle: "Mockbook",
            region: "in",
            capturedAt: new Date(now).toISOString(),
            outcomes: [
              { key: "mumbai_indians", name: "Mumbai Indians", priceDecimal: 1.8 },
              {
                key: "chennai_super_kings",
                name: "Chennai Super Kings",
                priceDecimal: 2.02,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    provider: "mock",
    providerEventId: "mock-football-001",
    sportKey: "football",
    sportName: "Football",
    leagueName: "Premier League",
    status: "live",
    startTime: new Date(now - 20 * 60 * 1000).toISOString(),
    competitors: [
      { name: "Arsenal", role: "home" },
      { name: "Liverpool", role: "away" },
    ],
    scoreboard: {
      home: 1,
      away: 0,
      minute: 22,
    },
    markets: [
      {
        providerMarketKey: "h2h",
        marketType: "h2h",
        title: "Match Winner",
        selections: [
          { key: "arsenal", name: "Arsenal" },
          { key: "draw", name: "Draw" },
          { key: "liverpool", name: "Liverpool" },
        ],
        snapshots: [
          {
            bookmakerKey: "mockbook",
            bookmakerTitle: "Mockbook",
            region: "uk",
            capturedAt: new Date(now).toISOString(),
            outcomes: [
              { key: "arsenal", name: "Arsenal", priceDecimal: 1.96 },
              { key: "draw", name: "Draw", priceDecimal: 3.45 },
              { key: "liverpool", name: "Liverpool", priceDecimal: 3.7 },
            ],
          },
        ],
      },
    ],
  },
  ];
};
