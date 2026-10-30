import puppeteer from "puppeteer";

let instance = null;
const getBrowserInstance = async () => {
    if (!instance){
        instance = await puppeteer.launch({
            headless: false,
            args: [
                '--disable-gpu',
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--lang="en-US"',
                '--disable-features=HttpsFirstBalancedModeAutoEnable'
            ]
        });
        console.log("Browser Initiated")
    }    
    return instance;
}

export default getBrowserInstance;