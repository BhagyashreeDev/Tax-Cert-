import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  page.setDefaultNavigationTimeout(90000);

  const url = 'https://www.sbcountyatc.gov/tax-services/property-tax';
  const account = '0127-152-01'; // or 0127152010000

  console.log("Navigating to:", url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 1. Cookie check
  try {
    const cookieBtn = await page.waitForSelector('button[aria-label="Accept cookies"]', { timeout: 2000 });
    if (cookieBtn) {
      await cookieBtn.click();
      console.log("Clicked cookie banner");
    }
  } catch (e) {
    console.log("No cookie banner found, proceeding...");
  }

  // 2. Wait for iframe#gsg-public-site
  console.log("Waiting for iframe#gsg-public-site...");
  const iframeEl = await page.waitForSelector('iframe#gsg-public-site', { timeout: 60000 });
  const iframe = await iframeEl.contentFrame();
  if (!iframe) throw new Error("Could not access iframe contentFrame");

  // 3. Wait for typeahead input
  console.log("Waiting for search input...");
  const inputSelector = 'input[id^="typeahead-input-"]';
  await iframe.waitForSelector(inputSelector, { timeout: 60000 });

  // Type account
  console.log("Typing account:", account);
  await iframe.type(inputSelector, account, { delay: 50 });

  // Wait for autocomplete item or nested iframe
  console.log("Waiting for autocomplete dropdown...");
  const itemSelector = '.typeahead-list-item, .vbst-item, .list-group-item';
  
  const found = await Promise.race([
    iframe.waitForSelector(itemSelector, { timeout: 15000 }).then(() => 'autocomplete'),
    iframe.waitForSelector('iframe[title="Main Content"]', { timeout: 15000 }).then(() => 'nested_iframe')
  ]).catch(() => null);

  console.log("Found:", found);

  let targetSrc = null;
  if (found === 'autocomplete') {
    console.log("Clicking autocomplete item...");
    await iframe.click(itemSelector);
    // Wait for nested iframe to appear or load
    const nestedIframeEl = await iframe.waitForSelector('iframe[title="Main Content"]', { timeout: 30000 });
    targetSrc = await iframe.evaluate(el => el.src, nestedIframeEl);
  } else if (found === 'nested_iframe') {
    const nestedIframeEl = await iframe.$('iframe[title="Main Content"]');
    targetSrc = await iframe.evaluate(el => el.src, nestedIframeEl);
  } else {
    // Try pressing Enter
    console.log("Pressing Enter...");
    await iframe.keyboard.press('Enter');
    const nestedIframeEl = await iframe.waitForSelector('iframe[title="Main Content"]', { timeout: 30000 });
    targetSrc = await iframe.evaluate(el => el.src, nestedIframeEl);
  }

  console.log("Extracted targetSrc:", targetSrc);
  await browser.close();
})();
