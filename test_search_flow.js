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
  
  console.log("Navigating to sbcountyatc...");
  await page.goto('https://www.sbcountyatc.gov/tax-services/property-tax', { waitUntil: "domcontentloaded" });

  const iframeEl = await page.waitForSelector('iframe#gsg-public-site', { timeout: 30000 });
  const iframe = await iframeEl.contentFrame();

  console.log("Waiting for search input inside iframe...");
  const inputSelector = 'input[id^="typeahead-input-"]';
  await iframe.waitForSelector(inputSelector, { timeout: 30000 });
  console.log("Found search input! Typing account...");

  const account = "0127-152-01";
  await iframe.type(inputSelector, account, { delay: 100 });
  console.log("Typed account:", account);

  // Wait 4 seconds to see what autocomplete dropdown appears
  await new Promise(r => setTimeout(r, 4000));

  const autocompleteItems = await iframe.evaluate(() => {
    const list = Array.from(document.querySelectorAll('.vbt-autcomplete-list a, .vbt-autocomplete-list a, .dropdown-item, .list-group-item, li a'));
    return list.map(a => ({ text: a.innerText, href: a.href, class: a.className }));
  });
  console.log("Autocomplete items found:", autocompleteItems);

  // If none, press Enter
  if (!autocompleteItems.length) {
    console.log("Pressing Enter in search box...");
    await iframe.keyboard.press('Enter');
  } else {
    console.log("Clicking first autocomplete item...");
    await iframe.click('.vbt-autcomplete-list a, .vbt-autocomplete-list a, .dropdown-item');
  }

  // Wait 6 seconds and inspect what changed
  await new Promise(r => setTimeout(r, 6000));

  const postSearch = await iframe.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
      title: f.title,
      src: f.src,
      id: f.id,
      name: f.name
    }));
    const links = Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText, href: a.href })).filter(a => a.text.trim().length > 0).slice(0, 20);
    const bodyText = document.body ? document.body.innerText.substring(0, 500) : '';
    return { iframes, links, bodyText, currentUrl: window.location.href };
  });

  console.log("Post search state inside iframe:");
  console.log("Current URL:", postSearch.currentUrl);
  console.log("Nested Iframes:", postSearch.iframes);
  console.log("Body text preview:", postSearch.bodyText);
  console.log("Sample links:", postSearch.links);

  await browser.close();
})();
