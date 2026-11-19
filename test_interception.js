import puppeteer from 'puppeteer';

(async () => {
  console.log("Launching browser with request interception...");
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--disable-gpu',
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--lang="en-US"',
      '--disable-features=HttpsFirstBalancedModeAutoEnable'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.resourceType() === 'image') {
      req.abort();
    } else {
      req.continue();
    }
  });

  console.log("Navigating to https://www.sbcountyatc.gov/tax-services/property-tax...");
  await page.goto('https://www.sbcountyatc.gov/tax-services/property-tax', { waitUntil: "domcontentloaded" });
  console.log("Page loaded (domcontentloaded)");

  console.log("Waiting for iframe#gsg-public-site (timeout 30s)...");
  try {
    const el = await page.waitForSelector('iframe#gsg-public-site', { timeout: 30000 });
    console.log("Found iframe#gsg-public-site!", el ? "OK" : "Null");
  } catch (e) {
    console.error("FAILED to find iframe#gsg-public-site with interception:", e.message);
  } finally {
    await browser.close();
  }
})();
