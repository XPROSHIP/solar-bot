// --- START OF FILE crawler.js ---

const puppeteer = require('puppeteer');
const fs = require('fs/promises');

// --- SENİN FiyatListesi2.js'DEN ALINAN TAM SİTE LİSTESİ ---
const SITES_TO_CRAWL =[
    { magaza_adi: "Kamu Solar", url: "https://www.kamusolar.com", type: "ideasoft" },
    { magaza_adi: "Global Enerji", url: "https://www.globalenerjimarketim.com", type: "ideasoft" },
    { magaza_adi: "Enerji Pazarı", url: "https://www.enerjipazari.com.tr", type: "ideasoft" },
    { magaza_adi: "Yapı Bahçe", url: "https://www.yapibahce.com", type: "ideasoft" },
    { magaza_adi: "Teknovasyon Arge", url: "https://www.teknovasyonarge.com", type: "ideasoft" },
    { magaza_adi: "Solar Sanal Market", url: "https://www.solarsanalmarket.com", type: "ideasoft" },
    { magaza_adi: "Kampa", url: "https://www.kampa.com.tr", type: "ideasoft" },
    { magaza_adi: "Nonstop Enerji", url: "https://www.nonstopenerji.com", type: "ideasoft" },
    { magaza_adi: "Gümüş Solar", url: "https://www.gumussolar.com", type: "ideasoft" },
    { magaza_adi: "Alize Marin Market", url: "https://www.alizemarinmarket.com", type: "ideasoft" },
    { magaza_adi: "Solenser Market", url: "https://www.solensermarket.com", type: "ideasoft" },
    { magaza_adi: "Solar İst Shop", url: "https://www.solaristshop.com", type: "ideasoft" },
    { magaza_adi: "Modül Elektronik", url: "https://www.modulelektronik.com", type: "ideasoft" },
    
    // SENİN HEURISTIC METODUNU KULLANACAK SİTELER (KORUNDU)
    { magaza_adi: "Urla Solar", url: "https://urlasolar.com", type: "heuristic" },
    { magaza_adi: "Sakarya Solar", url: "https://sakaryasolarmarket.com", type: "heuristic" },
    { magaza_adi: "Solar Zirve", url: "https://www.solarzirve.com", type: "heuristic" },
    
    // SENİN CUSTOM METODUNU KULLANACAK SİTELER (KORUNDU)
    { magaza_adi: "Tam Solar", url: "https://tamsolar.com.tr", type: "custom", sel: { kart: '.product-container', isim: '.product-name', fiyat: '.sell-price' } },
    { magaza_adi: "Atakale", url: "https://www.atakale.com.tr", type: "custom", sel: { kart: '.product-thumb', isim: '.caption h4 a', fiyat: '.price' } },
    { magaza_adi: "Enerjimar", url: "https://enerjimar.com", type: "custom", sel: { kart: '.urun-kutusu', isim: 'h2 a', fiyat: '.urun-fiyat' } },
    { magaza_adi: "İda Solar", url: "https://www.idasolar.com", type: "custom", sel: { kart: '.card-product', isim: '.title', fiyat: '.sale-price' } }
];

