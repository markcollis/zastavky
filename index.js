const Apify = require('apify');

// turn off verbose logging
const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

// Apify.main() is a wrapper for the crawler logic
Apify.main(async () => {
  const NUMBER_OF_TABS = 1; // 29 when using for real
  const sources = [];
  for (let n = 1; n < NUMBER_OF_TABS + 1; n += 1) {
    const url = `https://pid.cz/zastavky-pid/zastavky-v-praze/?tab=${n.toString()}`;
    sources.push({ url });
  }
  const requestList = new Apify.RequestList({
    sources,
  });
  await requestList.initialize();

  // create new crawler
  const crawler = new Apify.CheerioCrawler({
    requestList,
    minConcurrency: 3,
    maxConcurrency: 10,
    maxRequestRetries: 1,
    maxRequestsPerCrawl: 3, // for testing
    handlePageTimeoutSecs: 60,
    handlePageFunction: async ({ request, body, $ }) => { // called for each URL
      // called with { request instance, raw HTML, object parsed by Cheerio }
      console.log(`Processing ${request.url}...`);
      const stopsList = $('.stops-table').find('th>a').map((i, el) => {
        const name = $(el).text();
        const url = $(el).attr('href');
        return { name, url };
      }).get();
      console.log('stopsList:', stopsList);
      // store results (to ./apify_storage/datasets/default as JSON)
      await Apify.pushData({
        url: request.url,
        body,
      });
    },
    handleRequestFailedFunction: async ({ request }) => {
      console.log(`Requesting ${request.url} failed twice.`);
    },
  });

  await crawler.run(); // start crawling
  console.log('Crawler finished.');
});
