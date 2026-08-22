const snapshot = (now, outcomes, region = "in") => [
  {
    bookmakerKey: "mockbook",
    bookmakerTitle: "Mockbook",
    region,
    capturedAt: new Date(now).toISOString(),
    outcomes,
  },
];

const h2hMarket = (now, selections) => ({
  providerMarketKey: "h2h",
  marketType: "h2h",
  title: "Match Winner",
  selections: selections.map(({ key, name }) => ({ key, name })),
  snapshots: snapshot(
    now,
    selections.map(({ key, name, priceDecimal }) => ({
      key,
      name,
      priceDecimal,
    }))
  ),
});

const totalsMarket = (now, line, over, under, title = "Total runs") => ({
  providerMarketKey: "totals",
  marketType: "totals",
  title,
  selections: [
    { key: `over_${line}`, name: "Over", line },
    { key: `under_${line}`, name: "Under", line },
  ],
  snapshots: snapshot(now, [
    { key: `over_${line}`, name: "Over", line, priceDecimal: over },
    { key: `under_${line}`, name: "Under", line, priceDecimal: under },
  ]),
});

const otherMarket = (now, { key, title, selections }) => ({
  providerMarketKey: key,
  marketType: "other",
  title,
  selections: selections.map(({ key: selectionKey, name }) => ({
    key: selectionKey,
    name,
  })),
  snapshots: snapshot(
    now,
    selections.map(({ key: selectionKey, name, priceDecimal }) => ({
      key: selectionKey,
      name,
      priceDecimal,
    }))
  ),
});

export const fetchLiveCricketDemoFeed = async ({ includeMarkets = true } = {}) => {
  const now = Date.now();

  const items = [
    {
      provider: "mock",
      providerEventId: "live-cricket-ban-aus-test",
      sportKey: "cricket_test_match",
      sportName: "Cricket",
      leagueName: "2nd Test",
      status: "live",
      startTime: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      competitors: [
        { name: "Bangladesh", shortName: "BAN", role: "home" },
        { name: "Australia", shortName: "AUS", role: "away" },
      ],
      scoreboard: {
        title: "2nd Test",
        venue: "Great Barrier Reef Arena, Mackay",
        home: 64,
        homeWickets: 10,
        homeOvers: 34.0,
        away: 151,
        awayWickets: 8,
        awayOvers: 33.3,
        batting: "away",
        day: 1,
        innings: 2,
        note: "Day 1: Stumps - Australia lead by 101 runs",
        stumps: true,
      },
      markets: [
        h2hMarket(now, [
          { key: "bangladesh", name: "Bangladesh", priceDecimal: 7.5 },
          { key: "draw", name: "Draw", priceDecimal: 3.0 },
          { key: "australia", name: "Australia", priceDecimal: 1.65 },
        ]),
        totalsMarket(now, 389.5, 1.87, 1.93, "1st innings runs"),
        otherMarket(now, {
          key: "top_batter",
          title: "Top Bangladesh batter",
          selections: [
            { key: "shanto", name: "Najmul Hossain Shanto", priceDecimal: 3.4 },
            { key: "mushfiqur", name: "Mushfiqur Rahim", priceDecimal: 4.1 },
            { key: "litton", name: "Litton Das", priceDecimal: 5.0 },
          ],
        }),
      ],
    },
    {
      provider: "mock",
      providerEventId: "live-cricket-top-end-t20-hyk-vic",
      sportKey: "cricket_t20",
      sportName: "Cricket",
      leagueName: "Top End T20 2026",
      status: "live",
      startTime: new Date(now - 75 * 60 * 1000).toISOString(),
      competitors: [
        { name: "HYK", shortName: "HYK", role: "home" },
        { name: "Victoria", shortName: "VIC", role: "away" },
      ],
      scoreboard: {
        title: "Top End T20 2026",
        venue: "Marrara Oval, Darwin",
        home: 128,
        homeWickets: 6,
        homeOvers: 20.0,
        away: 64,
        awayWickets: 2,
        awayOvers: 9.4,
        batting: "away",
        innings: 2,
        note: "VIC need 65 more runs",
      },
      markets: [
        h2hMarket(now, [
          { key: "hyk", name: "HYK", priceDecimal: 1.72 },
          { key: "victoria", name: "Victoria", priceDecimal: 2.15 },
        ]),
        totalsMarket(now, 312.5, 1.9, 1.9, "Match runs"),
        otherMarket(now, {
          key: "top_batter",
          title: "Top HYK batter",
          selections: [
            { key: "hyk_opener", name: "HYK opener", priceDecimal: 3.1 },
            { key: "hyk_middle", name: "HYK middle order", priceDecimal: 4.4 },
          ],
        }),
      ],
    },
  ];

  if (includeMarkets) return items;
  return items.map((item) => ({ ...item, markets: [] }));
};

