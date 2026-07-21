export const wikidataFixture = {
  head: { vars: ['item', 'itemLabel'] },
  results: {
    bindings: [
      {
        item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q100001' },
        itemLabel: { type: 'literal', value: 'Fixture Ada Rhythm' },
        itemDescription: { type: 'literal', value: 'fictional fixture musician' },
        aliases: { type: 'literal', value: 'Ada Rhythm|A. Rhythm' },
        occupations: { type: 'literal', value: 'Q177220' },
        countries: { type: 'literal', value: 'US' },
        officialWebsite: { type: 'uri', value: 'https://ada-rhythm.example/' },
        musicBrainzId: { type: 'literal', value: 'fixture-mbid-ada' },
        youtubeId: { type: 'literal', value: 'UCFIXTUREADA' },
        instagramHandle: { type: 'literal', value: 'fixtureadarhythm' },
      },
      {
        item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q100002' },
        itemLabel: { type: 'literal', value: 'Fixture Bayo Frames' },
        occupations: { type: 'literal', value: 'Q639669' },
        countries: { type: 'literal', value: 'NG' },
        twitchHandle: { type: 'literal', value: 'fixturebayoframes' },
      },
    ],
  },
} as const;

export function createWikidataFixtureFetch(fixture: unknown = wikidataFixture): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/sparql-results+json' },
      }),
    );
}
