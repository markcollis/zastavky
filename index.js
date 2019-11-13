const Apify = require('apify');

// turn off verbose logging
const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

// Apify.main() is a wrapper for the crawler logic
Apify.main(async () => {
  const NUMBER_OF_TABS = 3; // 29 when using for real
  const sources = [];
  for (let n = 1; n < NUMBER_OF_TABS + 1; n += 1) {
    const url = `https://pid.cz/zastavky-pid/zastavky-v-praze/?tab=${n.toString()}`;
    sources.push({ url });
  }
  console.log('Sources:', sources);
  // const requestList = new Apify.RequestList({
  //   sources,
  // });
  // await requestList.initialize();
  const requestQueue = await Apify.openRequestQueue();
  sources.forEach(async source => requestQueue.addRequest(source));
  const info = await requestQueue.getInfo();
  console.log('rQ info before crawl', info);

  let stops = [];

  // create new crawler
  const crawler = new Apify.PuppeteerCrawler({
    // requestList,
    requestQueue,
    launchPuppeteerOptions: { slowMo: 500 },
    // minConcurrency: 3,
    // maxConcurrency: 10,
    maxRequestRetries: 1,
    maxRequestsPerCrawl: 30, // for testing
    // handlePageTimeoutSecs: 60,
    handlePageFunction: async ({ request, page }) => { // called for each URL
      console.log(`Processing ${request.url}...`);

      const pageFunction = ($stopsTables) => {
        // console.log('$stopsTables', $stopsTables);
        const data = [];
        // $stopsTables.forEach(($stopsTable) => {
        const lastIndex = $stopsTables.length - 1;
        const links = $stopsTables[lastIndex].querySelectorAll('th > a');
        links.forEach((link) => {
          data.push({
            name: link.innerText,
            url: link.href,
          });
          // });
        });
        return data;
      };
      const data = await page.$$eval('.stops-table', pageFunction);
      // console.log('data', data);
      stops = [...stops, ...data];
      // await Apify.pushData(data);

      // const stopsList = $('.stops-table').find('th>a').map((i, el) => {
      //   const name = $(el).text();
      //   const url = $(el).attr('href');
      //   return { name, url };
      // }).get();
      // console.log('stopsList:', stopsList);
      // // store results (to ./apify_storage/datasets/default as JSON)
      // await Apify.pushData({
      //   url: request.url,
      //   body,
      // });
    },
    handleRequestFailedFunction: async ({ request }) => {
      console.log(`Requesting ${request.url} failed twice.`);
    },
  });
  console.log('Crawler started.');
  await crawler.run(); // start crawling
  const info2 = await requestQueue.getInfo();
  console.log('stops', stops);
  console.log('rQ info after crawl', info2);
  console.log('Crawler finished.');
});