export const fetchUpcomingCricketDemoFeed = async () => {
  const now = Date.now();

  return [
    {
      provider: "mock",
      providerEventId: "upcoming-cricket-ban-aus-3rd-test",
      sportKey: "cricket_test_match",
      sportName: "Cricket",
      leagueName: "3rd Test",
      status: "upcoming",
      startTime: new Date(now + 26 * 60 * 60 * 1000).toISOString(),
      competitors: [
        { name: "Bangladesh", shortName: "BAN", role: "home" },
        { name: "Australia", shortName: "AUS", role: "away" },
      ],
      scoreboard: {
        title: "3rd Test",
        venue: "Zahur Ahmed Chowdhury Stadium, Chattogram",
      },
      markets: [
        h2hMarket(now, [
          { key: "bangladesh", name: "Bangladesh", priceDecimal: 6.0 },
          { key: "draw", name: "Draw", priceDecimal: 3.4 },
          { key: "australia", name: "Australia", priceDecimal: 1.55 },
        ]),
        totalsMarket(now, 412.5, 1.88, 1.92, "1st innings runs"),
        otherMarket(now, {
          key: "top_batter",
          title: "Top Australia batter",
          selections: [
            { key: "smith", name: "Steve Smith", priceDecimal: 3.8 },
            { key: "head", name: "Travis Head", priceDecimal: 4.2 },
            { key: "labuschagne", name: "Marnus Labuschagne", priceDecimal: 4.6 },
          ],
        }),
      ],
    },
    {
      provider: "mock",
      providerEventId: "upcoming-cricket-top-end-t20-nsw-vic",
      sportKey: "cricket_t20",
      sportName: "Cricket",
      leagueName: "Top End T20 2026",
      status: "upcoming",
      startTime: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
      competitors: [
        { name: "New South Wales", shortName: "NSW", role: "home" },
        { name: "Victoria", shortName: "VIC", role: "away" },
      ],
      scoreboard: {
        title: "Top End T20 2026",
        venue: "Marrara Oval, Darwin",
      },
      markets: [
        h2hMarket(now, [
          { key: "nsw", name: "New South Wales", priceDecimal: 1.84 },
          { key: "victoria", name: "Victoria", priceDecimal: 1.98 },
        ]),
        totalsMarket(now, 318.5, 1.91, 1.89, "Match runs"),
        otherMarket(now, {
          key: "top_batter",
          title: "Top NSW batter",
          selections: [
            { key: "nsw_opener", name: "NSW opener", priceDecimal: 3.2 },
            { key: "nsw_middle", name: "NSW middle order", priceDecimal: 4.0 },
          ],
        }),
      ],
    },
    {
      provider: "mock",
      providerEventId: "upcoming-cricket-ipl-mi-csk",
      sportKey: "cricket_ipl",
      sportName: "Cricket",
      leagueName: "Indian Premier League",
      status: "upcoming",
      startTime: new Date(now + 20 * 60 * 60 * 1000).toISOString(),
      competitors: [
        { name: "Mumbai Indians", shortName: "MI", role: "home" },
        { name: "Chennai Super Kings", shortName: "CSK", role: "away" },
      ],
      scoreboard: {
        title: "IPL",
        venue: "Wankhede Stadium, Mumbai",
      },
      markets: [
        h2hMarket(now, [
          { key: "mumbai_indians", name: "Mumbai Indians", priceDecimal: 1.9 },
          { key: "chennai_super_kings", name: "Chennai Super Kings", priceDecimal: 1.95 },
        ]),
        totalsMarket(now, 179.5, 1.91, 1.91, "Match runs"),
        otherMarket(now, {
          key: "top_batter",
          title: "Top Mumbai batter",
          selections: [
            { key: "rohit", name: "Rohit Sharma", priceDecimal: 4.5 },
            { key: "sky", name: "Suryakumar Yadav", priceDecimal: 3.9 },
          ],
        }),
      ],
    },
  ];
};

export const fetchCricketDemoFeed = async () => [
  ...(await fetchLiveCricketDemoFeed()),
  ...(await fetchUpcomingCricketDemoFeed()),
];

export const fetchMockSportsbookFeed = async () => {
  const now = Date.now();
  const liveCricket = await fetchLiveCricketDemoFeed();

  return [
    ...liveCricket,
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
