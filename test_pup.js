import puppeteer from 'puppeteer';

(async () => {
  console.log("Launching browser...");
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
  
  // Listen to console and errors
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('requestfailed', req => {
    if (req.url().includes('gsg') || req.url().includes('property-tax')) {
      console.log('REQ FAILED:', req.url(), req.failure()?.errorText);
    }
  });

  console.log("Navigating to https://www.sbcountyatc.gov/tax-services/property-tax...");
  await page.goto('https://www.sbcountyatc.gov/tax-services/property-tax', { waitUntil: "domcontentloaded" });
  console.log("Page loaded (domcontentloaded)");

  console.log("Waiting for iframe#gsg-public-site...");
  try {
    const el = await page.waitForSelector('iframe#gsg-public-site', { timeout: 30000 });
    console.log("Found iframe#gsg-public-site!", el ? "OK" : "Null");
    const src = await page.evaluate(() => document.querySelector('iframe#gsg-public-site')?.src);
    console.log("Iframe src:", src);

    // Let's check frames
    const frame = await el.contentFrame();
    console.log("Content frame accessed:", !!frame);
    if (frame) {
      console.log("Frame URL:", frame.url());
      await new Promise(r => setTimeout(r, 4000));
      console.log("Frame title / content preview:", await frame.title());
      const inputs = await frame.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(i => ({ id: i.id, name: i.name, placeholder: i.placeholder, class: i.className }));
      });
      console.log("Inputs in iframe:", inputs);
    }
  } catch (e) {
    console.error("FAILED to find iframe#gsg-public-site:", e.message);
  } finally {
    await browser.close();
  }
})();
