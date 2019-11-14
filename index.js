const Apify = require('apify');

// turn off verbose logging
const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);
/* eslint no-console: 0 */

// Apify.main() is a wrapper for the crawler logic
Apify.main(async () => {
  const NUMBER_OF_TABS = 3; // 29 when using for real
  const sources = [];
  for (let n = 1; n < NUMBER_OF_TABS + 1; n += 1) {
    const url = `https://pid.cz/zastavky-pid/zastavky-v-praze/?tab=${n.toString()}`;
    sources.push({ url });
  }
  console.log('Sources to check:', sources);
  const requestQueue = await Apify.openRequestQueue();
  sources.forEach(async source => requestQueue.addRequest(source));
  const info = await requestQueue.getInfo();
  console.log('requestQueue info before crawl:', info);
  let stopsFound = []; // array to capture new stops found in this crawl

  // create new crawler
  const crawler = new Apify.PuppeteerCrawler({
    requestQueue,
    launchPuppeteerOptions: { slowMo: 500 }, // needs to be slowed down
    // otherwise initial list of stops starting with A will always be returned...
    maxRequestRetries: 1,
    maxRequestsPerCrawl: 150, // limited for testing
    handlePageFunction: async ({ request, page }) => { // called for each URL
      const isListOfStops = request.url.includes('zastavky-pid');
      const isStopDetails = request.url.includes('zastavkova-tabla');
      if (!isListOfStops && !isStopDetails) {
        console.log(`${request.url} is not a valid stop information page. Ignoring.`);
      } else if (isListOfStops) {
        // add stop details page to crawl, add name/url to stop array for logging
        console.log(`Processing ${request.url}... (list of stops)`);
        const pageFunction = ($stopsTables) => {
          console.log('$stopsTables:', $stopsTables);
          const data = [];
          const lastIndex = $stopsTables.length - 1; // last element is the correct one
          const links = $stopsTables[lastIndex].querySelectorAll('th > a');
          links.forEach((link) => {
            data.push({
              name: link.innerText,
              url: link.href,
            });
          });
          return data;
        };
        const data = await page.$$eval('.stops-table', pageFunction);
        data.forEach(async (stop) => {
          await requestQueue.addRequest(stop);
        });
        // console.log('data', data);
        stopsFound = [...stopsFound, ...data];
        // await Apify.pushData(data);
      } else {
        console.log(`Processing ${request.url}... (stop details)`);
        const pageFunction = ($tabContents) => {
          const $tabContent = $tabContents[0]; // only expect one match
          // Tab 1 contains live departure data
          //  => for now, just use it to capture the stop name
          const $tab1 = $tabContent.querySelector('#tab1');
          const name = $tab1.getAttribute('data-stop');

          // Tab 2 contains links to PDF timetables for all routes from the stop
          //   => capture the route numbers (plus validity that shows when
          //      temporary changes alter which routes stop here)
          const $tab2 = $tabContent.querySelector('#tab2');
          const validity = [...$tab2.querySelectorAll('h3')].map(h3 => h3.innerText.trim());
          const $routeTables = [...$tab2.querySelectorAll('.stops-table')];
          const $routeAnchors = $routeTables.map(table => [...table.querySelectorAll('.open-linedetail')]);
          const routes = $routeAnchors
            .map(list => list
              .map((anchor => anchor.firstChild.innerText)));
          const amended = $routeAnchors
            .map(list => list
              .map((anchor => anchor.childElementCount > 1)));
          const timetables = $routeTables.map((table) => {
            const $anchors = [...table.querySelectorAll('a.no-pipe')];
            const $spans = [...table.querySelectorAll('span.mail')].filter(el => el.getAttribute('data-stop'));
            const timetableData = [];
            for (let i = 0; i < $anchors.length; i += 1) {
              timetableData.push({
                destination: $anchors[i].innerText,
                url: $anchors[i].href,
                route: $spans[i].getAttribute('data-line'),
                stand: $spans[i].getAttribute('data-stop'),
              });
            }
            return timetableData;
          });

          const routeDetails = [];
          for (let i = 0; i < validity.length; i += 1) {
            routeDetails.push({
              validity: validity[i],
              routes: routes[i],
              amended: amended[i],
              timetables: timetables[i],
            });
          }
          // Tab 3 is a map showing the location of each stand/platform
          //   => capture the lat/long coordinates of each
          const $tab3 = $tabContent.querySelector('#tab3');
          const $stopsForMap = $tab3.querySelector('#stops-for-map').getAttribute('value');
          const stopLocations = JSON.parse($stopsForMap).map(stop => ({
            stand: stop.sta,
            lat: parseFloat(stop.lat),
            lng: parseFloat(stop.lng),
          }));
          // calculate the mean position of stands as a single location to represent the stop
          const stopCentre = stopLocations.reduce((acc, el) => {
            if (!acc.count) {
              return {
                lat: el.lat,
                lng: el.lng,
                count: 1,
              };
            }
            const newCount = acc.count + 1;
            return {
              lat: ((acc.lat * acc.count) + el.lat) / newCount,
              lng: ((acc.lng * acc.count) + el.lng) / newCount,
              count: newCount,
            };
          }, {});
          // collate stop data to return
          const stopData = {
            name,
            stopLocations,
            stopCentre,
            routeDetails,
          };
          return stopData;
        };
        const data = await page.$$eval('.tabContent', pageFunction);
        // console.log('stop data:', data);
        await Apify.pushData(data);
      }
    },
    handleRequestFailedFunction: async ({ request }) => {
      console.log(`Requesting ${request.url} failed twice.`);
    },
  });
  console.log('Crawler started.');
  await crawler.run(); // start crawling
  const info2 = await requestQueue.getInfo();
  console.log('new stops found:', stopsFound.map(stop => stop.name).join(', '));
  console.log('requestQueue info after crawl:', info2);
  console.log('Crawler finished.');
});
