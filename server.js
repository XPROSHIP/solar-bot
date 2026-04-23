// --- START OF FILE server.js ---

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const { runCrawler } = require('./crawler'); // Crawler motorumuzu import ediyoruz

const app = express();
app.use(cors());

// --- CRAWLER DURUM YÖNETİMİ ---
let crawlStatus = {
    isRunning: false,
    progressLog: ["Beklemede..."],
    lastManualRunDate: null,
    lastRunResult: null,
    percentage: 0
};

// --- GECE 4 OTOMATİK CRAWLER TETİKLEYİCİSİ ---
cron.schedule('0 4 * * *', () => {
    console.log('[CRON] Gece 04:00 otomatik tarama başlıyor...');
    if (!crawlStatus.isRunning) {
        startFullCrawl('Otomatik Gece Taraması');
    } else {
        console.log('[CRON] Tarama zaten çalışıyor, gece taraması atlandı.');
    }
}, { timezone: "Europe/Istanbul" });

// --- CRAWLER'I ÇALIŞTIRAN ANA FONKSİYON ---
async function startFullCrawl(triggerSource = 'Bilinmeyen') {
    crawlStatus.isRunning = true;
    crawlStatus.progressLog = [`[${new Date().toLocaleTimeString()}] Tarama başladı. Kaynak: ${triggerSource}`];
    crawlStatus.percentage = 0;

    const updateCallback = (update) => {
        const now = new Date().toLocaleTimeString();
        if (update.status === 'progress') {
            crawlStatus.progressLog.push(`[${now}] ${update.message}`);
        } else if (update.status === 'done') {
            crawlStatus.progressLog.push(`[${now}] ${update.message}`);
            crawlStatus.isRunning = false;
            crawlStatus.lastRunResult = update.message;
        }
        // İlerleme yüzdesini kabaca hesapla
        const doneCount = crawlStatus.progressLog.filter(l => l.includes('✅') || l.includes('❌')).length;
        crawlStatus.percentage = Math.round((doneCount / SITES_TO_CRAWL.length) * 100);
    };

    try {
        await runCrawler(updateCallback);
    } catch (error) {
        crawlStatus.isRunning = false;
        crawlStatus.progressLog.push(`[${new Date().toLocaleTimeString()}] KRİTİK HATA: Tarama çöktü! ${error.message}`);
    }
}


// --- API ENDPOINTLERİ ---

// Manuel Crawler'ı tetikleyen endpoint
app.post('/start-crawl', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    if (crawlStatus.isRunning) {
        return res.status(409).json({ message: "Tarama zaten devam ediyor. Lütfen tamamlanmasını bekleyin." });
    }
    if (crawlStatus.lastManualRunDate === today) {
        return res.status(403).json({ message: "Bugünkü manuel tarama hakkınızı zaten kullandınız." });
    }
    
    crawlStatus.lastManualRunDate = today;
    startFullCrawl('Manuel Tetikleme');
    res.status(202).json({ message: "Tarama işlemi başarıyla başlatıldı. Durumu /crawl-status adresinden takip edebilirsiniz." });
});

// Crawler'ın anlık durumunu döndüren endpoint
app.get('/crawl-status', (req, res) => {
    res.json(crawlStatus);
});


// --- HİBRİT ARAMA ENDPOINT'İ ---
app.get('/ara', async (req, res) => {
    const kelime = req.query.q;
    if (!kelime) return res.status(400).json({ error: "Kelime girin." });

    console.log(`\n"${kelime}" için HİBRİT ARAMA BAŞLADI...`);

    // 1. ADIM: YEREL VERİTABANINDAN (db.json) ANINDA ARAMA
    let localResults = [];
    try {
        const dbData = await fs.readFile('db.json', 'utf-8');
        const dbJson = JSON.parse(dbData);
        const k = kelime.toLowerCase();
        
        localResults = dbJson.filter(p => 
            p.urun_adi.toLowerCase().includes(k) ||
            (p.marka && p.marka.toLowerCase().includes(k)) ||
            (p.stok_kodu && p.stok_kodu.toLowerCase().includes(k)) ||
            (p.kategori && p.kategori.toLowerCase().includes(k))
        ).map(p => ({ ...p, isGoogle: false })); // Google dışı olarak etiketle
        console.log(`Yerel veritabanından ${localResults.length} sonuç bulundu.`);
    } catch (e) {
        console.log("Yerel veritabanı (db.json) bulunamadı veya okunamadı. Yalnızca canlı arama yapılacak.");
    }
    
    // 2. ADIM: GOOGLE SERPAPI'DEN CANLI ARAMA (API Kodun Silinmedi)
    const pSerpApi = (async () => {
        try {
            const SERP_API_KEY = "86cf4c5c700b1b64a24f3b8c68f85f28680ec466dd837d1c56cc8035cbb533dc";
            const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(kelime)}&gl=tr&hl=tr&tbs=vw:l,mr:1,p_ord:p&api_key=${SERP_API_KEY}`;
            const response = await axios.get(url, { timeout: 15000 });
            if (!response.data || !response.data.shopping_results) return [];

            return response.data.shopping_results.slice(0, 10).map(u => ({
                magaza: u.source || "Google Alışveriş",
                urun_adi: u.title,
                yeni_fiyat: u.price,
                link: u.product_link || u.link || "",
                isGoogle: true
            }));
        } catch (e) { return []; }
    })();

    // 3. ADIM: SONUÇLARI BİRLEŞTİR VE GÖNDER
    const googleResults = await pSerpApi;
    console.log(`Google Alışveriş'ten ${googleResults.length} sonuç bulundu.`);

    // Mükerrerleri önlemek için link bazlı birleştirme
    const finalResultsMap = new Map();
    // Önce yerel sonuçları ekle
    localResults.forEach(p => finalResultsMap.set(p.link, p));
    // Sonra Google sonuçlarını ekle (eğer aynı link varsa üzerine yazar)
    googleResults.forEach(p => finalResultsMap.set(p.link, p));
    
    const finalData = Array.from(finalResultsMap.values());
    res.json(finalData);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));

// Statik dosyalar için (index.html vb.)
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// crawler.js içindeki site listesini dışarıya sunmak için (kodu tekrar etmemek adına)
const { SITES_TO_CRAWL } = require('./crawler').SITES_TO_CRAWL;

// --- END OF FILE server.js ---