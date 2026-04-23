const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path'); 

const app = express();
app.use(cors());

// --- ARAMA URL ŞABLONLARI ---
const URL_FORMAT = {
    IDEASOFT: (url, k) => `${url}/arama/${encodeURIComponent(k).replace(/%20/g, '+')}`,
    TICIMAX: (url, k) => `${url}/?k=${encodeURIComponent(k)}`,
    SHOPIFY: (url, k) => `${url}/search?q=${encodeURIComponent(k)}`
};

// --- CSS SEÇİCİ ŞABLONLARI ---
const CSS_FORMAT = {
    IDEASOFT: { 
        kutu: '.showcase, .product-item, .box-product', 
        ad: '.showcase-title, .product-title, .name, .product-name', 
        fiyat: '.showcase-price-new, .product-price, .price, .current-price', 
        link: 'a' 
    },
    TICIMAX: { 
        kutu: '.ProductPageItem, .ItemOrj, .product-item, .box-product', 
        ad: '.productName, .detailLink, .product-title, .name', 
        fiyat: '.discountPrice, .productPrice, .product-price, .price', 
        link: 'a' 
    },
    WOOCOMMERCE: { 
        kutu: '.product, .type-product, li.product', 
        ad: '.woocommerce-loop-product__title, h2, h3', 
        fiyat: '.price, .woocommerce-Price-amount', 
        link: 'a' 
    }
};

// --- BAŞARIYLA ÇÖZÜLEN 17 MAĞAZA ---
const HEDEFLER =[
    // --- GRUP 1: İLK BULUNAN 11 MAĞAZA (Ideasoft Ağırlıklı) ---
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

    // --- GRUP 2: BOTUN YENİ ÇÖZDÜĞÜ 6 MAĞAZA ---
    { magaza_adi: "Solar AVM", url: "https://solaravm.com", arama_url_olustur: (k) => URL_FORMAT.SHOPIFY("https://solaravm.com", k), seciciler: CSS_FORMAT.TICIMAX },
    { magaza_adi: "Urla Solar", url: "https://urlasolar.com", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://urlasolar.com", k), seciciler: CSS_FORMAT.WOOCOMMERCE },
    { magaza_adi: "Prisma Cell", url: "https://www.prismacell.com.tr", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://www.prismacell.com.tr", k), seciciler: CSS_FORMAT.WOOCOMMERCE },
    { magaza_adi: "Radikal Solar Market", url: "https://market.radikalsolar.com", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://market.radikalsolar.com", k), seciciler: CSS_FORMAT.WOOCOMMERCE },
    { magaza_adi: "Solar Zirve", url: "https://www.solarzirve.com", arama_url_olustur: (k) => URL_FORMAT.TICIMAX("https://www.solarzirve.com", k), seciciler: CSS_FORMAT.WOOCOMMERCE }
];

app.get('/ara', async (req, res) => {
    const kelime = req.query.q;
    if (!kelime) return res.status(400).json({ error: "Kelime girin." });

    console.log(`\n===========================================`);
    console.log(`"${kelime}" için ARAMA BAŞLADI (${HEDEFLER.length} Mağaza + Google Alışveriş)`);
    console.log(`===========================================`);

    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    };

    // Mevcut mağazaları kazıyan asenkron işlemler
    const promises = HEDEFLER.map(async (site) => {
        try {
            const url = site.arama_url_olustur(kelime);
            const response = await axios.get(url, { headers, timeout: 8000 });
            const $ = cheerio.load(response.data);

            let sonuclar =[];
            
            $(site.seciciler.kutu).each((i, el) => {
                let urunAdi = $(el).find(site.seciciler.ad).text().replace(/\s+/g, ' ').trim();
                let fiyat = $(el).find(site.seciciler.fiyat).text().replace(/\s+/g, ' ').trim();
                let link = $(el).find(site.seciciler.link).first().attr('href');

                if (urunAdi && fiyat && urunAdi.length > 3) {
                    if (link && !link.startsWith('http')) {
                        link = site.url + (link.startsWith('/') ? '' : '/') + link;
                    }
                    sonuclar.push({ magaza: site.magaza_adi, urunAdi, fiyat, link, isGoogle: false });
                }
            });

            console.log(`✅ ${site.magaza_adi}: ${sonuclar.length} ürün`);
            return sonuclar;

      } catch (e) {
            console.log(`Hata: ${site.magaza_adi} sitesinden veri çekilemedi. (${e.message})`);
            return []; // Site engellerse veya çökerse boş liste dönsün, diğerleri çalışmaya devam etsin.
        }
    });

    // Google Alışveriş (SerpApi) entegrasyonu
    const pSerpApi = (async () => {
        try {
            const SERP_API_KEY = "86cf4c5c700b1b64a24f3b8c68f85f28680ec466dd837d1c56cc8035cbb533dc";
            const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(kelime)}&gl=tr&hl=tr&tbs=vw:l,mr:1,p_ord:p&api_key=${SERP_API_KEY}`;
            
            const response = await axios.get(url, { timeout: 15000 });
            const sonuclar = response.data.shopping_results;

            if (!sonuclar || sonuclar.length === 0) return [];

            let gData = [];
            // İlk 10 ürünü al
            const islenmis = sonuclar.slice(0, 10);
            for(let u of islenmis) {
                gData.push({
                    magaza: u.source || "Google Alışveriş",
                    urunAdi: u.title,
                    fiyat: u.price, // API fiyatı string (ör: "₺12.999,00") döndürür, frontend parser bunu çözecektir
                    link: u.product_link || u.link || "",
                    isGoogle: true
                });
            }
            console.log(`✅ Google Alışveriş (Trendyol/Hepsiburada vb.): ${gData.length} ürün`);
            return gData;
        } catch (e) {
            console.log(`Hata: Google Alışveriş (SerpApi) başarısız. Kotan dolmuş olabilir. (${e.message})`);
            return []; // API patlarsa da sistem çalışmaya devam etsin
        }
    })();

    // Google Arama işlemini de genel promise havuzuna ekliyoruz
    promises.push(pSerpApi);

    const results = await Promise.allSettled(promises);
    const finalData = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .flat(); // İç içe arrayleri tek array yapar

    res.json(finalData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});