// --- SENİN GELİŞMİŞ VERİ TEMİZLEME ALGORİTMAN (KORUNDU) ---
function veriTemizle(isim, link, fiyatText) {
    if (!isim || !link || !fiyatText) return null;
    let upIsim = isim.toUpperCase().trim();
    if (upIsim.length < 5 || !/[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(upIsim)) return null; 

    let temizFiyat = fiyatText.replace(/tl|₺|try|lira|kdv|vergi|dahil|indirimli|\+|/gi, '').trim();
    let fiyatParcalari = temizFiyat.split(/\s+/);
    temizFiyat = fiyatParcalari[fiyatParcalari.length - 1];

    let numStr = temizFiyat.replace(/[^0-9,.]/g, '');
    if (!numStr || numStr === "0") return null;

    let sonVirgul = numStr.lastIndexOf(',');
    let sonNokta = numStr.lastIndexOf('.');
    let floatVal = 0;
    
    if (sonVirgul > sonNokta) floatVal = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
    else if (sonNokta > sonVirgul) floatVal = parseFloat(numStr.replace(/,/g, ''));
    else floatVal = parseFloat(numStr);

    if (isNaN(floatVal) || floatVal <= 0) return null;
    return floatVal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// --- ANA KAZIYICI MOTORU ---
async function runCrawler(updateCallback) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    let fullDatabase = [];

    for (let i = 0; i < SITES_TO_CRAWL.length; i++) {
        const site = SITES_TO_CRAWL[i];
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        try {
            updateCallback({ status: 'progress', message: `[${i+1}/${SITES_TO_CRAWL.length}] ${site.magaza_adi} taranıyor... (${site.type})` });

            let siteProducts = [];
            if (site.type === "ideasoft") {
                siteProducts = await scrapeIdeasoft_2step(page, site); // YÜKSELTİLMİŞ 2 AŞAMALI METOT
            } else if (site.type === "heuristic") {
                siteProducts = await scrapeHeuristic(page, site); // SENİN ORİJİNAL KODUN
            } else if (site.type === "custom") {
                siteProducts = await scrapeCustom(page, site); // SENİN ORİJİNAL KODUN
            }

            fullDatabase = fullDatabase.concat(siteProducts);
            updateCallback({ status: 'progress', message: `✅ ${site.magaza_adi}: ${siteProducts.length} ürün bulundu.` });

        } catch (error) {
            updateCallback({ status: 'progress', message: `❌ ${site.magaza_adi}: Hata! (${error.message.substring(0, 40)})` });
        } finally {
            await page.close();
        }
    }
    await browser.close();

    const uniqueDatabase = [...new Map(fullDatabase.map(item => [item.link, item])).values()];
    await fs.writeFile('db.json', JSON.stringify(uniqueDatabase, null, 2));
    updateCallback({ status: 'done', message: `🎉 Tarama tamamlandı! Toplam ${uniqueDatabase.length} benzersiz ürün veritabanına kaydedildi.` });
    
    return { productCount: uniqueDatabase.length };
}


// --- KAZIMA FONKSİYONLARI ---

// 1. IDEASOFT İÇİN YÜKSELTİLMİŞ 2 AŞAMALI DERİN KAZIMA
async function scrapeIdeasoft_2step(page, site) {
    let allProductDetails = [];
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    
    const kategoriLinkleri = await page.evaluate((baseUrl) => Array.from(new Set(Array.from(document.querySelectorAll('a[href]')).map(a => new URL(a.href, baseUrl).href).filter(u => u.startsWith(baseUrl) && (u.includes('/kategori/') || u.includes('-k-'))))), site.url);

    for (const catLink of kategoriLinkleri.slice(0, 30)) { // Limiti artırdık, çok fazla kategorisi olanlar için
        try {
            await page.goto(catLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const productLinks = await page.evaluate((baseUrl) => Array.from(new Set(Array.from(document.querySelectorAll('.showcase a, .product-item a, .box-product a')).map(a => new URL(a.href, baseUrl).href).filter(u => u.startsWith(baseUrl) && u.includes('/urun/')))), site.url);

            for (const pLink of productLinks) {
                try {
                    await page.goto(pLink, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    const details = await page.evaluate(() => {
                        let data = { urun_adi: '', yeni_fiyat: '', eski_fiyat: '', marka: '', kategori: '', stok_kodu: '' };
                        data.urun_adi = document.querySelector('.product-title h1')?.innerText.trim();
                        data.yeni_fiyat = document.querySelector('.product-price, .current-price, .price, #product-price')?.innerText.trim();
                        data.eski_fiyat = document.querySelector('.product-price-old, .discountPrice del')?.innerText.trim();
                        
                        document.querySelectorAll('.product-list-row').forEach(row => {
                            const title = row.querySelector('.product-list-title')?.innerText.toLowerCase().trim();
                            const content = row.querySelector('.product-list-content')?.innerText.trim();
                            if (title && content) {
                                if (title.includes('marka')) data.marka = content;
                                if (title.includes('kategori')) data.kategori = content;
                                if (title.includes('stok')) data.stok_kodu = content;
                            }
                        });
                        return data;
                    });
                    
                    const temizFiyat = veriTemizle(details.urun_adi, pLink, details.yeni_fiyat);
                    if (temizFiyat) {
                        allProductDetails.push({
                            magaza: site.magaza_adi, urun_adi: details.urun_adi, marka: details.marka || "Bulunamadı", kategori: details.kategori || "Bulunamadı", stok_kodu: details.stok_kodu || "Bulunamadı", eski_fiyat: details.eski_fiyat || "İndirim Yok", yeni_fiyat: temizFiyat, link: pLink
                        });
                    }
                } catch(e) {}
            }
        } catch (e) {}
    }
    return allProductDetails;
}


// 2. SENİN ORİJİNAL HEURISTIC KODUN (SERVER İÇİN UYARLANDI)
async function scrapeHeuristic(page, site) {
    let siteUrunleri = [];
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const urunler = await page.evaluate(() => {
        let liste = [];
        const adaylar = Array.from(document.querySelectorAll('span, div, p, b, strong, ins'));
        
        adaylar.forEach(el => {
            const text = el.innerText.trim();
            if (/(?=.*\d)(TL|₺|TRY|Lira)/i.test(text) && text.length < 30) {
                let kart = el.closest('a')?.parentElement.closest('div, li') || el.closest('div, li');
                if (kart) {
                    const a = kart.querySelector('a');
                    if (a) {
                        const tamAd = a.getAttribute('title') || kart.querySelector('img')?.getAttribute('alt') || a.innerText.trim();
                        if (tamAd && tamAd.length > 5) {
                            liste.push({ urun_adi: tamAd.replace(/\n/g, ' ').trim(), fiyat_guncel: text.replace(/\s+/g, ' ').trim(), link: a.href });
                        }
                    }
                }
            }
        });
        return liste;
    });

    for(let u of urunler){
        const temizFiyat = veriTemizle(u.urun_adi, u.link, u.fiyat_guncel);
        if(temizFiyat){
            siteUrunleri.push({ magaza: site.magaza_adi, urun_adi: u.urun_adi, marka: "Bilinmiyor", kategori: "Bilinmiyor", stok_kodu: "Bilinmiyor", eski_fiyat: "Bilinmiyor", yeni_fiyat: temizFiyat, link: u.link });
        }
    }
    return siteUrunleri;
}

// 3. SENİN ORİJİNAL CUSTOM KODUN (SERVER İÇİN UYARLANDI)
async function scrapeCustom(page, site) {
    let siteUrunleri = [];
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const urunler = await page.evaluate((s, url) => {
        let items =[];
        document.querySelectorAll(s.kart).forEach(el => {
            const isimEl = el.querySelector(s.isim); 
            const fiyatEl = el.querySelector(s.fiyat);
            if (isimEl && fiyatEl) { 
                items.push({ urun_adi: isimEl.innerText, fiyat_guncel: fiyatEl.innerText, link: el.querySelector('a')?.href || url }); 
            }
        });
        return items;
    }, site.sel, site.url);

    for(let u of urunler){
        const temizFiyat = veriTemizle(u.urun_adi, u.link, u.fiyat_guncel);
        if(temizFiyat){
            siteUrunleri.push({ magaza: site.magaza_adi, urun_adi: u.urun_adi, marka: "Bilinmiyor", kategori: "Bilinmiyor", stok_kodu: "Bilinmiyor", eski_fiyat: "Bilinmiyor", yeni_fiyat: temizFiyat, link: u.link });
        }
    }
    return siteUrunleri;
}

module.exports = { runCrawler, SITES_TO_CRAWL }; // server.js'in de site listesini okuyabilmesi için export ediyoruz

// --- END OF FILE crawler.js ---