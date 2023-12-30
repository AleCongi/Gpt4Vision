const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const OpenAI = require('openai');
const readline = require('readline');
const fs = require('fs');
require('dotenv/config');

puppeteer.use(StealthPlugin());
let url = 'https://peroni.it/';
const openai = new OpenAI();


const timeout = 5000;
(async () => {
    const linksData = [];

    const messages = [
        {
            "role": "system",
            "content": `You are a website crawler. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on or a list of links. The buttons that contain links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.

            You can go to a specific URL by answering with the following JSON format:
            {"url": "url goes here"}

            You can click links on the website by referencing the text inside of the link/button. Look at the list of title of buttons | link of the button in the next message: choose the one you want to click basing the decision on the given list. Respond with the following JSON format:
            {"url": "url you find in the list goes here"}
            you will be given the screenshot of the page. CHoose wisely the button you want to click. We need every information that can profile accurately the profile opf the given domain .

            You can  download a file, respond with the following JSON format:
            {"download": "URL goes here", "destination": "destination/path/filename.ext"}

            Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

            Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable. Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. Do not make up links`,
        }
    ];



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
    await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeout,
    });

    const links = await page.$$('a');


    // Itera attraverso tutti gli elementi e ottieni link e titoli
    for (const link of links) {
        const linkTitle = await link.evaluate(el => el.textContent.trim());
        const linkHref = await link.evaluate(el => el.getAttribute('href'));
        //inizializza una variabile per il link privato del dominio principale
        let linkHrefNoDomain;

        //se linktitle o linkHref è vuoto, non aggiungere nulla
        if (linkTitle == '' || linkHref == '') {
            continue;
        }
        //togli la sottostringa url da linkHref
        //ciclo for su tutti i 


        
        linkHrefNoDomain = linkHref.replace(url, '');
        //se inizia con / toglilo
        if (linkHrefNoDomain.startsWith('/')) {
            linkHrefNoDomain = linkHrefNoDomain.slice(1);
        }
        //se ci sono più di due /, non aggiungere nulla
        if (linkHrefNoDomain.split('/').length > 2) {
            continue;
        }
        //se la lunghezza di linkHrefNoDomain è maggiore di 0 e minore di 30, aggiungilo

        //aggiungilinksdata
        linksData.push({
            "title": linkTitle,
            "url": linkHref,
        });
        //se linkHref inizia con http, aggiungilo
    }
    messages.push({
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "Ciao, ti spiego il mio problema. Ho bisogno di te per creare una knowledge base che io possa utilizzare a favore di assistenti openai. In relazione a questo, credo che basterebbe un file json contenente una struttura intera del sito. è importante solo prendere le informazioni di grande e media importanza. Bisogna capire fondamentalemnte che servizio si offre o che prodotti si vendono. Ancora, potrebbero essere soli siti vetrina. L'importante è creare una struttura ordinata. C'è bisogno di considerare unicamente, solamente gli url con il dominio principale che ti scriverò alla fine. Mi immagino una specie di albero, come knowledge base. Ogni nodo rappresenta una sezione del sito principale. Ogni nodo contiene anche le descrizioni e le specifiche opportune che rappresentano quella sezione del sito nella sua interezza. Continua a navigare fino a raggiungere un'altezza dell'ipotetico albero uguale a 3. Non navigare a più di quella soglia: i salti dall'url principale alla nuova landing page non devono essere superiori a 3. Il sito è https://www.ubuy.co.it/it/. esplora ulteriormente e autonomamente il sito web, espandendo la lista in formato json, ordinato. sii più specifico e inserisci informazioni del sito generali direttamente nella struttiura del nodo della home. è assolutamente imperativo che leggendo il json si capisca la struttura del sito, con un meccanismo di parentela chiaro fra le sottopagine del sito web. Non chiedermi di andare avanti: fallo e basta, autonomamente, coprendo tutti i nodi fino ad altezza 3. Cattura ed espandi la descrizone di ogni pagina su cui atterri non omettendo nessun minimo messasggio considerabile identificativa dell'idenità e dell'offerta del sito web. il mio consiglio è quello di cercare una pagina \"chi siamo\" o \"about\", insomma dove risiedono generalmente le informazioni di cui necessitiamo.",
            }
        ]
    });
    messages.push({
        "role": "user",
        "content": [
            
            {
                "type": "text",
                "text": JSON.stringify(linksData),
            },
            {
                "type": "text",
                "text": "Here's the list of button names | links of the website you are on right now. You can click on links with {\"url\": \"Url you find in the list\"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally.",
            }
        ]
    });
    console.log(linksData);
    //log linksData full array
    fs.writeFile('linksData.json', JSON.stringify(linksData), (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });
    const response = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: messages,
    });
    const message = response.choices[0].message;
        //console.log(messages);
    const message_text = message.content;
    console.log( "GPT: " + message_text);
})();