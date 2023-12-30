const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const OpenAI = require('openai');
const readline = require('readline');
const fs = require('fs');
require('dotenv/config');

puppeteer.use(StealthPlugin());

const openai = new OpenAI();
const timeout = 5000;

async function downloadContent(url, destination) {
    const viewSource = await page.goto(url);
    fs.writeFileSync(destination, await viewSource.buffer());
    console.log(`Content downloaded successfully to ${destination}`);
}


async function image_to_base64(image_file) {
    return await new Promise((resolve, reject) => {
        fs.readFile(image_file, (err, data) => {
            if (err) {
                console.error('Error reading the file:', err);
                reject();
                return;
            }

            const base64Data = data.toString('base64');
            const dataURI = `data:image/jpeg;base64,${base64Data}`;
            resolve(dataURI);
        });
    });
}


async function input( text ) {
    let the_prompt;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await (async () => {
        return new Promise( resolve => {
            rl.question( text, (prompt) => {
                the_prompt = prompt;
                rl.close();
                resolve();
            } );
        } );
    })();

    return the_prompt;
}

async function sleep( milliseconds ) {
    return await new Promise((r, _) => {
        setTimeout( () => {
            r();
        }, milliseconds );
    });
}

async function highlight_links( page ) {
    await page.evaluate(() => {
        document.querySelectorAll('[gpt-link-text]').forEach(e => {
            e.removeAttribute("gpt-link-text");
        });
    });

    const elements = await page.$$(
        "a, button, input, textarea, [role=button], [role=treeitem]"
    );

    elements.forEach( async e => {
        await page.evaluate(e => {
            function isElementVisible(el) {
                if (!el) return false; // Element does not exist

                function isStyleVisible(el) {
                    const style = window.getComputedStyle(el);
                    return style.width !== '0' &&
                           style.height !== '0' &&
                           style.opacity !== '0' &&
                           style.display !== 'none' &&
                           style.visibility !== 'hidden';
                }

                function isElementInViewport(el) {
                    const rect = el.getBoundingClientRect();
                    return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                    );
                }

                // Check if the element is visible style-wise
                if (!isStyleVisible(el)) {
                    return false;
                }

                // Traverse up the DOM and check if any ancestor element is hidden
                let parent = el;
                while (parent) {
                    if (!isStyleVisible(parent)) {
                    return false;
                    }
                    parent = parent.parentElement;
                }

                // Finally, check if the element is within the viewport
                return isElementInViewport(el);
            }

            e.style.border = "1px solid red";

            const position = e.getBoundingClientRect();

            if( position.width > 5 && position.height > 5 && isElementVisible(e) ) {
                const link_text = e.textContent.replace(/[^a-zA-Z0-9 ]/g, '');
                e.setAttribute( "gpt-link-text", link_text );
            }
        }, e);
    } );
}

async function waitForEvent(page, event) {
    return page.evaluate(event => {
        return new Promise((r, _) => {
            document.addEventListener(event, function(e) {
                r();
            });
        });
    }, event)
}

