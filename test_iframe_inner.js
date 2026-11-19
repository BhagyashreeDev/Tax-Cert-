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

  console.log("Waiting inside iframe for elements...");
  // Let's poll for 15 seconds to see what appears inside the iframe
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const info = await iframe.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map(inp => ({
        id: inp.id,
        name: inp.name,
        type: inp.type,
        placeholder: inp.placeholder,
        class: inp.className,
        visible: inp.offsetParent !== null
      }));
      const text = document.body ? document.body.innerText.substring(0, 300) : '';
      const iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.title || f.src || f.id);
      return { inputs, text, iframes };
    }).catch(e => ({ error: e.message }));
    
    console.log(`[Second ${i+1}] Frame content:`, JSON.stringify(info));
    if (info.inputs && info.inputs.some(inp => inp.visible && inp.type !== 'hidden')) {
      console.log("Visible input found!");
      break;
    }
  }

  await browser.close();
})();
