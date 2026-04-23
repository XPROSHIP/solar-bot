// --- START OF FILE server.js ---

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const { runCrawler } = require('./crawler'); // Crawler motorumuz

const app = express();
app.use(cors());

// --- ARAMA URL ŞABLONLARI (Canlı Arama İçin) ---
const URL_FORMAT = {
    IDEASOFT: (url, k) => `${url}/arama/${encodeURIComponent(k).replace(/%20/g, '+')}?search_in_description=1&search_in_stock_code=1&search_in_brand=1`,
    TICIMAX: (url, k) => `${url}/?k=${encodeURIComponent(k)}&searchInDesc=1&searchInStockCode=1`,
    SHOPIFY: (url, k) => `${url}/search?q=${encodeURIComponent(k)}`
};

// --- CSS SEÇİCİ ŞABLONLARI ---
const CSS_FORMAT = {
    IDEASOFT: { kutu: '.showcase, .product-item, .box-product', ad: '.showcase-title, .product-title, .name, .product-name', fiyat: '.showcase-price-new, .product-price, .price, .current-price', link: 'a' },
    TICIMAX: { kutu: '.ProductPageItem, .ItemOrj, .product-item, .box-product', ad: '.productName, .detailLink, .product-title, .name', fiyat: '.discountPrice, .productPrice, .product-price, .price', link: 'a' },
    WOOCOMMERCE: { kutu: '.product, .type-product, li.product', ad: '.woocommerce-loop-product__title, h2, h3', fiyat: '.price, .woocommerce-Price-amount', link: 'a' }
};