(async () => {
    console.log( "###########################################" );
    console.log( "# GPT4V-Browsing by Unconventional Coding #" );
    console.log( "###########################################\n" );
    /*
    const browser = await puppeteer.launch( {
        headless: "false",
        executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
        userDataDir: '/Users/imac/Library/Application\ Support/Google/Chrome\ Canary/Default',
        ignoreHTTPSErrors: true 
    } );
    */
    //!!!!!!!!!!!!!!!!!!!!! QUI IL TUO BROWSER!!!!!!!!!!!!!!!!!!!!!!!!!!!
    const browser = await puppeteer.connect({
        browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/c61479fa-4525-4176-ac03-af0c106046de', // Replace with your obtained WebSocket endpoint
    });
   
    let page;
    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            page = await target.page();
        }
    });
    await browser.newPage(); // Open an initial page
    const [initialPage] = await browser.pages();
    page = initialPage;


    await page.setViewport( {
        width: 1200,
        height: 1200,
        deviceScaleFactor: 1,
    } );

    const messages = [
        {
            "role": "system",
            "content": `You are a website crawler. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on. The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.

            You can go to a specific URL by answering with the following JSON format:
            {"url": "url goes here"}

            You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
            {"click": "Text in button/link goes here"}
            you will be given the screenshot of the page. CHoose wisely the button you want to click. We need every information that can profile accurately the profile opf the given domain .

            You can  download a file, respond with the following JSON format:
            {"download": "URL goes here", "destination": "destination/path/filename.ext"}

            Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

            Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable. Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. Do not make up links`,
        }
    ];

    console.log("Akeem: Come posso aiutarti?")
    const prompt = await input("Tu: ");
    console.log();

    messages.push({
        "role": "user",
        "content": prompt,
    });

    let url;
    let screenshot_taken = false;
   

    while( true ) {

        const linksData = [];

        if( url ) {
            console.log("Crawling " + url);
            await page.goto( url, {
                waitUntil: "domcontentloaded",
                timeout: timeout,
            } );

            const links = await page.$$('a');
            

            // Itera attraverso tutti gli elementi e ottieni link e titoli
            for (const link of links) {
                const linkTitle = await link.evaluate(el => el.textContent.trim());
                const linkHref = await link.evaluate(el => el.getAttribute('href'));
                
                linksData.push({ title: linkTitle, href: linkHref });
            }

            await Promise.race( [
                waitForEvent(page, 'load'),
                sleep(timeout)
            ] );

            await highlight_links( page );

            await page.screenshot( {
                path: "screenshot.jpg",
                fullPage: true,
            } );

            screenshot_taken = true;
            url = null;
        }

        if( screenshot_taken ) {
            const base64_image = await image_to_base64("screenshot.jpg");
            
            messages.push({
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": base64_image,
                    },
                    {
                        "type": "text",
                        "text": "Here's the screenshot of the website you are on right now. You can click on links with {\"click\": \"Link text\"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally. Take a lost of real link of this website to choose from: ",
                    }
                ]
            });


            screenshot_taken = false;
        }
        

        const response = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            max_tokens: 1024,
            messages: messages,
        });
        
        const message = response.choices[0].message;
        //console.log(messages);
        const message_text = message.content;

        const downloadCommandIndex = message_text.indexOf('{"download": "');
        if (downloadCommandIndex !== -1) {
            let parts = message_text.split('{"download": "');
            parts = parts[1].split('"}');
            const downloadUrl = parts[0];
            const destination = parts[1].split('"}')[0];
            await downloadContent(downloadUrl, destination);
        }

        messages.push({
            "role": "assistant",
            "content": message_text,
        });

        console.log( "GPT: " + message_text );

        if (message_text.indexOf('{"click": "') !== -1) {
            let parts = message_text.split('{"click": "');
            parts = parts[1].split('"}');
            const link_text = parts[0].replace(/[^a-zA-Z0-9 ]/g, '');
            console.log("Clicking on " + link_text);
            try{
                let go_to = linksData.find(linksData => linksData.title.toLowerCase() === link_text.toLowerCase());
                //let go_to = linksData.find(linksData => linksData.title.toLowerCase() === link_text.toLowerCase());
                console.log("go_to: " + go_to.href);
            
            //log the href of the object go_to
            
            /*try {
                const elements = await page.$$('[gpt-link-text]');
        
                let partial;
                let exact;
                
                
                for (const element of elements) {
                    const attributeValue = await element.evaluate(el => el.getAttribute('gpt-link-text'));
        
                    if (attributeValue.includes(link_text)) {
                        partial = element;
                        console.log("Partial match: " + partial);
                    }
        
                    if (attributeValue === link_text) {
                        exact = element;
                        console.log("Exact match: " + exact);
                    }
                }
        
                if (exact || partial) {
                    const [response] = await Promise.all([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(e => console.log("Navigation timeout/error:", e.message)),
                        (exact || partial).click()
                    ]);
        
                    // Additional checks can be done here, like validating the response or URL
                    await Promise.race( [
                        waitForEvent(page, 'load'),
                        sleep(timeout)
                    ] );

                    await highlight_links(page);
        
                    await page.screenshot({
                        path: "screenshot.jpg",
                        quality: 100,
                        fullpage: true
                    });
                    // 
                    screenshot_taken = true;
                } else {
                    try{*/
                        console.log("Trying to find link by text: " + go_to.href);
                        url = go_to.href;/*
                    } catch {
                        throw new Error("Can't find link");
                    }
                    
                    
                }
            } catch (error) {
                try{
                    console.log("Trying to find link by text");
                        url = go_to;
                 } catch {
                    console.log("ERROR: Clicking failed", error);
        
                    messages.push({
                    "role": "user",
                    "content": "ERROR: I was unable to click that element",
                });
                 }
                
            }
            */} catch {
                throw new Error("Can't find link: " + link_text);
            }
            continue;
        } else if (message_text.indexOf('{"url": "') !== -1) {
            let parts = message_text.split('{"url": "');
            parts = parts[1].split('"}');
            url = parts[0];
            
            continue;
        }

        const prompt = await input("You: ");
        console.log();
       
        messages.push({
            "role": "user",
            "content": prompt,
        });
    }
})();