// --- CANLI ARANACAK 17 MAĞAZA (Geri Eklendi!) ---
const HEDEFLER =[
    { magaza_adi: "Kamu Solar", url: "https://www.kamusolar.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.kamusolar.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Global Enerji", url: "https://www.globalenerjimarketim.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.globalenerjimarketim.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Teknovasyon Arge", url: "https://www.teknovasyonarge.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.teknovasyonarge.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Yapı Bahçe", url: "https://www.yapibahce.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.yapibahce.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Kampa", url: "https://www.kampa.com.tr", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.kampa.com.tr", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Solar Sanal Market", url: "https://www.solarsanalmarket.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.solarsanalmarket.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Alize Marin Market", url: "https://www.alizemarinmarket.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.alizemarinmarket.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Enerji Pazarı", url: "https://www.enerjipazari.com.tr", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.enerjipazari.com.tr", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Solar İst Shop", url: "https://www.solaristshop.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.solaristshop.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Solenser Market", url: "https://www.solensermarket.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.solensermarket.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Modül Elektronik", url: "https://www.modulelektronik.com", arama_url_olustur: (k) => URL_FORMAT.IDEASOFT("https://www.modulelektronik.com", k), seciciler: CSS_FORMAT.IDEASOFT },
    { magaza_adi: "Solar AVM", url: "https://solaravm.com", arama_url_olustur: (k) => URL_FORMAT.SHOPIFY("https://solaravm.com", k), seciciler: CSS_FORMAT.TICIMAX },
    { magaza_adi: "Urla Solar", url: "https://urlasolar.com", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://urlasolar.com", k), seciciler: CSS_FORMAT.WOOCOMMERCE },
    { magaza_adi: "Prisma Cell", url: "https://www.prismacell.com.tr", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://www.prismacell.com.tr", k), seciciler: CSS_FORMAT.WOOCOMMERCE },
    { magaza_adi: "Radikal Solar Market", url: "https://market.radikalsolar.com", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://market.radikalsolar.com", k), seciciler: CSS_FORMAT.WOOCOMMERCE },
    { magaza_adi: "Solar Zirve", url: "https://www.solarzirve.com", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://www.solarzirve.com", k), seciciler: CSS_FORMAT.WOOCOMMERCE }
];

// --- CRAWLER DURUM YÖNETİMİ ---
let crawlStatus = { isRunning: false, progressLog: ["Beklemede..."], lastManualRunDate: null, percentage: 0 };

// Gece 04:00 Cron
cron.schedule('0 4 * * *', () => { if (!crawlStatus.isRunning) startFullCrawl('Otomatik Gece Taraması'); }, { timezone: "Europe/Istanbul" });

async function startFullCrawl(triggerSource) {
    crawlStatus.isRunning = true; crawlStatus.percentage = 0;
    crawlStatus.progressLog = [`[${new Date().toLocaleTimeString()}] Tarama başladı. Kaynak: ${triggerSource}`];
    try { await runCrawler((u) => {
        crawlStatus.progressLog.push(`[${new Date().toLocaleTimeString()}] ${u.message}`);
        if(u.status === 'done') crawlStatus.isRunning = false;
    }); } catch (e) { crawlStatus.isRunning = false; }
}

app.post('/start-crawl', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    if (crawlStatus.isRunning) return res.status(409).json({ message: "Zaten çalışıyor." });
    if (crawlStatus.lastManualRunDate === today) return res.status(403).json({ message: "Günde 1 kez çalıştırabilirsiniz." });
    crawlStatus.lastManualRunDate = today;
    startFullCrawl('Manuel Tetikleme');
    res.status(202).json({ message: "Başlatıldı." });
});

app.get('/crawl-status', (req, res) => { res.json(crawlStatus); });

// --- HİBRİT ARAMA ENDPOINT'İ (HEPSİ BİRLEŞTİRİLDİ!) ---
app.get('/ara', async (req, res) => {
    const kelime = req.query.q;
    if (!kelime) return res.status(400).json({ error: "Kelime girin." });

    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

    // 1. KOL: Yerel Veritabanından Oku
    let localResults = [];
    try {
        const dbJson = JSON.parse(await fs.readFile('db.json', 'utf-8'));
        const k = kelime.toLowerCase();
        localResults = dbJson.filter(p => p.urun_adi.toLowerCase().includes(k) || (p.stok_kodu && p.stok_kodu.toLowerCase().includes(k)) || (p.marka && p.marka.toLowerCase().includes(k)));
    } catch (e) { console.log("db.json henüz oluşmamış."); }

    // 2. KOL: Google Alışveriş (SerpApi)
    const pSerpApi = (async () => {
        try {
            const SERP_API_KEY = "86cf4c5c700b1b64a24f3b8c68f85f28680ec466dd837d1c56cc8035cbb533dc";
            const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(kelime)}&gl=tr&hl=tr&tbs=vw:l,mr:1,p_ord:p&api_key=${SERP_API_KEY}`;
            const response = await axios.get(url, { timeout: 15000 });
            return response.data.shopping_results.slice(0, 10).map(u => ({ magaza: u.source || "Google Alışveriş", urun_adi: u.title, yeni_fiyat: u.price, link: u.product_link || u.link || "", isGoogle: true }));
        } catch (e) { return []; }
    })();

    // 3. KOL: 17 Siteden Canlı Arama (Geri Getirildi!)
    const pLiveSites = HEDEFLER.map(async (site) => {
        try {
            const url = site.arama_url_olustur(kelime);
            const response = await axios.get(url, { headers, timeout: 8000 });
            const $ = cheerio.load(response.data);
            let sonuclar = [];
            $(site.seciciler.kutu).each((i, el) => {
                let urunAdi = $(el).find(site.seciciler.ad).text().replace(/\s+/g, ' ').trim();
                let fiyat = $(el).find(site.seciciler.fiyat).text().replace(/\s+/g, ' ').trim();
                let link = $(el).find(site.seciciler.link).first().attr('href');
                if (urunAdi && fiyat && urunAdi.length > 3) {
                    if (link && !link.startsWith('http')) link = site.url + (link.startsWith('/') ? '' : '/') + link;
                    sonuclar.push({ magaza: site.magaza_adi, urun_adi: urunAdi, yeni_fiyat: fiyat, link: link, isGoogle: false });
                }
            });
            return sonuclar;
        } catch (e) { return []; }
    });

    // Tüm kolları paralel olarak çalıştır
    const [googleResults, ...liveSiteResults] = await Promise.all([pSerpApi, ...pLiveSites]);
    const flattenedLiveResults = liveSiteResults.flat();

    // AKILLI BİRLEŞTİRME (Merge) ALGORİTMASI
    const finalResultsMap = new Map();

    // Önce JSON verilerini haritaya koy
    localResults.forEach(p => finalResultsMap.set(p.link, p));
    
    // Canlı sitelerden gelenleri koy (Aynı link varsa fiyatı günceller!)
    flattenedLiveResults.forEach(p => finalResultsMap.set(p.link, p));
    
    // Google sonuçlarını koy
    googleResults.forEach(p => finalResultsMap.set(p.link, p));

    res.json(Array.from(finalResultsMap.values()));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });